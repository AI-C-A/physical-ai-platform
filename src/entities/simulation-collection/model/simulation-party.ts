/**
 * 시뮬레이션(WebXR Action Annotation Factory) 협업 릴레이의 메시지 모델.
 *
 * 릴레이는 같은 방의 참가자가 보낸 JSON을 그대로 전달하고 `from`만 찍는다.
 * 위치는 시뮬레이션 월드 좌표(미터, y-up)이며 물체는 인덱스로만 식별되므로
 * 모니터는 물체의 이름을 알 수 없고 번호로만 보여준다.
 */

export type SimulationPeerMode = 'vr' | 'desktop' | 'monitor' | 'unknown';

export interface SimulationPeer {
  readonly id: string;
  readonly name: string;
  readonly mode: SimulationPeerMode;
}

export interface SimulationHandSample {
  readonly id: string;
  /** desktop: 마우스 포인터 손, controller: 컨트롤러, hand: 핸드트래킹 */
  readonly kind: 'desktop' | 'controller' | 'hand' | 'unknown';
  readonly position: readonly [number, number, number];
  readonly grabbing: boolean;
}

export interface SimulationHeldSample {
  readonly grabbableIndex: number;
  readonly hand: string;
}

export interface SimulationTaskStep {
  readonly label: string;
  readonly state: 'todo' | 'active' | 'done' | 'unknown';
}

export interface SimulationTaskResult {
  readonly rank: string;
  readonly timeSeconds: number;
  readonly errors: number;
  readonly frames: number;
  readonly best: boolean;
}

export type SimulationPartyMessage =
  | { readonly t: 'welcome'; readonly id: string; readonly room: string; readonly peers: readonly SimulationPeer[] }
  | { readonly t: 'join'; readonly peer: SimulationPeer }
  | { readonly t: 'leave'; readonly id: string }
  | { readonly t: 'mode'; readonly from: string; readonly mode: SimulationPeerMode }
  | {
    readonly t: 'pose';
    readonly from: string;
    readonly head: readonly [number, number, number] | null;
    readonly hands: readonly SimulationHandSample[];
    readonly held: readonly SimulationHeldSample[];
  }
  | { readonly t: 'grab' | 'release'; readonly from: string; readonly grabbableIndex: number; readonly hand: string }
  | { readonly t: 'snap'; readonly from: string; readonly grabbableIndex: number; readonly zoneIndex: number }
  | { readonly t: 'press'; readonly from: string; readonly label: string }
  | { readonly t: 'latch'; readonly from: string; readonly label: string; readonly open: boolean }
  | { readonly t: 'knob'; readonly from: string; readonly label: string; readonly angle: number }
  | { readonly t: 'knob_grab' | 'knob_release'; readonly from: string; readonly label: string; readonly hand: string }
  | { readonly t: 'task_start'; readonly from: string; readonly taskId: string; readonly seed: number | null; readonly tier: number }
  | {
    readonly t: 'task_state';
    readonly from: string;
    readonly taskId: string;
    readonly steps: readonly SimulationTaskStep[];
    readonly hint: string;
    readonly timeSeconds: number;
  }
  | {
    readonly t: 'task_end';
    readonly from: string;
    readonly taskId: string;
    readonly outcome: string;
    readonly result: SimulationTaskResult | null;
  }
  | { readonly t: 'need_state'; readonly from: string }
  | { readonly t: 'state'; readonly from: string; readonly payload: Readonly<Record<string, unknown>> };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFinite3 = (value: unknown): value is readonly [number, number, number] => Array.isArray(value)
  && value.length >= 3 && value.slice(0, 3).every((item) => typeof item === 'number' && Number.isFinite(item));
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const index = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);

function parseMode(value: unknown): SimulationPeerMode {
  return value === 'vr' || value === 'desktop' || value === 'monitor' ? value : 'unknown';
}

function parsePeer(value: unknown): SimulationPeer | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id === '') return null;
  return { id: value.id, name: text(value.name) || value.id, mode: parseMode(value.mode) };
}

function parseHand(value: unknown): SimulationHandSample | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !isFinite3(value.p)) return null;
  const kind = value.k === 'desktop' || value.k === 'controller' || value.k === 'hand' ? value.k : 'unknown';
  return { id: value.id, kind, position: [value.p[0], value.p[1], value.p[2]], grabbing: value.g === 1 || value.g === true };
}

function parseStep(value: unknown): SimulationTaskStep {
  if (!isRecord(value)) return { label: '', state: 'unknown' };
  const state = value.state === 'todo' || value.state === 'active' || value.state === 'done' ? value.state : 'unknown';
  return { label: text(value.label), state };
}

function parseResult(value: unknown): SimulationTaskResult | null {
  if (!isRecord(value)) return null;
  return {
    rank: text(value.rank) || '-',
    timeSeconds: finite(value.time, 0),
    errors: finite(value.errors, 0),
    frames: finite(value.frames, 0),
    best: value.best === true,
  };
}

/** 릴레이가 보낸 값을 검증해 내부 모델로 바꾼다. 형식이 맞지 않으면 null을 돌려주고 무시한다. */
export function parseSimulationPartyMessage(value: unknown): SimulationPartyMessage | null {
  if (!isRecord(value) || typeof value.t !== 'string') return null;
  const from = text(value.from);
  switch (value.t) {
    case 'welcome': {
      if (typeof value.id !== 'string') return null;
      const peers = Array.isArray(value.peers) ? value.peers.map(parsePeer).filter((peer) => peer !== null) : [];
      return { t: 'welcome', id: value.id, room: text(value.room), peers };
    }
    case 'join': {
      const peer = parsePeer(value);
      return peer === null ? null : { t: 'join', peer };
    }
    case 'leave':
      return typeof value.id === 'string' ? { t: 'leave', id: value.id } : null;
    case 'mode':
      return from === '' ? null : { t: 'mode', from, mode: parseMode(value.mode) };
    case 'pose': {
      if (from === '') return null;
      const hands = Array.isArray(value.hands) ? value.hands.map(parseHand).filter((hand) => hand !== null) : [];
      const held = Array.isArray(value.held)
        ? value.held.flatMap((item): SimulationHeldSample[] => {
          if (!isRecord(item)) return [];
          const grabbableIndex = index(item.g);
          return grabbableIndex === null ? [] : [{ grabbableIndex, hand: text(item.hand) }];
        })
        : [];
      return { t: 'pose', from, head: isFinite3(value.h) ? [value.h[0], value.h[1], value.h[2]] : null, hands, held };
    }
    case 'grab':
    case 'release': {
      const grabbableIndex = index(value.g);
      return from === '' || grabbableIndex === null ? null : { t: value.t, from, grabbableIndex, hand: text(value.hand) };
    }
    case 'snap': {
      const grabbableIndex = index(value.g);
      const zoneIndex = index(value.z);
      return from === '' || grabbableIndex === null || zoneIndex === null ? null : { t: 'snap', from, grabbableIndex, zoneIndex };
    }
    case 'press':
      return from === '' ? null : { t: 'press', from, label: text(value.b) };
    case 'latch':
      return from === '' ? null : { t: 'latch', from, label: text(value.l), open: value.open === true };
    case 'knob':
      return from === '' ? null : { t: 'knob', from, label: text(value.k), angle: finite(value.a, 0) };
    case 'knob_grab':
    case 'knob_release':
      return from === '' ? null : { t: value.t, from, label: text(value.k), hand: text(value.hand) };
    case 'task_start':
      return from === '' || typeof value.id !== 'string'
        ? null
        : { t: 'task_start', from, taskId: value.id, seed: typeof value.seed === 'number' ? value.seed : null, tier: finite(value.tier, 0) };
    case 'task_state':
      return from === '' || typeof value.id !== 'string'
        ? null
        : {
          t: 'task_state',
          from,
          taskId: value.id,
          steps: Array.isArray(value.steps) ? value.steps.map(parseStep) : [],
          hint: text(value.hint),
          timeSeconds: finite(value.time, 0),
        };
    case 'task_end':
      return from === '' || typeof value.id !== 'string'
        ? null
        : { t: 'task_end', from, taskId: value.id, outcome: text(value.outcome) || 'unknown', result: parseResult(value.result) };
    case 'need_state':
      return from === '' ? null : { t: 'need_state', from };
    case 'state': {
      if (from === '') return null;
      // 릴레이 봉투(t·from·to)만 벗기고 월드 스냅샷은 해석하지 않은 채 전달한다.
      const payload = Object.fromEntries(Object.entries(value).filter(([key]) => !['t', 'from', 'to'].includes(key)));
      return { t: 'state', from, payload };
    }
    default:
      return null;
  }
}
