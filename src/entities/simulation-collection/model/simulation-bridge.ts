import type { SimulationHandSample, SimulationPeer, SimulationTaskStep } from './simulation-party';
import { findSimulationTask } from './simulation-tasks';

/**
 * 임베드된 시뮬레이션(iframe)이 부모 창으로 postMessage하는 스냅샷.
 *
 * 릴레이와 달리 방을 거치지 않고 iframe → 콘솔로 바로 오므로, 같은 화면에서 시뮬레이션을
 * 돌리는 시연에서 릴레이 연결 여부와 무관하게 센서 값이 뜬다. 좌표는 시뮬레이션 월드(m).
 */
export interface SimulationBridgeSnapshot {
  readonly receivedAtMs: number;
  readonly mode: SimulationPeer['mode'];
  readonly recording: boolean;
  readonly stats: { readonly frames: number; readonly events: number; readonly tracked: number; readonly episodes: number; readonly durationSeconds: number };
  readonly peers: readonly SimulationPeer[];
  readonly head: readonly [number, number, number] | null;
  readonly heldCount: number;
  readonly hands: readonly SimulationBridgeHand[];
  readonly task: SimulationBridgeTask | null;
  readonly events: readonly SimulationBridgeEvent[];
}

export interface SimulationBridgeHand extends SimulationHandSample {
  readonly held: string | null;
  /** 손 관절 25점의 월드 좌표(WebXR 관절 순서). 없으면 null. */
  readonly joints: readonly (readonly [number, number, number] | null)[] | null;
}

export interface SimulationBridgeTask {
  readonly taskId: string;
  readonly title: string;
  readonly index: number;
  readonly tier: number;
  readonly timeSeconds: number;
  readonly parSeconds: number;
  readonly hint: string;
  readonly steps: readonly SimulationTaskStep[];
}

export interface SimulationBridgeEvent {
  readonly seq: number;
  readonly kind: string;
  readonly detail: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFinite3 = (value: unknown): value is readonly [number, number, number] => Array.isArray(value)
  && value.length >= 3 && value.slice(0, 3).every((item) => typeof item === 'number' && Number.isFinite(item));
const num = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function parseMode(value: unknown): SimulationPeer['mode'] {
  return value === 'vr' || value === 'desktop' || value === 'monitor' ? value : 'unknown';
}

function parseHand(value: unknown): SimulationBridgeHand | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !isFinite3(value.p)) return null;
  const kind = value.kind === 'desktop' || value.kind === 'controller' || value.kind === 'hand' ? value.kind : 'unknown';
  const joints = Array.isArray(value.joints)
    ? value.joints.map((joint) => (isFinite3(joint) ? [joint[0], joint[1], joint[2]] as const : null))
    : null;
  return { id: value.id, kind, position: [value.p[0], value.p[1], value.p[2]], grabbing: value.grab === true, held: typeof value.held === 'string' ? value.held : null, joints };
}

function parseStep(value: unknown): SimulationTaskStep {
  if (!isRecord(value)) return { label: '', state: 'unknown' };
  const state = value.state === 'todo' || value.state === 'active' || value.state === 'done' ? value.state : 'unknown';
  return { label: text(value.label), state };
}

/** 로거 이벤트 이름을 사람이 읽을 수 있는 문구로 바꾼다. 물체는 태그나 번호로만 식별한다. */
export function describeBridgeEvent(name: string, data: Record<string, unknown>): string {
  const target = text(data.tag) || text(data.id);
  switch (name) {
    case 'grasp': return `${target || '물체'} 잡음`;
    case 'release': return `${target || '물체'} 놓음`;
    case 'snap': return `${target || '물체'}${data.zone === undefined ? '' : ` → ${text(data.zone)}`} 결합`;
    case 'press': return `${target || '버튼'} 누름`;
    case 'latch': return `${target || '래치'} 조작`;
    case 'knob_turn': return `${target || '노브'} 회전`;
    case 'knob_grab': return `${target || '노브'} 잡음`;
    case 'knob_release': return `${target || '노브'} 놓음`;
    case 'align': return `${target || '부품'} 정렬`;
    case 'misalign': return `${target || '부품'} 정렬 이탈`;
    case 'insert': return `${target || '부품'} 삽입`;
    case 'plug': return `${target || '커넥터'} 연결`;
    case 'screw': return `${target || '볼트'} ${data.action === 'in' ? '조임' : data.action === 'out' ? '풂' : '조작'}`;
    case 'extract': return `${target || '부품'} 분리`;
    case 'inspect': return `${target || '품목'} 확인`;
    case 'classify': return `${target || '품목'} 분류`;
    case 'episode_start': return '에피소드 녹화 시작';
    case 'episode_end': return `에피소드 녹화 종료${data.result === undefined ? '' : ` · ${text(data.result)}`}`;
    default: return target ? `${name} · ${target}` : name;
  }
}

/** postMessage로 받은 값을 검증해 스냅샷으로 바꾼다. 형식이 다르면 null(무시). */
export function parseSimulationBridgeSnapshot(value: unknown, receivedAtMs: number): SimulationBridgeSnapshot | null {
  if (!isRecord(value) || value.source !== 'aaf-monitor' || (value.t !== 'snapshot' && value.t !== 'hello')) return null;
  const statsValue = isRecord(value.stats) ? value.stats : {};
  const taskValue = isRecord(value.task) ? value.task : null;
  const taskSpec = taskValue !== null && typeof taskValue.id === 'string' ? findSimulationTask(taskValue.id) : null;
  return {
    receivedAtMs,
    mode: parseMode(value.mode),
    recording: value.recording === true,
    stats: {
      frames: num(statsValue.frames),
      events: num(statsValue.events),
      tracked: num(statsValue.tracked),
      episodes: num(statsValue.episodes),
      durationSeconds: num(statsValue.duration),
    },
    peers: Array.isArray(value.peers)
      ? value.peers.flatMap((peer): SimulationPeer[] => (isRecord(peer) && typeof peer.name === 'string' && peer.name !== ''
        ? [{ id: peer.name, name: peer.name, mode: parseMode(peer.mode) }] : []))
      : [],
    head: isFinite3(value.head) ? [value.head[0], value.head[1], value.head[2]] : null,
    heldCount: num(value.heldCount),
    hands: Array.isArray(value.hands) ? value.hands.map(parseHand).filter((hand): hand is SimulationBridgeHand => hand !== null) : [],
    task: taskValue === null || typeof taskValue.id !== 'string'
      ? null
      : {
        taskId: taskValue.id,
        title: text(taskValue.title) || taskSpec?.title || taskValue.id,
        index: num(taskValue.index, taskSpec?.index ?? 0),
        tier: num(taskValue.tier),
        timeSeconds: num(taskValue.time),
        parSeconds: num(taskValue.par, taskSpec?.parSeconds ?? 0),
        hint: text(taskValue.hint),
        steps: Array.isArray(taskValue.steps) ? taskValue.steps.map(parseStep) : [],
      },
    events: Array.isArray(value.events)
      ? value.events.flatMap((event): SimulationBridgeEvent[] => {
        if (!isRecord(event) || typeof event.seq !== 'number' || typeof event.name !== 'string') return [];
        return [{ seq: event.seq, kind: event.name, detail: describeBridgeEvent(event.name, isRecord(event.data) ? event.data : {}) }];
      })
      : [],
  };
}
