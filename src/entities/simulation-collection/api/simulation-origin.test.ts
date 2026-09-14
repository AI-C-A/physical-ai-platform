import { describe, expect, it } from 'vitest';

import { deriveRoomCode, normalizeSimulationRoom, simulationPageUrl, simulationRelayUrl } from './simulation-origin';

describe('deriveRoomCode', () => {
  it('세션마다 결정적이고 헷갈리지 않는 6자리 코드를 만든다', () => {
    const code = deriveRoomCode('capture-hd-0101');
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXY2346789]{6}$/u);
    expect(deriveRoomCode('capture-hd-0101')).toBe(code);
    expect(deriveRoomCode('capture-hd-0102')).not.toBe(code);
  });
});

describe('simulationPageUrl', () => {
  it('방과 이름·관전 옵션을 쿼리로 붙인다', () => {
    expect(simulationPageUrl('AB2C4D', { name: 'MONITOR', spectate: true }))
      .toBe('https://orca.tail58a6fa.ts.net/?room=AB2C4D&name=MONITOR&spectate=1');
    expect(simulationPageUrl('AB2C4D')).toBe('https://orca.tail58a6fa.ts.net/?room=AB2C4D');
  });
});

describe('simulationRelayUrl', () => {
  it('wss 릴레이 주소를 만든다', () => {
    expect(simulationRelayUrl('AB2C4D')).toBe('wss://orca.tail58a6fa.ts.net/party?room=AB2C4D');
  });
});

describe('normalizeSimulationRoom', () => {
  it('공백은 다듬고 비면 기본 방이 된다', () => {
    expect(normalizeSimulationRoom('  demo  ')).toBe('demo');
    expect(normalizeSimulationRoom('   ')).toBe('main');
  });
});
