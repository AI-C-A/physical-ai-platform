import { randomBytes, randomInt } from 'node:crypto';

const base = '/api/quest/cameras';
const pairingLifetime = 5 * 60_000;
const idleLifetime = 60 * 60_000;
class CameraError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new CameraError(status, message); };
const token = () => randomBytes(32).toString('hex');

async function json(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) reject(415, 'JSON 요청이 필요합니다.');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 98_304) reject(413, '카메라 연결 정보가 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { return reject(400, '카메라 요청을 읽을 수 없습니다.'); }
}

/** 연결 정보만 중계한다. 영상은 JSON 대신 WebRTC로 직접 전달한다. */
export function createCameraRelay({ authorizeCollection, nowMs = Date.now, iceServers = [] }) {
  if (!Array.isArray(iceServers) || iceServers.length > 8 || iceServers.some((server) => !server
    || !(typeof server.urls === 'string' || (Array.isArray(server.urls) && server.urls.every((url) => typeof url === 'string'))))) {
    throw new Error('CAMERA_ICE_SERVERS must be an array of RTCIceServer configurations.');
  }
  const cameras = new Map();
  const attempts = new Map();
  const renew = (camera) => {
    let code;
    do { code = String(randomInt(100_000, 1_000_000)); }
    while ([...cameras.values()].some((item) => item.pairingCode === code));
    Object.assign(camera, { pairingCode: code, pairingExpiresAtMs: nowMs() + pairingLifetime,
      senderToken: null, senderSeenAtMs: null, viewerSeenAtMs: null, revision: camera.revision + 1,
      offer: null, answer: null });
  };
  const ownerView = (camera) => ({ id: camera.id, collectionId: camera.collectionId,
    label: camera.label, role: camera.role, viewerToken: camera.viewerToken,
    pairingCode: camera.senderToken === null ? camera.pairingCode : null,
    pairingExpiresAtMs: camera.pairingExpiresAtMs, paired: camera.senderToken !== null });
  const limit = (request) => {
    const address = request.socket.remoteAddress;
    const attempt = attempts.get(address) ?? { count: 0, until: nowMs() + 60_000 };
    if (attempt.count >= 60 || (!attempts.has(address) && attempts.size >= 1_024)) reject(429, '연결 요청이 많습니다. 잠시 후 다시 시도하세요.');
    attempt.count += 1;
    attempts.set(address, attempt);
  };
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://camera.internal');
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`)) return false;
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(body));
    };
    try {
      const now = nowMs();
      for (const [id, camera] of cameras) if (now - camera.touchedAtMs > idleLifetime) cameras.delete(id);
      for (const [address, attempt] of attempts) if (attempt.until <= now) attempts.delete(address);
      const method = request.method;
      const authorization = request.headers.authorization;
      if (url.pathname === base) {
        const input = method === 'POST' ? await json(request) : { collectionId: url.searchParams.get('collectionId') };
        if (!authorization || !await authorizeCollection(input.collectionId, authorization)) reject(403, '수집 세션에 카메라를 연결할 권한이 없습니다.');
        if (method === 'GET') send(200, [...cameras.values()].filter((camera) => camera.collectionId === input.collectionId).map(ownerView));
        else if (method === 'POST') {
          limit(request);
          if (!['head', 'full-body'].includes(input.role) || typeof input.label !== 'string' || !input.label.trim() || input.label.length > 80) reject(400, '카메라 이름과 용도를 확인하세요.');
          if (cameras.size >= 128 || [...cameras.values()].filter((camera) => camera.collectionId === input.collectionId).length >= 16) reject(409, '수집 세션에는 카메라를 최대 16대 연결할 수 있습니다.');
          const camera = { id: token(), collectionId: input.collectionId, label: input.label.trim(), role: input.role,
            viewerToken: token(), revision: 0, touchedAtMs: now };
          renew(camera); cameras.set(camera.id, camera);
          send(201, ownerView(camera));
        } else reject(405, '지원하지 않는 카메라 요청입니다.');
        return true;
      }
      if (url.pathname === `${base}/pair` && method === 'POST') {
        limit(request);
        const input = await json(request);
        const camera = [...cameras.values()].find((item) => item.pairingCode === input.pairingCode && item.senderToken === null && item.pairingExpiresAtMs > now);
        if (!camera) reject(404, '코드가 만료되었거나 이미 사용되었습니다. PC에서 새 코드를 받으세요.');
        if (!await authorizeCollection(camera.collectionId)) reject(410, '수집 세션이 종료되었습니다.');
        // 권한 확인 중 다른 요청이 일회용 코드를 사용했을 수 있으므로 다시 확인한다.
        if (!cameras.has(camera.id) || camera.senderToken !== null || camera.pairingCode !== input.pairingCode || camera.pairingExpiresAtMs <= nowMs()) reject(409, '이미 사용되었거나 만료된 연결 코드입니다.');
        camera.senderToken = token(); camera.senderSeenAtMs = now; camera.touchedAtMs = now;
        send(200, { id: camera.id, label: camera.label, role: camera.role, senderToken: camera.senderToken });
        return true;
      }
      const match = url.pathname.match(/^\/api\/quest\/cameras\/([a-f0-9]{64})(?:\/(offer|answer|renew|refresh-code|leave))?$/u);
      const camera = match ? cameras.get(match[1]) : null;
      if (!camera) reject(404, '카메라 연결이 만료되었습니다. PC에서 다시 추가하세요.');
      const viewer = authorization === `Bearer ${camera.viewerToken}`;
      const sender = camera.senderToken !== null && authorization === `Bearer ${camera.senderToken}`;
      if (!viewer && !sender) reject(401, '카메라 연결 권한이 없습니다.');
      const assertCurrent = () => {
        if (!cameras.has(camera.id) || (sender && authorization !== `Bearer ${camera.senderToken}`)) reject(401, '카메라 연결 권한이 만료되었습니다.');
      };
      if (!await authorizeCollection(camera.collectionId)) { cameras.delete(camera.id); reject(410, '수집 세션이 종료되었습니다.'); }
      assertCurrent();
      camera.touchedAtMs = now;
      if (method === 'GET' && !match[2]) {
        if (sender) camera.senderSeenAtMs = now;
        else camera.viewerSeenAtMs = now;
        send(200, { id: camera.id, revision: camera.revision, paired: camera.senderToken !== null,
          peerOnline: (viewer ? camera.senderSeenAtMs : camera.viewerSeenAtMs) !== null
            && now - (viewer ? camera.senderSeenAtMs : camera.viewerSeenAtMs) < 30_000,
          offer: sender ? camera.offer : null, answer: viewer ? camera.answer : null, iceServers });
      } else if (method === 'DELETE' && !match[2] && viewer) {
        cameras.delete(camera.id); send(200, { removed: true });
      } else if (method === 'POST' && (match[2] === 'renew' || match[2] === 'refresh-code') && viewer) {
        await json(request);
        assertCurrent();
        // 자동 갱신 요청과 페어링이 겹쳐도 이미 연결된 송신자를 해제하지 않는다.
        if (match[2] === 'renew' || (camera.senderToken === null && camera.pairingExpiresAtMs <= nowMs())) renew(camera);
        send(200, ownerView(camera));
      } else if (method === 'POST' && match[2] === 'leave') {
        const input = await json(request);
        assertCurrent();
        if (sender && input.revision === camera.revision) { camera.senderSeenAtMs = null; camera.answer = null; camera.offer = null; camera.revision += 1; }
        else if (input.revision === camera.revision) { camera.viewerSeenAtMs = null; camera.offer = null; camera.answer = null; camera.revision += 1; }
        send(200, { left: true });
      } else if (method === 'POST' && ((match[2] === 'offer' && viewer) || (match[2] === 'answer' && sender))) {
        const input = await json(request);
        assertCurrent();
        if (typeof input.sdp !== 'string' || input.sdp.length > 65_536 || !input.sdp.startsWith('v=0')) reject(400, '영상 연결 정보가 올바르지 않습니다.');
        if (match[2] === 'offer') {
          camera.revision += 1; camera.offer = { type: 'offer', sdp: input.sdp }; camera.answer = null;
        } else {
          if (input.revision !== camera.revision || camera.offer === null) reject(409, '새 영상 연결을 기다리는 중입니다.');
          camera.answer = { type: 'answer', sdp: input.sdp };
        }
        send(200, { revision: camera.revision });
      } else reject(403, '허용되지 않는 카메라 작업입니다.');
    } catch (error) {
      send(error instanceof CameraError ? error.status : 500, { message: error instanceof CameraError ? error.message : '카메라 연결 요청을 처리하지 못했습니다.' });
    }
    return true;
  };
}
