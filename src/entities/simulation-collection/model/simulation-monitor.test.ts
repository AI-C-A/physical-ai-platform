import { describe, expect, it } from 'vitest';

import {
  EVENT_LOG_LIMIT,
  INITIAL_SIMULATION_MONITOR_STATE,
  reduceSimulationMonitor,
  selectSimulationOperator,
  setSimulationRelayState,
  type SimulationMonitorState,
} from './simulation-monitor';
import { parseSimulationPartyMessage, type SimulationPartyMessage } from './simulation-party';

const IGNORED = ['MONITOR'];

function message(value: unknown): SimulationPartyMessage {
  const parsed = parseSimulationPartyMessage(value);
  if (parsed === null) throw new Error(`시험 메시지가 유효하지 않습니다: ${JSON.stringify(value)}`);
  return parsed;
}

function apply(state: SimulationMonitorState, values: readonly unknown[], startMs = 1_000, stepMs = 50): SimulationMonitorState {
  return values.reduce<SimulationMonitorState>(
    (current, value, index) => reduceSimulationMonitor(current, message(value), { nowMs: startMs + index * stepMs, ignoredPeerNames: IGNORED }),
    state,
  );
}

const welcome = { t: 'welcome', id: 'me', room: 'r', peers: [{ id: 'quest', name: 'OP-11', mode: 'vr' }, { id: 'stage', name: 'MONITOR', mode: 'desktop' }] };
const pose = (from: string) => ({ t: 'pose', from, h: [0, 1.6, 0], hands: [{ id: 'right', k: 'hand', p: [0.2, 1.1, -0.4], g: 1 }], held: [{ g: 3, hand: 'right' }] });

describe('reduceSimulationMonitor', () => {
  it('welcome으로 연결되고 자기 화면(MONITOR)의 자세는 통계에 넣지 않는다', () => {
    const state = apply(INITIAL_SIMULATION_MONITOR_STATE, [welcome, pose('quest'), pose('stage'), pose('quest')]);
    expect(state.relay).toBe('connected');
    expect(state.selfId).toBe('me');
    expect(state.frameCount).toBe(2);
    expect(Object.keys(state.operators)).toEqual(['quest']);
    const operator = selectSimulationOperator(state, IGNORED);
    expect(operator?.frameCount).toBe(2);
    expect(operator?.heldCount).toBe(1);
    expect(operator?.hands[0]?.grabbing).toBe(true);
    expect(operator?.poseRateHz).toBeCloseTo(1_000 / 100, 3);
  });

  it('VR 참가자를 작업자로 고르고 없으면 먼저 들어온 참가자를 고른다', () => {
    const desktopOnly = apply(INITIAL_SIMULATION_MONITOR_STATE, [
      { t: 'welcome', id: 'me', room: 'r', peers: [{ id: 'stage', name: 'MONITOR', mode: 'desktop' }] },
      { t: 'join', id: 'pc', name: 'OP-20', mode: 'desktop' },
    ]);
    expect(selectSimulationOperator(desktopOnly, IGNORED)?.name).toBe('OP-20');
    const withVr = apply(desktopOnly, [{ t: 'join', id: 'quest', name: 'OP-11', mode: 'vr' }]);
    expect(selectSimulationOperator(withVr, IGNORED)?.name).toBe('OP-11');
    expect(selectSimulationOperator(apply(withVr, [{ t: 'mode', from: 'quest', mode: 'desktop' }]), IGNORED)?.name).toBe('OP-20');
  });

  it('임무 시작·진행·종료를 따라가고 완료 에피소드를 남긴다', () => {
    let state = apply(INITIAL_SIMULATION_MONITOR_STATE, [
      welcome,
      { t: 'task_start', from: 'quest', id: 't01_radio', seed: 3, tier: 0 },
      { t: 'task_state', from: 'quest', id: 't01_radio', steps: [{ label: '배터리 삽입', state: 'done' }, { label: '안테나 체결', state: 'active' }], hint: '안테나를 체결하십시오', time: 8.2 },
    ]);
    expect(state.task).toMatchObject({ taskId: 't01_radio', runnerName: 'OP-11', timeSeconds: 8.2, hint: '안테나를 체결하십시오' });
    expect(state.task?.steps.map((step) => step.state)).toEqual(['done', 'active']);
    expect(state.events.at(-1)?.detail).toBe('임무 전술 무전기 준비 시작');

    state = apply(state, [{ t: 'task_end', from: 'quest', id: 't01_radio', outcome: 'success', result: { rank: 'S', time: 30.5, errors: 0, frames: 915, best: true } }]);
    expect(state.task).toBeNull();
    expect(state.episodes).toHaveLength(1);
    expect(state.episodes[0]).toMatchObject({ taskId: 't01_radio', outcome: 'success', result: { rank: 'S', frames: 915 } });
    expect(state.events.at(-1)?.detail).toBe('임무 전술 무전기 준비 완료 · RANK S · 30.5s');
    expect(state.eventCount).toBe(2);
  });

  it('시작을 놓친 진행 메시지는 경과 시간으로 시작 시각을 되짚는다', () => {
    const state = apply(INITIAL_SIMULATION_MONITOR_STATE, [
      welcome,
      { t: 'task_state', from: 'quest', id: 't03_ugv', steps: [], hint: '', time: 20 },
    ], 60_000, 0);
    expect(state.task?.startedAtMs).toBe(40_000);
  });

  it('조작 이벤트는 사람이 읽을 수 있는 설명으로 기록하고 개수를 제한한다', () => {
    const base = apply(INITIAL_SIMULATION_MONITOR_STATE, [welcome]);
    const state = apply(base, [
      { t: 'grab', from: 'quest', g: 4, hand: 'right' },
      { t: 'snap', from: 'quest', g: 4, z: 2, slot: 0 },
      { t: 'press', from: 'quest', b: 'radio_power' },
      { t: 'latch', from: 'quest', l: 'ugv_hatch', open: true },
      { t: 'knob', from: 'quest', k: 'radio_volume', a: Math.PI / 2 },
      { t: 'grab', from: 'stage', g: 1, hand: 'desktop' },
    ]);
    expect(state.events.map((event) => event.detail)).toEqual([
      '물체 #4 잡음 · right', '물체 #4 → 슬롯 #2 결합', '버튼 radio_power 누름', '래치 ugv_hatch 열림', '노브 radio_volume 90°',
    ]);
    expect(state.eventCount).toBe(5);

    const flooded = apply(base, Array.from({ length: EVENT_LOG_LIMIT + 15 }, (_, index) => ({ t: 'press', from: 'quest', b: `b${String(index)}` })));
    expect(flooded.events).toHaveLength(EVENT_LOG_LIMIT);
    expect(flooded.events[0]?.detail).toBe('버튼 b15 누름');
    expect(flooded.eventCount).toBe(EVENT_LOG_LIMIT + 15);
  });

  it('참가자가 나가면 작업자 통계와 진행 중 임무를 지운다', () => {
    const state = apply(INITIAL_SIMULATION_MONITOR_STATE, [
      welcome, pose('quest'), { t: 'task_start', from: 'quest', id: 't02_medkit', seed: 1, tier: 0 }, { t: 'leave', id: 'quest' },
    ]);
    expect(state.peers.map((peer) => peer.id)).toEqual(['stage']);
    expect(state.operators).toEqual({});
    expect(state.task).toBeNull();
    expect(state.frameCount).toBe(1);
  });

  it('연결이 끊기면 방 구성원을 비우고 누적 수치는 유지한다', () => {
    const connected = apply(INITIAL_SIMULATION_MONITOR_STATE, [welcome, pose('quest')]);
    const dropped = setSimulationRelayState(connected, 'reconnecting');
    expect(dropped.peers).toEqual([]);
    expect(dropped.operators).toEqual({});
    expect(dropped.frameCount).toBe(1);
    expect(setSimulationRelayState(dropped, 'reconnecting')).toBe(dropped);
  });
});
