import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createQuestCollectionStore } from './quest-collection-store.mjs';

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'quest-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = createQuestCollectionStore(directory);
  const id = 'a'.repeat(64);
  await store.create(id, { name: '실제 수집', taskId: 'task', instruction: '손 움직이기', questDeviceId: 'quest-1', projectId: 'project', siteId: 'site' });
  await store.command(id, 'start', { ready: true });
  const record = await store.command(id, 'start-episode', { ready: true });
  const episodeId = record.activeEpisodeId;
  const frame = (sequence, frameEpoch = 0) => ({ sessionId: id, episodeId, sourceDeviceId: 'quest-1', sequence,
    frameEpoch, deviceMonotonicTimestampMs: sequence * 100,
    hands: { left: { poseObserved: true, joints: [] }, right: { poseObserved: true, joints: [] } } });
  return { directory, store, id, episodeId, frame };
}

test('중복 재전송을 제거하고 저장된 원본과 메타데이터를 다시 읽는다', async (t) => {
  const { directory, store, id, episodeId, frame } = await setup(t);
  await store.appendFrames(id, [frame(0), frame(1)]);
  await store.appendFrames(id, [frame(0), frame(1), frame(2)]);
  await store.command(id, 'stop-episode', { episodeId });
  await assert.rejects(store.command(id, 'save-episode', { episodeId }), /전송이 끝난/);
  await store.acknowledge(id, { episodeId, command: 'stop', state: 'acknowledged' });
  await store.command(id, 'save-episode', { episodeId });
  const reopened = createQuestCollectionStore(directory);
  const record = await reopened.get(id);
  assert.equal(record.activeEpisodeId, null);
  assert.equal(record.episodes[0].frameCount, 3);
  assert.equal(record.episodes[0].outcome, 'success');
  const lines = (await readFile(join(directory, `${episodeId}.ndjson`), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 3);
  assert.equal((await reopened.poseAt(id, episodeId, 150)).sequence, 1);
});

test('서버 재시작으로 중단된 녹화를 완료로 꾸미지 않고 원본을 유지한다', async (t) => {
  const { directory, store, id, episodeId, frame } = await setup(t);
  await store.appendFrames(id, [frame(0)]);
  const reopened = createQuestCollectionStore(directory);
  const record = await reopened.get(id);
  assert.equal(record.episodes[0].status, 'finalizing');
  assert.equal(record.episodes[0].frameCount, 1);
  await assert.rejects(reopened.command(id, 'retry-finalization', { episodeId }), /전송 완료 응답/);
  await assert.rejects(reopened.command(id, 'save-episode', { episodeId }), /전송이 끝난/);
  await reopened.command(id, 'invalidate-episode', { episodeId });
  assert.equal((await reopened.get(id)).activeEpisodeId, null);
});

test('다른 장치와 다른 수집 프레임은 원본에 쓰지 않는다', async (t) => {
  const { store, id, frame } = await setup(t);
  await assert.rejects(store.appendFrames(id, [{ ...frame(0), sourceDeviceId: 'other' }]), /식별자/);
  await assert.rejects(store.appendFrames(id, [{ ...frame(0), sessionId: 'b'.repeat(64) }]), /식별자/);
  assert.equal((await store.get(id)).episodes[0].frameCount, 0);
});

test('원본 없는 녹화는 전송 완료 응답이 와도 저장할 수 없다', async (t) => {
  const { store, id, episodeId } = await setup(t);
  await store.command(id, 'stop-episode', { episodeId });
  await store.acknowledge(id, { episodeId, command: 'stop', state: 'acknowledged' });
  await assert.rejects(store.command(id, 'save-episode', { episodeId }), /전송이 끝난/);
  assert.equal((await store.get(id)).episodes[0].status, 'finalizing');
});


test('머리 자세를 손 프레임과 같은 시각으로 저장하고 재생한다', async (t) => {
  const { directory, store, id, episodeId, frame } = await setup(t);
  const viewerPose = { positionMeters: [0.2, 1.65, 0], orientationQuaternion: [0, 0.707, 0, 0.707] };
  await store.appendFrames(id, [{ ...frame(0), viewerPose }, { ...frame(1), viewerPose: null }]);
  const reopened = createQuestCollectionStore(directory);
  assert.deepEqual((await reopened.poseAt(id, episodeId, 0)).viewerPose, viewerPose);
  assert.equal((await reopened.poseAt(id, episodeId, 100)).viewerPose, null);
});
