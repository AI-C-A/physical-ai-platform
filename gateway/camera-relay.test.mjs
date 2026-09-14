import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createCameraRelay } from './camera-relay.mjs';

async function setup(t) {
  let now = 1_000;
  let active = true;
  const handler = createCameraRelay({ nowMs: () => now, authorizeCollection: (id, auth) => Promise.resolve(active && id === 'collection' && (auth === undefined || auth === 'Bearer owner')) });
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (path = '', method = 'GET', token, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/quest/cameras${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const create = async (role = 'head', label = 'Head 정면') => (await request('', 'POST', 'owner', { role, label, collectionId: 'collection' })).body;
  return { request, create, tick: (value) => { now += value; }, end: () => { active = false; } };
}

test('multiple cameras of the same role have independent codes, credentials and SDP', async (t) => {
  const { request, create } = await setup(t);
  const head = await create();
  const second = await create('head', 'Head 측면');
  const body = await create('full-body', '전신');
  assert.equal(new Set([head.id, second.id, body.id]).size, 3);
  assert.equal(new Set([head.pairingCode, second.pairingCode, body.pairingCode]).size, 3);
  const paired = (await request('/pair', 'POST', undefined, { pairingCode: head.pairingCode })).body;
  assert.equal(paired.role, 'head');
  assert.equal(paired.viewerToken, undefined);
  const offer = await request(`/${head.id}/offer`, 'POST', head.viewerToken, { sdp: 'v=0\r\no=offer' });
  const senderState = (await request(`/${head.id}`, 'GET', paired.senderToken)).body;
  assert.equal(senderState.offer.sdp, 'v=0\r\no=offer');
  assert.equal((await request(`/${body.id}`, 'GET', paired.senderToken)).status, 401);
  assert.equal((await request(`/${head.id}/answer`, 'POST', paired.senderToken, { sdp: 'v=0\r\no=answer', revision: offer.body.revision })).status, 200);
  const received = (await request(`/${head.id}`, 'GET', head.viewerToken)).body;
  assert.equal(received.answer.sdp, 'v=0\r\no=answer');
  assert.equal(received.senderToken, undefined);
  assert.equal((await request('?collectionId=collection', 'GET', 'owner')).body[0].pairingCode, null);
});

test('rejects missing credentials, cross roles, invalid purposes and duplicate code claims', async (t) => {
  const { request, create } = await setup(t);
  assert.equal((await request('?collectionId=collection')).status, 403);
  assert.equal((await request('', 'POST', undefined, { collectionId: 'collection', role: 'head', label: 'x' })).status, 403);
  assert.equal((await request('', 'POST', 'owner', { collectionId: 'collection', role: 'other', label: 'x' })).status, 400);
  const camera = await create();
  const results = await Promise.all([1, 2].map(() => request('/pair', 'POST', undefined, { pairingCode: camera.pairingCode })));
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  const sender = results.find((result) => result.status === 200).body;
  assert.equal((await request(`/${camera.id}/offer`, 'POST', sender.senderToken, { sdp: 'v=0' })).status, 403);
  assert.equal((await request(`/${camera.id}/answer`, 'POST', camera.viewerToken, { sdp: 'v=0' })).status, 403);
  assert.equal((await request(`/${camera.id}`, 'DELETE', sender.senderToken)).status, 403);
});

test('renew invalidates the old sender and rejects stale answers and leave requests', async (t) => {
  const { request, create } = await setup(t);
  const camera = await create();
  const sender = (await request('/pair', 'POST', undefined, { pairingCode: camera.pairingCode })).body;
  const old = (await request(`/${camera.id}/offer`, 'POST', camera.viewerToken, { sdp: 'v=0\r\no=old' })).body;
  const current = (await request(`/${camera.id}/offer`, 'POST', camera.viewerToken, { sdp: 'v=0\r\no=new' })).body;
  assert.equal((await request(`/${camera.id}/answer`, 'POST', sender.senderToken, { revision: old.revision, sdp: 'v=0' })).status, 409);
  await request(`/${camera.id}/leave`, 'POST', camera.viewerToken, old);
  assert.equal((await request(`/${camera.id}`, 'GET', sender.senderToken)).body.revision, current.revision);
  const renewed = (await request(`/${camera.id}/renew`, 'POST', camera.viewerToken, {})).body;
  assert.notEqual(renewed.pairingCode, camera.pairingCode);
  assert.equal((await request(`/${camera.id}`, 'GET', sender.senderToken)).status, 401);
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: camera.pairingCode })).status, 404);
});

test('expires codes and idle sessions, detects offline senders and rejects ended collections', async (t) => {
  const { request, create, tick, end } = await setup(t);
  const camera = await create();
  tick(300_001);
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: camera.pairingCode })).status, 404);
  const renewed = (await request(`/${camera.id}/renew`, 'POST', camera.viewerToken, {})).body;
  await request('/pair', 'POST', undefined, { pairingCode: renewed.pairingCode });
  assert.equal((await request(`/${camera.id}`, 'GET', camera.viewerToken)).body.peerOnline, true);
  tick(30_001);
  assert.equal((await request(`/${camera.id}`, 'GET', camera.viewerToken)).body.peerOnline, false);
  const idle = await create();
  tick(3_600_001);
  assert.equal((await request(`/${idle.id}`, 'GET', idle.viewerToken)).status, 404);
  const live = await create(); end();
  assert.equal((await request(`/${live.id}`, 'GET', live.viewerToken)).status, 410);
});

test('caps cameras per collection and rate limits code guessing', async (t) => {
  const { request, create, tick } = await setup(t);
  for (let index = 0; index < 16; index += 1) await create();
  assert.equal((await request('', 'POST', 'owner', { collectionId: 'collection', role: 'head', label: 'overflow' })).status, 409);
  tick(60_001);
  for (let index = 0; index < 60; index += 1) await request('/pair', 'POST', undefined, { pairingCode: '000000' });
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: '000000' })).status, 429);
});

test('automatic renewal refreshes only expired unused codes and preserves a paired sender', async (t) => {
  const { request, create, tick } = await setup(t);
  const camera = await create();
  const renew = () => request(`/${camera.id}/refresh-code`, 'POST', camera.viewerToken, { onlyIfExpired: true });
  assert.equal((await renew()).body.pairingCode, camera.pairingCode);
  tick(300_001);
  const fresh = (await renew()).body;
  assert.notEqual(fresh.pairingCode, camera.pairingCode);
  assert.equal((await request('/pair', 'POST', undefined, { pairingCode: camera.pairingCode })).status, 404);
  const sender = (await request('/pair', 'POST', undefined, { pairingCode: fresh.pairingCode })).body;
  tick(300_001);
  const preserved = await renew();
  assert.equal(preserved.body.paired, true);
  assert.equal(preserved.body.pairingCode, null);
  assert.equal((await request(`/${camera.id}`, 'GET', sender.senderToken)).status, 200);
});

test('explicit connection restarts an unused code for five minutes without disconnecting a racing sender', async (t) => {
  const { request, create, tick } = await setup(t);
  const camera = await create();
  tick(120_000);
  const restarted = (await request(`/${camera.id}/refresh-code`, 'POST', camera.viewerToken, { restart: true })).body;
  assert.notEqual(restarted.pairingCode, camera.pairingCode);
  assert.equal(restarted.pairingExpiresAtMs, 121_000 + 300_000);
  const sender = (await request('/pair', 'POST', undefined, { pairingCode: restarted.pairingCode })).body;
  const retained = (await request(`/${camera.id}/refresh-code`, 'POST', camera.viewerToken, { restart: true })).body;
  assert.equal(retained.paired, true);
  assert.equal((await request(`/${camera.id}`, 'GET', sender.senderToken)).status, 200);
});
