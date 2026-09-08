import { randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function createQuestCollectionStore(directory, nowMs = Date.now) {
  const records = new Map();
  let ready;
  let pending = Promise.resolve();
  const path = (id, extension) => {
    if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('수집 식별자가 올바르지 않습니다.');
    return resolve(directory, `${id}.${extension}`);
  };
  const load = () => ready ??= (async () => {
    await mkdir(directory, { recursive: true });
    for (const filename of await readdir(directory)) {
      if (!/^[a-f0-9]{64}\.json$/u.test(filename)) continue;
      const record = JSON.parse(await readFile(resolve(directory, filename), 'utf8'));
      if (record.id !== filename.slice(0, -5)) throw new Error('저장된 수집 메타데이터가 올바르지 않습니다.');
      for (const episode of record.episodes) {
        if (episode.status === 'recording' || episode.status === 'finalizing') {
          episode.status = 'finalizing';
          episode.endedAtMs ??= nowMs();
          episode.finalizationError = '서버 재시작으로 수집이 중단되었습니다. 원본을 확인한 뒤 다시 저장하세요.';
        }
      }
      records.set(record.id, record);
    }
  })();
  const persist = async (record) => {
    await writeFile(path(record.id, 'tmp'), JSON.stringify(record), 'utf8');
    await rename(path(record.id, 'tmp'), path(record.id, 'json'));
    records.set(record.id, record);
  };
  const serial = (action) => {
    const next = pending.then(load).then(action);
    pending = next.catch(() => undefined);
    return next;
  };
  const requireRecord = (id) => {
    const record = records.get(id);
    if (!record) throw new Error('수집 세션을 찾을 수 없습니다.');
    return structuredClone(record);
  };
  const requireEpisode = (record, id) => {
    const episode = record.episodes.find((item) => item.id === id);
    if (!episode) throw new Error('Episode를 찾을 수 없습니다.');
    return episode;
  };

  return {
    list: async () => { await pending; await load(); return structuredClone([...records.values()]); },
    get: async (id) => { await pending; await load(); return records.has(id) ? requireRecord(id) : null; },
    create: (id, input) => serial(async () => {
      if (records.size >= 1_000) throw new Error('수집 세션 보관 한도에 도달했습니다.');
      const fields = {};
      for (const field of ['name', 'taskId', 'instruction', 'questDeviceId', 'projectId', 'siteId']) {
        if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 2_000) {
          throw new Error('세션 이름, 작업과 Quest 장치 ID를 입력하세요.');
        }
        fields[field] = input[field].trim();
      }
      const record = { id, ...fields, createdAtMs: nowMs(), updatedAtMs: nowMs(), startedAtMs: null,
        stoppedAtMs: null, status: 'draft', activeEpisodeId: null, episodes: [] };
      await persist(record);
      return record;
    }),
    command: (id, command, input = {}) => serial(async () => {
      const record = requireRecord(id);
      const now = nowMs();
      if (command === 'validate') {
        if (record.status === 'draft' || record.status === 'ready') record.status = input.ready ? 'ready' : 'draft';
      } else if (command === 'start') {
        if (!input.ready || record.stoppedAtMs !== null) throw new Error('Quest 손 추적 연결을 먼저 완료하세요.');
        record.status = 'active';
        record.startedAtMs ??= now;
      } else if (command === 'start-episode') {
        if (!input.ready || record.status !== 'active' || record.activeEpisodeId !== null) throw new Error('연결 상태와 현재 Episode를 확인하세요.');
        if (record.episodes.length >= 100) throw new Error('새 수집 세션에서 계속하세요.');
        const episode = { id: randomBytes(32).toString('hex'), name: `Episode ${String(record.episodes.length + 1).padStart(2, '0')}`,
          status: 'recording', outcome: null, startedAtMs: now, endedAtMs: null,
          bytesWritten: 0, frameCount: 0, observedFrameCount: 0, lastSequence: -1,
          frameEpoch: null, epochDeviceTimestampMs: null, epochOffsetMs: 0, lastOffsetMs: 0,
          acknowledgements: [], finalizationError: null };
        record.episodes.push(episode);
        record.activeEpisodeId = episode.id;
      } else if (command === 'stop-episode') {
        const episode = requireEpisode(record, input.episodeId);
        if (episode.status === 'recording') { episode.status = 'finalizing'; episode.endedAtMs = now; }
      } else if (command === 'save-episode') {
        const episode = requireEpisode(record, input.episodeId);
        if (episode.status !== 'completed' || episode.frameCount === 0) throw new Error('원본 전송이 끝난 녹화본만 저장할 수 있습니다.');
        episode.outcome = 'success';
        if (record.activeEpisodeId === episode.id) record.activeEpisodeId = null;
      } else if (command === 'retry-finalization') {
        const episode = requireEpisode(record, input.episodeId);
        if (episode.status !== 'finalizing' || episode.frameCount === 0) throw new Error('저장할 원본 프레임이 없습니다.');
        if (!episode.acknowledgements.some((ack) => ack.command === 'stop' && ack.state === 'acknowledged')) {
          throw new Error('Quest에서 전송 완료 응답을 기다리고 있습니다.');
        }
        episode.status = 'completed'; episode.finalizationError = null;
      } else if (command === 'delete-episode' || command === 'invalidate-episode') {
        const episode = requireEpisode(record, input.episodeId);
        if (episode.status === 'recording') throw new Error('녹화를 먼저 정지하세요.');
        if (command === 'delete-episode') {
          await unlink(path(episode.id, 'ndjson')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
          record.episodes = record.episodes.filter((item) => item.id !== episode.id);
        } else { episode.status = 'invalid'; episode.outcome = 'aborted'; }
        if (record.activeEpisodeId === episode.id) record.activeEpisodeId = null;
      } else if (command === 'finish') {
        if (record.activeEpisodeId !== null) throw new Error('현재 녹화본을 먼저 정지하고 저장하세요.');
        record.status = 'completed'; record.stoppedAtMs = now;
      } else if (command === 'abandon') {
        if (record.activeEpisodeId !== null) throw new Error('녹화를 먼저 정지하세요.');
        record.status = 'abandoned'; record.stoppedAtMs = now;
      } else throw new Error('지원하지 않는 수집 작업입니다.');
      record.updatedAtMs = now;
      await persist(record);
      return record;
    }),
    acknowledge: (id, input) => serial(async () => {
      const record = requireRecord(id);
      const episode = requireEpisode(record, input.episodeId);
      if (!['start', 'stop'].includes(input.command) || !['acknowledged', 'rejected'].includes(input.state)) throw new Error('잘못된 수집 응답입니다.');
      if (input.command === 'stop' && episode.status === 'recording') throw new Error('PC에서 녹화를 먼저 정지하세요.');
      episode.acknowledgements = episode.acknowledgements.filter((ack) => ack.command !== input.command);
      episode.acknowledgements.push({ command: input.command, state: input.state, acknowledgedAtMs: nowMs(), detail: typeof input.detail === 'string' ? input.detail.slice(0, 500) : null });
      if (input.command === 'stop' && input.state === 'acknowledged') {
        if (episode.frameCount > 0) { episode.status = 'completed'; episode.finalizationError = null; }
        else episode.finalizationError = '수신된 손 추적 프레임이 없습니다.';
      }
      await persist(record);
    }),
    appendFrames: (id, frames) => serial(async () => {
      const record = requireRecord(id);
      const episode = requireEpisode(record, frames[0].episodeId);
      if (record.activeEpisodeId !== episode.id || !['recording', 'finalizing'].includes(episode.status)) throw new Error('수집 중인 Episode가 아닙니다.');
      const retained = [];
      for (const frame of frames) {
        if (frame.episodeId !== episode.id || frame.sessionId !== record.id || frame.sourceDeviceId !== record.questDeviceId
          || !Number.isSafeInteger(frame.sequence) || frame.sequence < 0 || !Number.isSafeInteger(frame.frameEpoch) || frame.frameEpoch < 0) throw new Error('수집 프레임 식별자가 올바르지 않습니다.');
        if (frame.sequence <= episode.lastSequence) continue;
        if (episode.frameEpoch !== frame.frameEpoch) {
          episode.epochOffsetMs = episode.frameEpoch === null ? 0 : episode.lastOffsetMs + 100;
          episode.frameEpoch = frame.frameEpoch;
          episode.epochDeviceTimestampMs = frame.deviceMonotonicTimestampMs;
        }
        const episodeOffsetMs = Math.max(episode.lastOffsetMs, episode.epochOffsetMs + frame.deviceMonotonicTimestampMs - episode.epochDeviceTimestampMs);
        const stored = { sequence: frame.sequence, frameEpoch: frame.frameEpoch, episodeOffsetMs,
          coordinateFrame: 'quest-local-floor', deviceTimestampMs: frame.deviceMonotonicTimestampMs,
          receivedTimestampMs: nowMs(), hands: frame.hands, viewerPose: frame.viewerPose };
        retained.push(stored);
        episode.lastSequence = frame.sequence;
        episode.lastOffsetMs = episodeOffsetMs;
        episode.frameCount += 1;
        if (frame.hands.left.poseObserved && frame.hands.right.poseObserved) episode.observedFrameCount += 1;
      }
      const payload = retained.map((frame) => JSON.stringify(frame) + '\n').join('');
      const byteLength = Buffer.byteLength(payload);
      if (episode.bytesWritten + byteLength > 64 * 1_024 * 1_024) throw new Error('Episode 원본이 64MB에 도달했습니다. 녹화를 정지하고 새 Episode를 시작하세요.');
      if (payload) await appendFile(path(episode.id, 'ndjson'), payload, 'utf8');
      episode.bytesWritten += byteLength;
      record.updatedAtMs = nowMs();
      await persist(record);
      return retained.at(-1) ?? null;
    }),
    poseAt: async (id, episodeId, offsetMs) => {
      await pending; await load();
      requireEpisode(requireRecord(id), episodeId);
      let text;
      try { text = await readFile(path(episodeId, 'ndjson'), 'utf8'); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
      let result = null;
      for (const line of text.split('\n')) {
        if (!line) continue;
        const frame = JSON.parse(line);
        if (result === null || frame.episodeOffsetMs <= offsetMs) result = frame;
        if (frame.episodeOffsetMs > offsetMs) break;
      }
      return result;
    },
    delete: (id) => serial(async () => {
      const record = requireRecord(id);
      if (record.episodes.some((episode) => episode.status === 'recording')) throw new Error('녹화를 먼저 정지하세요.');
      for (const episode of record.episodes) await unlink(path(episode.id, 'ndjson')).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      await unlink(path(id, 'json'));
      records.delete(id);
    }),
  };
}
