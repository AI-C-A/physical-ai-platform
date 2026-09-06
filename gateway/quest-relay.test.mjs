import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createQuestRelayHandler } from './quest-relay.mjs';
import { createGatewayRequestHandler } from './server.mjs';

async function setup(t, handler = createQuestRelayHandler()) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const origin = `http://127.0.0.1:${server.address().port}/api/quest`;
  return async (path, method = 'GET', token, body) => {
    const response = await fetch(`${origin}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? method === 'POST' ? { body: '{}' } : {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
}

const observation = {
  deviceMonotonicTimestampMs: 123,
  hands: {
    left: { sourcePresent: false, poseObserved: false, joints: [] },
    right: { sourcePresent: false, poseObserved: false, joints: [] },
  },
};

test('PC 세션 생성 → 별도 Quest 연결 → 실제 HTTP 프레임 전달 → 종료', async (t) => {
  const request = await setup(t, createGatewayRequestHandler({}));
  const { status, body: session } = await request('/sessions', 'POST');
  assert.equal(status, 201);
  const path = `/sessions/${session.sessionId}`;
  const { body: sender } = await request('/pair', 'POST', undefined, { pairingCode: session.pairingCode });
  assert.equal(sender.sessionId, session.sessionId);
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: session.pairingCode })).status, 404);
  assert.equal((await request(`${path}/frames`, 'POST', sender.senderToken, observation)).status, 200);
  const received = await request(path, 'GET', session.viewerToken);
  assert.equal(received.body.sourceState, 'ready');
  assert.equal(received.body.frameCount, 1);
  assert.deepEqual(received.body.frame.hands, observation.hands);
  assert.equal(received.body.frame.deviceTimestampMs, 123);
  assert.equal(received.body.viewerToken, undefined);
  assert.equal(received.body.senderToken, undefined);
  await request(`${path}/presence`, 'POST', sender.senderToken, { state: 'offline' });
  assert.equal((await request(path, 'GET', session.viewerToken)).body.frame, null);
  assert.equal((await request(path, 'DELETE', session.viewerToken)).status, 200);
  assert.equal((await request(`${path}/frames`, 'POST', sender.senderToken, observation)).status, 404);
});

test('다른 세션과 읽기 토큰으로 쓰거나 인증 없이 손 데이터를 읽을 수 없다', async (t) => {
  const request = await setup(t);
  const { body: first } = await request('/sessions', 'POST');
  const { body: second } = await request('/sessions', 'POST');
  const path = `/sessions/${first.sessionId}`;
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, 'GET', second.viewerToken)).status, 401);
  assert.equal((await request(`${path}/frames`, 'POST', first.viewerToken, observation)).status, 403);
  const { body: sender } = await request('/pair', 'POST', undefined, { pairingCode: first.pairingCode });
  assert.equal((await request(path, 'DELETE', sender.senderToken)).status, 403);
});

test('수신이 멈추면 관절을 숨기고 코드와 세션 만료를 적용한다', async (t) => {
  let now = 1_000;
  const request = await setup(t, createQuestRelayHandler({ nowMs: () => now }));
  const { body: session } = await request('/sessions', 'POST');
  const { body: unused } = await request('/sessions', 'POST');
  const { body: sender } = await request('/pair', 'POST', undefined, { pairingCode: session.pairingCode });
  const path = `/sessions/${session.sessionId}`;
  await request(`${path}/frames`, 'POST', sender.senderToken, observation);
  now += 1_501;
  assert.deepEqual((await request(path, 'GET', session.viewerToken)).body, {
    sessionId: session.sessionId, sourceState: 'stale', frameCount: 1, frame: null, activeEpisodeId: null,
  });
  now = unused.pairingExpiresAtMs;
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: unused.pairingCode })).status, 404);
  now = session.expiresAtMs;
  assert.equal((await request(path, 'GET', session.viewerToken)).status, 404);
});

test('25개 관절의 좌표를 전달하고 잘못된 프레임은 최근 데이터를 덮어쓰지 않는다', async (t) => {
  const request = await setup(t);
  const { body: session } = await request('/sessions', 'POST');
  const { body: sender } = await request('/pair', 'POST', undefined, { pairingCode: session.pairingCode });
  const path = `/sessions/${session.sessionId}`;
  const names = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) => ['metacarpal', 'phalanx-proximal',
      'phalanx-intermediate', 'phalanx-distal', 'tip'].map((part) => `${finger}-finger-${part}`))];
  const frame = structuredClone(observation);
  frame.hands.left = {
    sourcePresent: true, poseObserved: true,
    joints: names.map((name) => ({ name, positionMeters: [0.1, 1.2, -0.3], orientationQuaternion: [0, 0, 0, 1], radiusMeters: 0.008 })),
  };
  await request(`${path}/frames`, 'POST', sender.senderToken, frame);
  assert.deepEqual((await request(path, 'GET', session.viewerToken)).body.frame.hands.left, frame.hands.left);
  frame.hands.left.joints[0].positionMeters[0] = null;
  assert.equal((await request(`${path}/frames`, 'POST', sender.senderToken, frame)).status, 400);
  frame.hands.left.joints = [];
  assert.equal((await request(`${path}/frames`, 'POST', sender.senderToken, frame)).status, 400);
  assert.equal((await request(`${path}/frames`, 'POST', sender.senderToken, { padding: 'x'.repeat(33_000) })).status, 413);
  assert.equal((await request(path, 'GET', session.viewerToken)).body.frameCount, 1);
});

test('잘못된 연결 코드 반복 요청을 제한한다', async (t) => {
  const request = await setup(t);
  for (let index = 0; index < 30; index += 1) {
    assert.equal((await request('/pair', 'POST', undefined, { pairingCode: '000000' })).status, 404);
  }
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: '000000' })).status, 429);
});
