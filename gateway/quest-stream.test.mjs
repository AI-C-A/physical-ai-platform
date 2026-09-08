import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import { createQuestRelayHandler } from './quest-relay.mjs';

const observation = (timestamp) => ({ deviceMonotonicTimestampMs: timestamp,
  viewerPose: { positionMeters: [0, 1.6, 0], orientationQuaternion: [0, 0, 0, 1] },
  hands: { left: { sourcePresent: false, poseObserved: false, joints: [] },
    right: { sourcePresent: false, poseObserved: false, joints: [] } } });

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'quest-stream-'));
  let now = 10_000;
  const handler = createQuestRelayHandler({ collectionDirectory: directory, nowMs: () => now });
  const server = createServer(handler);
  handler.attachStream(server);
  const sockets = [];
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    sockets.forEach((socket) => socket.terminate());
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    await rm(directory, { recursive: true, force: true });
  });
  const request = async (path, method = 'GET', body, token) => {
    const response = await fetch(`${origin}/api/quest${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  const connect = async (sessionId, token, role, modern = false) => {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/api/quest/stream`);
    sockets.push(socket);
    await once(socket, 'open');
    const ready = once(socket, 'message');
    socket.send(JSON.stringify({ sessionId, token, role, ...(modern ? { streamProtocol: 2 } : {}) }));
    const welcome = JSON.parse((await ready)[0]);
    if (modern) socket.send(JSON.stringify({ type: 'snapshot-ack', sequence: welcome.snapshotSequence }));
    return socket;
  };
  return { request, connect, advance: (ms) => { now += ms; } };
}

test('HTTP 조회 없이 프레임을 푸시하고 종료·stale 상태를 즉시 숨긴다', async (t) => {
  const { request, connect, advance } = await setup(t);
  const session = await request('/sessions', 'POST', {});
  const sender = await request('/pair', 'POST', { pairingCode: session.pairingCode });
  const viewer = await connect(session.sessionId, session.viewerToken, 'viewer');
  const quest = await connect(session.sessionId, sender.senderToken, 'sender');
  const received = once(viewer, 'message');
  quest.send(JSON.stringify({ type: 'frame', observation: observation(123) }));
  const value = JSON.parse((await received)[0]);
  assert.equal(value.frame.deviceTimestampMs, 123);
  assert.deepEqual(value.frame.viewerPose, observation(123).viewerPose);
  advance(1_501);
  const stale = JSON.parse((await once(viewer, 'message'))[0]);
  assert.equal(stale.sourceState, 'stale');
  assert.equal(stale.frame, null);
  const offline = once(viewer, 'message');
  await request(`/sessions/${session.sessionId}/presence`, 'POST', { state: 'offline' }, sender.senderToken);
  assert.equal(JSON.parse((await offline)[0]).frame, null);
  quest.send(JSON.stringify({ type: 'frame', observation: observation(999) }));
  const state = await request(`/sessions/${session.sessionId}`, 'GET', undefined, session.viewerToken);
  assert.equal(state.frame, null);
});

test('수신 ACK가 늦으면 화면 프레임을 쌓지 않고 ACK 후 최신 프레임만 보낸다', async (t) => {
  const { request, connect } = await setup(t);
  const session = await request('/sessions', 'POST', {});
  const sender = await request('/pair', 'POST', { pairingCode: session.pairingCode });
  const viewer = await connect(session.sessionId, session.viewerToken, 'viewer', true);
  const messages = [];
  viewer.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const first = once(viewer, 'message');
  await request(`/sessions/${session.sessionId}/frames`, 'POST', observation(1), sender.senderToken);
  const initial = JSON.parse((await first)[0]);
  for (let timestamp = 2; timestamp <= 20; timestamp += 1) {
    await request(`/sessions/${session.sessionId}/frames`, 'POST', observation(timestamp), sender.senderToken);
  }
  assert.equal(messages.length, 1);
  const latest = once(viewer, 'message');
  viewer.send(JSON.stringify({ type: 'snapshot-ack', sequence: initial.snapshotSequence }));
  assert.equal(JSON.parse((await latest)[0]).frame.deviceTimestampMs, 20);
});

test('직접 연결 신호는 인증된 같은 세션의 상대 역할에만 전달한다', async (t) => {
  const { request, connect } = await setup(t);
  const session = await request('/sessions', 'POST', {});
  const sender = await request('/pair', 'POST', { pairingCode: session.pairingCode });
  const quest = await connect(session.sessionId, sender.senderToken, 'sender', true);
  const invitation = once(quest, 'message');
  const viewer = await connect(session.sessionId, session.viewerToken, 'viewer', true);
  const peer = JSON.parse((await invitation)[0]);
  assert.equal(peer.type, 'peer');
  const offer = once(viewer, 'message');
  quest.send(JSON.stringify({ type: 'signal', peerId: peer.peerId, signal: { type: 'offer', sdp: 'test offer' } }));
  const signal = JSON.parse((await offer)[0]);
  assert.equal(signal.signal.sdp, 'test offer');
  assert.notEqual(signal.peerId, peer.peerId);
  const otherSession = await request('/sessions', 'POST', {});
  const outsider = await connect(otherSession.sessionId, otherSession.viewerToken, 'viewer', true);
  const crossed = [];
  quest.on('message', (data) => { if (JSON.parse(data.toString()).type === 'signal') crossed.push(data); });
  outsider.send(JSON.stringify({ type: 'signal', peerId: signal.peerId, signal: { type: 'answer', sdp: 'wrong session' } }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(crossed.length, 0);
});

test('보기 토큰으로 쓰지 못하고 삭제한 세션의 소켓 인증은 무효화된다', async (t) => {
  const { request, connect } = await setup(t);
  const session = await request('/sessions', 'POST', {});
  const viewer = await connect(session.sessionId, session.viewerToken, 'viewer');
  const closed = once(viewer, 'close');
  viewer.send(JSON.stringify({ type: 'frame', observation: observation(1) }));
  assert.equal((await closed)[0], 1008);
  const second = await connect(session.sessionId, session.viewerToken, 'viewer');
  const expired = once(second, 'close');
  await request(`/sessions/${session.sessionId}`, 'DELETE', undefined, session.viewerToken);
  assert.equal((await expired)[0], 1008);
});

test('64개 원본 배치를 저장해도 최신 미리보기와 녹화 상태를 덮어쓰지 않는다', async (t) => {
  const { request, connect } = await setup(t);
  const record = await request('/collections', 'POST', { name: 'stream test', projectId: 'p', siteId: 's', taskId: 't', instruction: 'test', questDeviceId: 'quest' });
  const sender = await request('/pair', 'POST', { pairingCode: record.pairing.code });
  // 테스트의 준비 상태는 실제 유효한 양손 관절로 만든다.
  const names = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
    ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((part) => `${finger}-finger-${part}`))];
  const pose = observation(1_000);
  for (const side of ['left', 'right']) pose.hands[side] = { sourcePresent: true, poseObserved: true,
    joints: names.map((name) => ({ name, positionMeters: [0, 1, -0.3], orientationQuaternion: [0, 0, 0, 1], radiusMeters: 0.005 })) };
  await request(`/sessions/${record.id}/frames`, 'POST', pose, sender.senderToken);
  await request(`/collections/${record.id}/command`, 'POST', { command: 'start' });
  const started = await request(`/collections/${record.id}/command`, 'POST', { command: 'start-episode' });
  const frames = Array.from({ length: 64 }, (_, sequence) => ({ ...pose, deviceMonotonicTimestampMs: sequence,
    sequence, frameEpoch: 0, sessionId: record.id, episodeId: started.activeEpisodeId, sourceDeviceId: 'quest' }));
  await request(`/sessions/${record.id}/batches`, 'POST', { frames }, sender.senderToken);
  const quest = await connect(record.id, sender.senderToken, 'sender');
  quest.send(JSON.stringify({ type: 'frame', observation: pose }));
  const current = await request(`/collections/${record.id}`);
  assert.equal(current.frame.deviceTimestampMs, 1_000);
  assert.equal(current.episodes[0].frameCount, 64);
  assert.equal(current.sourceState, 'recording');
});
