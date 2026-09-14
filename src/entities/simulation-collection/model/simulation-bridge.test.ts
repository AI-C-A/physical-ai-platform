import { describe, expect, it } from 'vitest';

import { describeBridgeEvent, parseSimulationBridgeSnapshot } from './simulation-bridge';

describe('parseSimulationBridgeSnapshot', () => {
  it('스냅샷을 검증해 손 관절·임무·이벤트를 내부 모델로 바꾼다', () => {
    const snapshot = parseSimulationBridgeSnapshot({
      source: 'aaf-monitor', t: 'snapshot', mode: 'vr', recording: true,
      stats: { frames: 362, events: 11, tracked: 38, episodes: 1, duration: 15.8 },
      peers: [{ name: 'OP-11', mode: 'vr' }, { name: '', mode: 'weird' }, { nope: 1 }],
      head: [0, 1.6, -2], heldCount: 1,
      hands: [
        { id: 'right', kind: 'hand', p: [0.3, 1.1, -1.8], grab: true, held: 'radio_battery', joints: [[0, 0, 0], null, [1, 1, 1]] },
        { id: 'broken', kind: 'hand', p: ['x', 0, 0] },
      ],
      task: { id: 't01_radio', tier: 1, time: 15.8, hint: '안테나', steps: [{ label: '삽입', state: 'done' }, { label: '체결', state: 'bogus' }] },
      events: [{ seq: 2, name: 'snap', data: { tag: 'radio_antenna', zone: 'radio_antenna_port' } }, { bad: true }],
    }, 1_000);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.mode).toBe('vr');
    expect(snapshot?.stats).toEqual({ frames: 362, events: 11, tracked: 38, episodes: 1, durationSeconds: 15.8 });
    expect(snapshot?.peers).toEqual([{ id: 'OP-11', name: 'OP-11', mode: 'vr' }]);
    expect(snapshot?.hands).toHaveLength(1);
    expect(snapshot?.hands[0]).toMatchObject({ id: 'right', kind: 'hand', grabbing: true, held: 'radio_battery' });
    expect(snapshot?.hands[0]?.joints).toEqual([[0, 0, 0], null, [1, 1, 1]]);
    // 태스크 스펙에서 제목·번호·목표 시간을 채운다.
    expect(snapshot?.task).toMatchObject({ taskId: 't01_radio', title: '전술 무전기 준비', index: 1, parSeconds: 40, tier: 1, timeSeconds: 15.8 });
    expect(snapshot?.task?.steps).toEqual([{ label: '삽입', state: 'done' }, { label: '체결', state: 'unknown' }]);
    expect(snapshot?.events).toEqual([{ seq: 2, kind: 'snap', detail: 'radio_antenna → radio_antenna_port 결합' }]);
  });

  it('hello와 task 없는 스냅샷도 받는다', () => {
    const snapshot = parseSimulationBridgeSnapshot({ source: 'aaf-monitor', t: 'hello', stats: {}, hands: [], events: [] }, 5);
    expect(snapshot?.task).toBeNull();
    expect(snapshot?.stats.frames).toBe(0);
  });

  it.each([null, 'x', {}, { source: 'other', t: 'snapshot' }, { source: 'aaf-monitor', t: 'nope' }])('형식이 다른 %j는 무시한다', (value) => {
    expect(parseSimulationBridgeSnapshot(value, 0)).toBeNull();
  });
});

describe('describeBridgeEvent', () => {
  it.each([
    ['grasp', { tag: 'radio_battery' }, 'radio_battery 잡음'],
    ['snap', { tag: 'battery', zone: 'bay' }, 'battery → bay 결합'],
    ['press', { id: 'radio_power' }, 'radio_power 누름'],
    ['screw', { id: 'bolt_a', action: 'out' }, 'bolt_a 풂'],
    ['episode_end', { result: 'success' }, '에피소드 녹화 종료 · success'],
  ])('%s를 사람이 읽을 문구로 바꾼다', (name, data, expected) => {
    expect(describeBridgeEvent(name, data)).toBe(expected);
  });
});
