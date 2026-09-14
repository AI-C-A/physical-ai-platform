import { describe, expect, it } from 'vitest';

import { parseSimulationPartyMessage } from './simulation-party';

describe('parseSimulationPartyMessage', () => {
  it('welcome의 참가자 목록을 내부 모델로 바꾼다', () => {
    expect(parseSimulationPartyMessage({
      t: 'welcome', id: 'p3', room: 'capture-hd-0101',
      peers: [{ id: 'p1', name: 'OP-42', mode: 'vr' }, { id: 'p2', name: '', mode: 'weird' }, { nope: true }],
    })).toEqual({
      t: 'welcome', id: 'p3', room: 'capture-hd-0101',
      peers: [{ id: 'p1', name: 'OP-42', mode: 'vr' }, { id: 'p2', name: 'p2', mode: 'unknown' }],
    });
  });

  it('pose는 손 위치·잡기 상태와 들고 있는 물체만 남긴다', () => {
    expect(parseSimulationPartyMessage({
      t: 'pose', from: 'p1', h: [1, 1.6, -2], hq: [0, 0, 0, 1], m: 'xr',
      hands: [
        { id: 'left', k: 'hand', p: [0.1, 1.2, -1.9], q: [0, 0, 0, 1], g: 1, mp: [0, 0, 0] },
        { id: 'right', k: 'controller', p: [0.3, 1.1, -1.8], q: [0, 0, 0, 1], g: 0 },
        { id: 'broken', k: 'hand', p: ['x', 0, 0] },
      ],
      held: [{ g: 7, hand: 'left', p: [0, 0, 0], q: [0, 0, 0, 1] }, { g: -1 }, 'junk'],
    })).toEqual({
      t: 'pose', from: 'p1', head: [1, 1.6, -2],
      hands: [
        { id: 'left', kind: 'hand', position: [0.1, 1.2, -1.9], grabbing: true },
        { id: 'right', kind: 'controller', position: [0.3, 1.1, -1.8], grabbing: false },
      ],
      held: [{ grabbableIndex: 7, hand: 'left' }],
    });
  });

  it('임무 메시지는 단계 상태와 결과를 검증한다', () => {
    expect(parseSimulationPartyMessage({ t: 'task_start', from: 'p1', id: 't01_radio', seed: 12, tier: 1 }))
      .toEqual({ t: 'task_start', from: 'p1', taskId: 't01_radio', seed: 12, tier: 1 });
    expect(parseSimulationPartyMessage({
      t: 'task_state', from: 'p1', id: 't01_radio', steps: [{ label: '배터리 삽입', state: 'done' }, { label: '안테나', state: 'bogus' }], hint: '노브를 돌리십시오', time: 12.5,
    })).toEqual({
      t: 'task_state', from: 'p1', taskId: 't01_radio',
      steps: [{ label: '배터리 삽입', state: 'done' }, { label: '안테나', state: 'unknown' }], hint: '노브를 돌리십시오', timeSeconds: 12.5,
    });
    expect(parseSimulationPartyMessage({
      t: 'task_end', from: 'p1', id: 't01_radio', outcome: 'success', result: { rank: 'A', time: 31.2, errors: 0, frames: 936, best: true },
    })).toEqual({
      t: 'task_end', from: 'p1', taskId: 't01_radio', outcome: 'success', result: { rank: 'A', timeSeconds: 31.2, errors: 0, frames: 936, best: true },
    });
    expect(parseSimulationPartyMessage({ t: 'task_end', from: 'p1', id: 't01_radio', outcome: 'aborted', result: null }))
      .toEqual({ t: 'task_end', from: 'p1', taskId: 't01_radio', outcome: 'aborted', result: null });
  });

  it('state 스냅샷은 봉투만 벗기고 내용은 그대로 둔다', () => {
    expect(parseSimulationPartyMessage({ t: 'state', from: 'p1', to: 'p9', objects: [{ i: 0 }], knobs: [], latches: [], task: null }))
      .toEqual({ t: 'state', from: 'p1', payload: { objects: [{ i: 0 }], knobs: [], latches: [], task: null } });
  });

  it.each([
    null, 'text', { t: 5 }, { t: 'pose' }, { t: 'grab', from: 'p1', g: -3 }, { t: 'snap', from: 'p1', g: 1 }, { t: 'unknown_kind', from: 'p1' },
  ])('형식이 맞지 않는 %j는 무시한다', (value) => {
    expect(parseSimulationPartyMessage(value)).toBeNull();
  });
});
