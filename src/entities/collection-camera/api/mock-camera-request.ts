import type { CameraBinding } from '../model/camera';

export const usesMockCameras = (): boolean => ['mock', 'development'].includes(import.meta.env.MODE);
interface CameraRecord extends CameraBinding {
  senderToken: string | null;
  revision: number;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  viewerSeen: number;
  senderSeen: number;
}
const key = 'collection-mock-cameras-v1';
const ownerView = (item: CameraRecord): CameraBinding => ({ id: item.id, collectionId: item.collectionId, label: item.label, role: item.role, viewerToken: item.viewerToken, pairingCode: item.pairingCode, pairingExpiresAtMs: item.pairingExpiresAtMs, paired: item.paired });
const code = () => String(100_000 + crypto.getRandomValues(new Uint32Array(1))[0]! % 900_000);

interface CameraInput {
  collectionId?: string;
  role?: CameraRecord['role'];
  label?: string;
  code?: string;
  pairingCode?: string;
  restart?: boolean;
  revision?: number;
  sdp?: string;
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const number = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const description = (value: unknown, type: 'offer' | 'answer'): boolean => value === null
  || (object(value) && value.type === type && text(value.sdp) && value.sdp.startsWith('v=0') && value.sdp.length <= 65_536);
function isCameraRecord(value: unknown): value is CameraRecord {
  return object(value) && ['id', 'collectionId', 'label', 'viewerToken'].every((key) => text(value[key]) && value[key] !== '')
    && (value.role === 'head' || value.role === 'full-body') && typeof value.paired === 'boolean'
    && (value.pairingCode === null || (text(value.pairingCode) && /^\d{6}$/u.test(value.pairingCode)))
    && (value.senderToken === null || text(value.senderToken))
    && ['pairingExpiresAtMs', 'revision', 'viewerSeen', 'senderSeen'].every((key) => number(value[key]))
    && description(value.offer, 'offer') && description(value.answer, 'answer');
}
function isCameraInput(value: unknown): value is CameraInput {
  return object(value) && ['collectionId', 'label', 'code', 'pairingCode', 'sdp'].every((key) => value[key] === undefined || text(value[key]))
    && (value.role === undefined || value.role === 'head' || value.role === 'full-body')
    && (value.restart === undefined || typeof value.restart === 'boolean')
    && (value.revision === undefined || number(value.revision))
    && (value.sdp === undefined || (text(value.sdp) && value.sdp.startsWith('v=0') && value.sdp.length <= 65_536));
}

/** 동일 origin의 브라우저끼리 게이트웨이의 연결 코드 수명과 SDP 교환을 재현한다. */
export async function mockCameraRequest(path: string, token: string | undefined, method: string, body: unknown): Promise<unknown> {
  const run = () => {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(stored) || !stored.every(isCameraRecord)) throw new Error('저장된 카메라 연결 정보가 올바르지 않습니다.');
    const records = stored;
    const input: unknown = body ?? {};
    if (!isCameraInput(input)) throw new Error('카메라 요청 형식이 올바르지 않습니다.');
    const now = Date.now();
    const save = () => localStorage.setItem(key, JSON.stringify(records));
    const freshCode = () => { let next = code(); while (records.some((item) => item.pairingCode === next)) next = code(); return next; };
    if (path.startsWith('?') || path === '') {
      const collectionId = input.collectionId ?? new URLSearchParams(path.slice(1)).get('collectionId');
      if (!collectionId || token !== `mock-owner-${collectionId}`) throw new Error('수집 세션의 연결 정보를 새로고침하세요.');
      if (method === 'GET') return records.filter((item) => item.collectionId === collectionId).map(ownerView);
      if (!input.label || !['head', 'full-body'].includes(input.role ?? '')) throw new Error('카메라 종류를 선택하세요.');
      if (records.filter((item) => item.collectionId === collectionId).length >= 16) throw new Error('카메라는 최대 16대 연결할 수 있습니다.');
      const item: CameraRecord = { id: crypto.randomUUID(), collectionId, label: input.label, role: input.role!, viewerToken: crypto.randomUUID(), pairingCode: freshCode(), pairingExpiresAtMs: now + 300_000, paired: false, senderToken: null, revision: 0, offer: null, answer: null, viewerSeen: 0, senderSeen: 0 };
      records.push(item); save(); return ownerView(item);
    }
    if (path === '/pair') {
      const item = records.find((record) => record.pairingCode === (input.code ?? input.pairingCode) && record.pairingExpiresAtMs > now && !record.paired);
      if (!item) throw new Error('연결 코드를 확인하거나 PC에서 새 코드를 받으세요.');
      Object.assign(item, { paired: true, pairingCode: null, senderToken: crypto.randomUUID() }); save();
      return { id: item.id, label: item.label, role: item.role, senderToken: item.senderToken };
    }
    const [, id, action] = path.split('/');
    const item = records.find((record) => record.id === id);
    if (!item || !token || ![item.viewerToken, item.senderToken].includes(token)) throw new Error('카메라 연결을 찾을 수 없습니다.');
    const viewer = token === item.viewerToken;
    if (method === 'DELETE' && viewer) { records.splice(records.indexOf(item), 1); save(); return { removed: true }; }
    if (action === 'refresh-code' || action === 'renew') {
      if (!viewer) throw new Error('PC에서 연결 코드를 받으세요.');
      if (!item.paired && (input.restart || item.pairingExpiresAtMs <= now)) Object.assign(item, { pairingCode: freshCode(), pairingExpiresAtMs: now + 300_000 });
      save(); return ownerView(item);
    }
    if (action === 'leave') {
      if (input.revision === item.revision) {
        if (viewer) Object.assign(item, { viewerSeen: 0, offer: null, answer: null });
        else Object.assign(item, { senderSeen: 0, answer: null });
      }
      save(); return { left: true };
    }
    if (action === 'offer' && viewer && input.sdp) Object.assign(item, { revision: item.revision + 1, offer: { type: 'offer', sdp: input.sdp }, answer: null });
    else if (action === 'answer' && !viewer && input.revision === item.revision && input.sdp) Object.assign(item, { answer: { type: 'answer', sdp: input.sdp } });
    else if (action) throw new Error('카메라 연결 상태가 변경되었습니다. 다시 연결하세요.');
    if (viewer) item.viewerSeen = now; else item.senderSeen = now;
    save();
    if (action) return { revision: item.revision };
    return { id, revision: item.revision, paired: item.paired, peerOnline: now - (viewer ? item.senderSeen : item.viewerSeen) < 5_000, offer: item.offer, answer: item.answer, iceServers: [] };
  };
  return navigator.locks ? navigator.locks.request(key, run) : run();
}
