import { findSimulationTask } from './simulation-tasks';
import type {
  SimulationHandSample,
  SimulationPartyMessage,
  SimulationPeer,
  SimulationTaskResult,
  SimulationTaskStep,
} from './simulation-party';

export type SimulationRelayState = 'connecting' | 'connected' | 'reconnecting' | 'closed';

export type SimulationTaskOutcome = 'success' | 'recovered' | 'aborted' | 'unknown';

/** 작업자 한 명이 릴레이로 보내는 자세 스트림의 현재 값과 누적 수. */
export interface SimulationOperatorSnapshot {
  readonly peerId: string;
  readonly name: string;
  readonly mode: SimulationPeer['mode'];
  readonly head: readonly [number, number, number] | null;
  readonly hands: readonly SimulationHandSample[];
  readonly heldCount: number;
  readonly frameCount: number;
  readonly lastPoseAtMs: number | null;
  /** 최근 자세 패킷 간격의 지수 이동 평균으로 계산한 수신 속도. 첫 패킷 전에는 null. */
  readonly poseRateHz: number | null;
}

export interface SimulationEventEntry {
  readonly id: number;
  readonly atMs: number;
  readonly peerName: string;
  readonly kind: string;
  readonly detail: string;
}

export interface SimulationTaskProgress {
  readonly taskId: string;
  readonly runnerId: string;
  readonly runnerName: string;
  readonly tier: number;
  readonly startedAtMs: number;
  readonly steps: readonly SimulationTaskStep[];
  readonly hint: string;
  readonly timeSeconds: number;
}

export interface SimulationEpisodeRecord {
  readonly id: number;
  readonly taskId: string;
  readonly runnerName: string;
  readonly outcome: SimulationTaskOutcome;
  readonly result: SimulationTaskResult | null;
  readonly endedAtMs: number;
}

export interface SimulationMonitorState {
  readonly relay: SimulationRelayState;
  readonly selfId: string | null;
  readonly peers: readonly SimulationPeer[];
  readonly operators: Readonly<Record<string, SimulationOperatorSnapshot>>;
  readonly frameCount: number;
  readonly eventCount: number;
  readonly task: SimulationTaskProgress | null;
  readonly episodes: readonly SimulationEpisodeRecord[];
  readonly events: readonly SimulationEventEntry[];
  readonly lastMessageAtMs: number | null;
  readonly nextEntryId: number;
}

export const EVENT_LOG_LIMIT = 60;
export const EPISODE_LOG_LIMIT = 24;

export const INITIAL_SIMULATION_MONITOR_STATE: SimulationMonitorState = {
  relay: 'connecting',
  selfId: null,
  peers: [],
  operators: {},
  frameCount: 0,
  eventCount: 0,
  task: null,
  episodes: [],
  events: [],
  lastMessageAtMs: null,
  nextEntryId: 1,
};

interface ReduceOptions {
  readonly nowMs: number;
  /** 이 이름의 참가자는 자기 화면(모니터용 iframe)이므로 수집 통계에서 제외한다. */
  readonly ignoredPeerNames: readonly string[];
}

const RATE_SMOOTHING = 0.2;

function taskTitle(taskId: string): string {
  return findSimulationTask(taskId)?.title ?? taskId;
}

function parseOutcome(value: string): SimulationTaskOutcome {
  return value === 'success' || value === 'recovered' || value === 'aborted' ? value : 'unknown';
}

function describeEvent(message: SimulationPartyMessage): { kind: string; detail: string } | null {
  switch (message.t) {
    case 'grab':
      return { kind: 'grasp', detail: `물체 #${String(message.grabbableIndex)} 잡음 · ${message.hand || '손'}` };
    case 'release':
      return { kind: 'release', detail: `물체 #${String(message.grabbableIndex)} 놓음 · ${message.hand || '손'}` };
    case 'snap':
      return { kind: 'snap', detail: `물체 #${String(message.grabbableIndex)} → 슬롯 #${String(message.zoneIndex)} 결합` };
    case 'press':
      return { kind: 'press', detail: `버튼 ${message.label || '?'} 누름` };
    case 'latch':
      return { kind: 'latch', detail: `래치 ${message.label || '?'} ${message.open ? '열림' : '닫힘'}` };
    case 'knob':
      return { kind: 'knob_turn', detail: `노브 ${message.label || '?'} ${Math.round((message.angle * 180) / Math.PI)}°` };
    case 'knob_grab':
      return { kind: 'knob_grab', detail: `노브 ${message.label || '?'} 잡음` };
    case 'knob_release':
      return { kind: 'knob_release', detail: `노브 ${message.label || '?'} 놓음` };
    case 'task_start':
      return { kind: 'episode_start', detail: `임무 ${taskTitle(message.taskId)} 시작${message.tier > 0 ? ' · 숙련' : ''}` };
    case 'task_end': {
      const outcome = parseOutcome(message.outcome);
      const label = outcome === 'aborted' ? '중단' : outcome === 'unknown' ? '종료' : '완료';
      const result = message.result === null ? '' : ` · RANK ${message.result.rank} · ${message.result.timeSeconds.toFixed(1)}s`;
      return { kind: 'episode_end', detail: `임무 ${taskTitle(message.taskId)} ${label}${result}` };
    }
    default:
      return null;
  }
}

function peerName(state: SimulationMonitorState, id: string): string {
  return state.peers.find((peer) => peer.id === id)?.name ?? id;
}

/** 통계에 반영할 참가자. 방 목록에 없거나 자기 화면이면 null이다. */
function trackedPeer(state: SimulationMonitorState, id: string, options: ReduceOptions): SimulationPeer | null {
  const peer = state.peers.find((item) => item.id === id);
  return peer === undefined || options.ignoredPeerNames.includes(peer.name) ? null : peer;
}

function isIgnored(state: SimulationMonitorState, id: string, options: ReduceOptions): boolean {
  return trackedPeer(state, id, options) === null;
}

function appendBounded<TValue>(list: readonly TValue[], value: TValue, limit: number): readonly TValue[] {
  const next = [...list, value];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function setSimulationRelayState(state: SimulationMonitorState, relay: SimulationRelayState): SimulationMonitorState {
  if (relay === state.relay) return state;
  // 연결이 끊기면 방 구성원은 릴레이가 다시 welcome으로 알려줄 때까지 알 수 없다.
  return relay === 'connected' ? { ...state, relay } : { ...state, relay, selfId: null, peers: [], operators: {}, task: null };
}

/** 릴레이 메시지 하나를 상태에 반영한다. 고주기 자세는 누적하지 않고 최신 값과 개수만 유지한다. */
export function reduceSimulationMonitor(
  state: SimulationMonitorState,
  message: SimulationPartyMessage,
  options: ReduceOptions,
): SimulationMonitorState {
  const base = { ...state, lastMessageAtMs: options.nowMs };
  switch (message.t) {
    case 'welcome':
      return { ...base, relay: 'connected', selfId: message.id, peers: message.peers };
    case 'join':
      return { ...base, peers: [...state.peers.filter((peer) => peer.id !== message.peer.id), message.peer] };
    case 'leave': {
      const operators = { ...state.operators };
      delete operators[message.id];
      return {
        ...base,
        peers: state.peers.filter((peer) => peer.id !== message.id),
        operators,
        task: state.task?.runnerId === message.id ? null : state.task,
      };
    }
    case 'mode': {
      const operator = state.operators[message.from];
      return {
        ...base,
        peers: state.peers.map((peer) => (peer.id === message.from ? { ...peer, mode: message.mode } : peer)),
        operators: operator === undefined ? state.operators : { ...state.operators, [message.from]: { ...operator, mode: message.mode } },
      };
    }
    case 'pose': {
      const peer = trackedPeer(state, message.from, options);
      if (peer === null) return base;
      const previous = state.operators[message.from];
      const intervalMs = previous?.lastPoseAtMs == null ? null : options.nowMs - previous.lastPoseAtMs;
      const previousRate = previous?.poseRateHz ?? null;
      const poseRateHz = intervalMs === null || intervalMs <= 0
        ? previousRate
        : previousRate === null
          ? 1_000 / intervalMs
          : previousRate + RATE_SMOOTHING * (1_000 / intervalMs - previousRate);
      const snapshot: SimulationOperatorSnapshot = {
        peerId: message.from,
        name: peer.name,
        mode: peer.mode,
        head: message.head,
        hands: message.hands,
        heldCount: message.held.length,
        frameCount: (previous?.frameCount ?? 0) + 1,
        lastPoseAtMs: options.nowMs,
        poseRateHz,
      };
      return { ...base, frameCount: state.frameCount + 1, operators: { ...state.operators, [message.from]: snapshot } };
    }
    case 'task_start': {
      if (isIgnored(state, message.from, options)) return base;
      const steps = state.task?.taskId === message.taskId && state.task.runnerId === message.from ? state.task.steps : [];
      return logEvent({
        ...base,
        task: {
          taskId: message.taskId,
          runnerId: message.from,
          runnerName: peerName(state, message.from),
          tier: message.tier,
          startedAtMs: options.nowMs,
          steps,
          hint: '',
          timeSeconds: 0,
        },
      }, message, options);
    }
    case 'task_state': {
      if (isIgnored(state, message.from, options)) return base;
      const current = state.task?.taskId === message.taskId && state.task.runnerId === message.from ? state.task : null;
      return {
        ...base,
        task: {
          taskId: message.taskId,
          runnerId: message.from,
          runnerName: peerName(state, message.from),
          tier: current?.tier ?? 0,
          // 시작 메시지를 놓친 늦은 합류는 경과 시간을 되짚어 시작 시각을 추정한다.
          startedAtMs: current?.startedAtMs ?? options.nowMs - message.timeSeconds * 1_000,
          steps: message.steps,
          hint: message.hint,
          timeSeconds: message.timeSeconds,
        },
      };
    }
    case 'task_end': {
      if (isIgnored(state, message.from, options)) return base;
      const record: SimulationEpisodeRecord = {
        id: state.nextEntryId,
        taskId: message.taskId,
        runnerName: peerName(state, message.from),
        outcome: parseOutcome(message.outcome),
        result: message.result,
        endedAtMs: options.nowMs,
      };
      return logEvent({
        ...base,
        nextEntryId: state.nextEntryId + 1,
        task: state.task?.runnerId === message.from ? null : state.task,
        episodes: appendBounded(state.episodes, record, EPISODE_LOG_LIMIT),
      }, message, options);
    }
    case 'grab':
    case 'release':
    case 'snap':
    case 'press':
    case 'latch':
    case 'knob':
    case 'knob_grab':
    case 'knob_release':
      return isIgnored(state, message.from, options) ? base : logEvent(base, message, options);
    case 'need_state':
    case 'state':
      return base;
  }
}

function logEvent(state: SimulationMonitorState, message: SimulationPartyMessage, options: ReduceOptions): SimulationMonitorState {
  const described = describeEvent(message);
  if (described === null || !('from' in message)) return state;
  const entry: SimulationEventEntry = {
    id: state.nextEntryId,
    atMs: options.nowMs,
    peerName: peerName(state, message.from),
    kind: described.kind,
    detail: described.detail,
  };
  return {
    ...state,
    nextEntryId: state.nextEntryId + 1,
    eventCount: state.eventCount + 1,
    events: appendBounded(state.events, entry, EVENT_LOG_LIMIT),
  };
}

/** 통계 대상 작업자. VR 참가자를 우선하고 없으면 먼저 들어온 참가자를 고른다. */
export function selectSimulationOperator(state: SimulationMonitorState, ignoredPeerNames: readonly string[]): SimulationOperatorSnapshot | null {
  const candidates = state.peers.filter((peer) => !ignoredPeerNames.includes(peer.name));
  const chosen = candidates.find((peer) => peer.mode === 'vr') ?? candidates[0];
  if (chosen === undefined) return null;
  return state.operators[chosen.id] ?? {
    peerId: chosen.id, name: chosen.name, mode: chosen.mode, head: null, hands: [], heldCount: 0, frameCount: 0, lastPoseAtMs: null, poseRateHz: null,
  };
}
