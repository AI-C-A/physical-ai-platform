import { describe, expect, it } from 'vitest';

import { simulationOrigin, simulationRelayUrl } from './simulation-origin';

describe('simulationOrigin', () => {
  it('기본 Funnel origin을 뒤 슬래시 없이 돌려준다', () => {
    expect(simulationOrigin()).toBe('https://orca.tail58a6fa.ts.net');
  });
});

describe('simulationRelayUrl', () => {
  it('wss 릴레이 주소(기본 방)를 만든다', () => {
    expect(simulationRelayUrl()).toBe('wss://orca.tail58a6fa.ts.net/party');
  });
});
