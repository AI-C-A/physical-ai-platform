import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomBytes, randomInt } from 'node:crypto';
import { resolve } from 'node:path';
import { createQuestStream } from './quest-stream.mjs';
import { createQuestCollectionStore } from './quest-collection-store.mjs';
import { createCameraRelay } from './camera-relay.mjs';

const basePath = '/api/quest';
const lifetimeMs = 60 * 60 * 1_000;
const pairingLifetimeMs = 5 * 60 * 1_000;
const staleAfterMs = 1_500;
const jointNames = [
  'wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...['index', 'middle', 'ring', 'pinky'].flatMap((finger) => [
    `${finger}-finger-metacarpal`, `${finger}-finger-phalanx-proximal`,
    `${finger}-finger-phalanx-intermediate`, `${finger}-finger-phalanx-distal`, `${finger}-finger-tip`,
  ]),
];

class RelayError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request, maximumBytes = 32_768) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new RelayError(415, 'JSON 요청이 필요합니다.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new RelayError(413, '손 추적 데이터가 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result === null || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new RelayError(400, 'JSON 요청을 읽을 수 없습니다.');
  }
}

function vector(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function validateObservation(observation) {
  if (!Number.isFinite(observation?.deviceMonotonicTimestampMs) || observation.deviceMonotonicTimestampMs < 0) {
    throw new RelayError(400, '손 추적 시각이 올바르지 않습니다.');
  }
  const hands = {};
  for (const side of ['left', 'right']) {
    const hand = observation.hands?.[side];
    if (typeof hand?.sourcePresent !== 'boolean' || typeof hand.poseObserved !== 'boolean'
      || !Array.isArray(hand.joints) || hand.joints.length !== (hand.poseObserved ? 25 : 0)
      || (hand.poseObserved && !hand.sourcePresent)) {
      throw new RelayError(400, '손 관절 데이터가 올바르지 않습니다.');
    }
    const names = new Set();
    const joints = hand.joints.map((joint) => {
      if (!joint || !jointNames.includes(joint.name) || names.has(joint.name)
        || !vector(joint.positionMeters, 3) || !vector(joint.orientationQuaternion, 4)
        || !(joint.radiusMeters === null || (Number.isFinite(joint.radiusMeters) && joint.radiusMeters >= 0))) {
        throw new RelayError(400, '손 관절 데이터가 올바르지 않습니다.');
      }
      names.add(joint.name);
      return {
        name: joint.name, positionMeters: joint.positionMeters,
        orientationQuaternion: joint.orientationQuaternion, radiusMeters: joint.radiusMeters,
      };
    });
    hands[side] = { sourcePresent: hand.sourcePresent, poseObserved: hand.poseObserved, joints };
  }
  const pose = observation.viewerPose;
  if (pose != null && (!vector(pose.positionMeters, 3) || !vector(pose.orientationQuaternion, 4)
    || !pose.orientationQuaternion.some((value) => value !== 0))) {
    throw new RelayError(400, '머리 위치 데이터가 올바르지 않습니다.');
  }
  return { deviceMonotonicTimestampMs: observation.deviceMonotonicTimestampMs, hands,
    ...(pose === undefined ? {} : { viewerPose: pose === null ? null : {
      positionMeters: pose.positionMeters, orientationQuaternion: pose.orientationQuaternion,
    } }) };
}

export function createQuestRelayHandler({ nowMs = Date.now, collectionDirectory = resolve(process.env.QUEST_COLLECTION_DATA_DIR ?? 'data/quest') } = {}) {
  const sessions = new Map();
  const collections = createQuestCollectionStore(collectionDirectory, nowMs);
  const attempts = new Map();
  const token = () => randomBytes(32).toString('hex');

  const snapshot = (session) => {
    const state = liveState(session);
    return { sessionId: session.id, sourceState: state, frameCount: session.frameCount,
      frame: ['ready', 'recording'].includes(state) ? session.frame : null };
  };
  const receivePreview = (session, input) => {
    const observation = validateObservation(input);
    if (session.sourceState === 'offline') return;
    if (session.previewAtMs !== undefined && session.frame
      && observation.deviceMonotonicTimestampMs < session.frame.deviceTimestampMs) return;
    session.frame = { coordinateFrame: 'quest-local-floor', deviceTimestampMs: observation.deviceMonotonicTimestampMs,
      receivedTimestampMs: nowMs(), hands: observation.hands, viewerPose: observation.viewerPose };
    session.sourceState = session.sourceState === 'recording' ? 'recording' : 'ready';
    session.lastSeenAtMs = nowMs();
    session.frameCount += 1;
    session.previewAtMs = nowMs();
  };
  const stream = createQuestStream({
    authorize: (input) => {
      const session = sessions.get(input?.sessionId);
      if (!session || (!session.collection && session.expiresAtMs <= nowMs())) return null;
      const valid = input.role === 'sender' ? session.senderToken !== null && input.token === session.senderToken
        : input.role === 'viewer' && input.token === session.viewerToken;
      return valid ? { session, role: input.role } : null;
    },
    isValid: (session) => sessions.get(session.id) === session && (session.collection || session.expiresAtMs > nowMs()),
    snapshot, receive: receivePreview,
  });

  function sweep(now) {
    for (const [id, session] of sessions) if (!session.collection && session.expiresAtMs <= now) sessions.delete(id);
    for (const [address, attempt] of attempts) if (attempt.until <= now) attempts.delete(address);
  }

  function createSession(id = token(), collection = false) {
    const now = nowMs();
    if (!collection && sessions.size >= 128) throw new RelayError(503, '연결 가능한 세션이 가득 찼습니다.');
    let code;
    do { code = String(randomInt(100_000, 1_000_000)); }
    while ([...sessions.values()].some((session) => session.code === code));
    const session = { id, code, collection, viewerToken: token(), senderToken: null,
      expiresAtMs: now + lifetimeMs, pairingExpiresAtMs: now + pairingLifetimeMs,
      sourceState: 'pending', lastSeenAtMs: null, frame: null, frameCount: 0 };
    sessions.set(id, session);
    return session;
  }

  function liveState(session) {
    return ['paired', 'ready', 'recording'].includes(session.sourceState)
      && session.lastSeenAtMs !== null && nowMs() - session.lastSeenAtMs > staleAfterMs
      ? 'stale' : session.sourceState;
  }

  function publicCollection(record) {
    const relay = sessions.get(record.id) ?? createSession(record.id, true);
    relay.questDeviceId = record.questDeviceId;
    const sourceState = liveState(relay);
    return { ...record, viewerToken: relay.viewerToken, pairing: { code: relay.code, expiresAtMs: relay.pairingExpiresAtMs },
      sourceState, lastSeenAtMs: relay.lastSeenAtMs,
      frame: ['ready', 'recording'].includes(sourceState) && relay.frame
        && nowMs() - relay.frame.receivedTimestampMs <= staleAfterMs ? relay.frame : null,
      observedAtMs: nowMs() };
  }

  const collectionReady = (relay) => ['ready', 'recording'].includes(liveState(relay))
    && relay.frame?.hands.left.poseObserved === true && relay.frame?.hands.right.poseObserved === true
    && nowMs() - relay.frame.receivedTimestampMs <= staleAfterMs;

  const handleCameraRequest = createCameraRelay({ nowMs,
    iceServers: JSON.parse(process.env.CAMERA_ICE_SERVERS ?? '[]'),
    authorizeCollection: async (id, authorization) => {
      if (typeof id !== 'string' || !/^[a-f0-9]{64}$/u.test(id)) return false;
      const record = await collections.get(id);
      if (!record || record.stoppedAtMs !== null) return false;
      if (authorization === undefined) return true;
      return authorization === `Bearer ${publicCollection(record).viewerToken}`;
    },
  });

  function limit(request, now) {
    const address = request.socket.remoteAddress;
    const attempt = attempts.get(address) ?? { count: 0, until: now + 60_000 };
    if (attempt.count >= 30 || (!attempts.has(address) && attempts.size >= 1_024)) {
      throw new RelayError(429, '연결 요청이 많습니다. 잠시 후 다시 시도하세요.');
    }
    attempt.count += 1;
    attempts.set(address, attempt);
  }

  const handleQuestRequest = async (request, response) => {
    if (await handleCameraRequest(request, response)) return true;
    const url = new URL(request.url ?? '/', 'http://relay.internal');
    if (url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`)) return false;
    try {
      const now = nowMs();
      sweep(now);
      const method = request.method;
      if (url.pathname === `${basePath}/collections`) {
        if (method === 'GET') {
          send(response, 200, (await collections.list()).map(publicCollection));
        } else if (method === 'POST') {
          limit(request, now);
          const input = await readJson(request);
          const record = await collections.create(token(), input);
          send(response, 201, publicCollection(record));
        } else throw new RelayError(405, '지원하지 않는 수집 요청입니다.');
        return true;
      }
      const collectionMatch = url.pathname.match(/^\/api\/quest\/collections\/([a-f0-9]{64})(?:\/(command|pose|media|frames))?$/u);
      if (collectionMatch) {
        const id = collectionMatch[1];
        const record = await collections.get(id);
        if (!record) throw new RelayError(404, '수집 세션을 찾을 수 없습니다.');
        const current = publicCollection(record);
        if (method === 'POST' && collectionMatch[2] === 'media') {
          if (request.headers.authorization !== `Bearer ${current.viewerToken}`) throw new RelayError(403, '영상 저장 권한이 없습니다.');
          const chunks = []; let size = 0;
          for await (const chunk of request) {
            size += chunk.length;
            if (size > 8 * 1_024 * 1_024) throw new RelayError(413, '영상 조각이 너무 큽니다.');
            chunks.push(chunk);
          }
          if (size === 0) throw new RelayError(400, '빈 영상입니다.');
          await collections.appendVideo(id, url.searchParams.get('episodeId'), url.searchParams.get('videoId'), Number(url.searchParams.get('sequence')), Buffer.concat(chunks));
          send(response, 200, { stored: true });
        } else if (method === 'GET' && ['media', 'frames'].includes(collectionMatch[2])) {
          const artifact = await collections.artifact(id, url.searchParams.get('episodeId'), collectionMatch[2] === 'media' ? url.searchParams.get('videoId') : null);
          const size = artifact.bytesWritten;
          if (size === 0) throw new RelayError(404, '저장된 원본이 없습니다.');
          let start = 0; let end = size - 1;
          const range = request.headers.range;
          if (range) {
            const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
            if (!match || (!match[1] && !match[2])) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return true; }
            start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
            end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return true; }
          }
          response.writeHead(range ? 206 : 200, { 'Content-Type': artifact.mimeType, 'Content-Length': end - start + 1,
            'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes',
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
            ...(url.searchParams.has('download') || collectionMatch[2] === 'frames' ? { 'Content-Disposition': `attachment; filename="${artifact.path.split('/').at(-1)}"` } : {}),
          });
          await pipeline(createReadStream(artifact.path, { start, end }), response);
        } else if (method === 'GET' && !collectionMatch[2]) send(response, 200, current);
        else if (method === 'GET' && collectionMatch[2] === 'pose') {
          const offset = Number(url.searchParams.get('offsetMs') ?? 0);
          if (!Number.isFinite(offset) || offset < 0) throw new RelayError(400, '재생 위치가 올바르지 않습니다.');
          send(response, 200, await collections.poseAt(id, url.searchParams.get('episodeId'), offset));
        } else if (method === 'DELETE' && !collectionMatch[2]) {
          await collections.delete(id); sessions.delete(id); send(response, 200, { deleted: true });
        } else if (method === 'POST' && collectionMatch[2] === 'command') {
          const input = await readJson(request);
          if (input.command === 'renew') {
            if (record.activeEpisodeId !== null) throw new RelayError(409, '현재 Episode를 먼저 정지하고 저장하세요.');
            createSession(id, true);
            send(response, 200, publicCollection(record));
          } else {
            const updated = await collections.command(id, input.command, { ...input, ready: collectionReady(sessions.get(id)) });
            if (updated.stoppedAtMs !== null) sessions.get(id).sourceState = 'offline';
            send(response, 200, publicCollection(updated));
          }
        } else throw new RelayError(405, '지원하지 않는 수집 요청입니다.');
        return true;
      }
      if (method === 'POST' && url.pathname === `${basePath}/sessions`) {
        limit(request, now);
        await readJson(request);
        const session = createSession();
        send(response, 201, {
          sessionId: session.id, pairingCode: session.code, viewerToken: session.viewerToken,
          expiresAtMs: session.expiresAtMs, pairingExpiresAtMs: session.pairingExpiresAtMs,
        });
        return true;
      }
      if (method === 'POST' && url.pathname === `${basePath}/pair`) {
        limit(request, now);
        const { pairingCode } = await readJson(request);
        const session = [...sessions.values()].find((item) => item.code === pairingCode
          && item.pairingExpiresAtMs > now && item.senderToken === null);
        if (!session) throw new RelayError(404, '연결 코드가 만료되었거나 이미 사용되었습니다. PC에서 새 코드를 만드세요.');
        session.senderToken = token();
        session.sourceState = 'paired';
        session.lastSeenAtMs = now;
        send(response, 200, { sessionId: session.id, senderToken: session.senderToken,
          sourceDeviceId: session.questDeviceId ?? `quest-${session.id}`, collection: session.collection });
        return true;
      }
      const match = url.pathname.match(/^\/api\/quest\/sessions\/([a-f0-9]{64})(?:\/(frames|presence|batches|acknowledgements))?$/u);
      const session = match ? sessions.get(match[1]) : null;
      if (!session) throw new RelayError(404, '세션이 만료되었습니다. PC에서 새 연결을 시작하세요.');
      const authorization = request.headers.authorization;
      const isViewer = authorization === `Bearer ${session.viewerToken}`;
      const isSender = session.senderToken !== null && authorization === `Bearer ${session.senderToken}`;
      if (!isViewer && !isSender) throw new RelayError(401, '세션 연결 권한이 없습니다.');
      if (method === 'GET' && !match[2]) {
        if (isSender && session.sourceState === 'paired') session.lastSeenAtMs = now;
        const state = liveState(session);
        const record = session.collection ? await collections.get(session.id) : null;
        const activeEpisode = record?.episodes.find((episode) => episode.id === record.activeEpisodeId);
        send(response, 200, {
          sessionId: session.id, sourceState: state, frameCount: session.frameCount,
          activeEpisodeId: activeEpisode?.status === 'recording' ? activeEpisode.id : null,
          frame: ['ready', 'recording'].includes(state) && session.frame && now - session.frame.receivedTimestampMs <= staleAfterMs
            ? session.frame : null,
        });
      } else if (method === 'POST' && match[2] === 'acknowledgements' && isSender && session.collection) {
        await collections.acknowledge(session.id, await readJson(request));
        send(response, 200, { acknowledged: true });
      } else if (method === 'POST' && match[2] === 'batches' && isSender && session.collection) {
        const { frames } = await readJson(request, 2_097_152);
        if (!Array.isArray(frames) || frames.length < 1 || frames.length > 64) throw new RelayError(400, '1~64개의 수집 프레임이 필요합니다.');
        const normalized = frames.map((frame) => ({
          sessionId: frame.sessionId, episodeId: frame.episodeId, sourceDeviceId: frame.sourceDeviceId,
          sequence: frame.sequence, frameEpoch: frame.frameEpoch, ...validateObservation(frame),
        }));
        const latest = await collections.appendFrames(session.id, normalized);
        // 새 미리보기가 살아 있으면 저장 완료된 과거 프레임으로 덮어쓰지 않는다.
        if (latest !== null && (session.previewAtMs === undefined || nowMs() - session.previewAtMs > staleAfterMs)) {
          session.frame = latest; session.frameCount += frames.length;
          stream.publish(session);
        }
        session.sourceState = 'recording'; session.lastSeenAtMs = now;
        send(response, 200, { receivedTimestampMs: now });
      } else if (method === 'DELETE' && !match[2] && isViewer) {
        sessions.delete(session.id);
        send(response, 200, { closed: true });
      } else if (method === 'POST' && match[2] === 'frames' && isSender) {
        receivePreview(session, await readJson(request));
        stream.publish(session);
        send(response, 200, { receivedTimestampMs: now });
      } else if (method === 'POST' && match[2] === 'presence' && isSender) {
        const { state } = await readJson(request);
        if (!['paired', 'ready', 'recording', 'offline', 'stale'].includes(state)) throw new RelayError(400, '연결 상태가 올바르지 않습니다.');
        session.sourceState = state;
        session.lastSeenAtMs = now;
        if (!['ready', 'recording'].includes(state)) session.frame = null;
        stream.publish(session);
        send(response, 200, { updated: true });
      } else {
        throw new RelayError(403, '허용되지 않는 세션 작업입니다.');
      }
    } catch (error) {
      if (response.headersSent) { response.destroy(); return true; }
      send(response, error instanceof RelayError ? error.status : 500, {
        message: error instanceof RelayError ? error.message : '손 추적 중계 요청을 처리하지 못했습니다.',
      });
    }
    return true;
  };
  handleQuestRequest.attachStream = stream.attach;
  return handleQuestRequest;
}
