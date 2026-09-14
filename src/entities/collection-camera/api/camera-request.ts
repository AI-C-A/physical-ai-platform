import { mockCameraRequest, usesMockCameras } from './mock-camera-request';
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const integer = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const role = (value: unknown): boolean => value === 'head' || value === 'full-body';
const identity = (value: Record<string, unknown>): boolean => text(value.id) && text(value.label) && role(value.role);
const binding = (value: unknown): boolean => object(value) && identity(value) && text(value.collectionId)
  && text(value.viewerToken) && typeof value.paired === 'boolean' && integer(value.pairingExpiresAtMs)
  && (value.paired ? value.pairingCode === null : typeof value.pairingCode === 'string' && /^\d{6}$/u.test(value.pairingCode));
const description = (value: unknown, type: 'offer' | 'answer'): boolean => value === null
  || (object(value) && value.type === type && typeof value.sdp === 'string' && value.sdp.startsWith('v=0') && value.sdp.length <= 65_536);
const iceServer = (value: unknown): boolean => object(value)
  && (text(value.urls) || (Array.isArray(value.urls) && value.urls.length > 0 && value.urls.every(text)))
  && (value.username === undefined || typeof value.username === 'string')
  && (value.credential === undefined || typeof value.credential === 'string');

/** HTTP 경계에서 경로별 DTO를 검증한 뒤 카메라 모델로 전달한다. */
function validResponse(path: string, method: string, value: unknown): boolean {
  if (path.startsWith('?') && method === 'GET') return Array.isArray(value) && value.length <= 16 && value.every(binding);
  if (path === '' || /\/(renew|refresh-code)$/u.test(path)) return binding(value);
  if (!object(value)) return false;
  if (path === '/pair') return identity(value) && text(value.senderToken);
  if (method === 'DELETE') return value.removed === true;
  if (path.endsWith('/leave')) return value.left === true;
  if (/\/(offer|answer)$/u.test(path)) return integer(value.revision);
  return text(value.id) && integer(value.revision) && typeof value.paired === 'boolean'
    && typeof value.peerOnline === 'boolean' && description(value.offer, 'offer') && description(value.answer, 'answer')
    && Array.isArray(value.iceServers) && value.iceServers.length <= 8 && value.iceServers.every(iceServer);
}

export async function cameraRequest<T>(path: string, token?: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (usesMockCameras()) {
    const result = await mockCameraRequest(path, token, method, body);
    signal?.throwIfAborted();
    if (!validResponse(path, method, result)) throw new Error('카메라 응답 형식이 올바르지 않습니다.');
    return result as T;
  }
  const response = await fetch(`/api/quest/cameras${path}`, {
    method, cache: 'no-store', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(object(result) && typeof result.message === 'string'
    ? result.message : '카메라 연결 요청에 실패했습니다.');
  if (!validResponse(path, method, result)) throw new Error('카메라 서버의 응답 형식이 올바르지 않습니다.');
  return result as T;
}

/** 수집 세션의 카메라 관리 권한을 조회한다. */
export async function getCameraOwnerToken(sessionId: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (usesMockCameras()) return `mock-owner-${sessionId}`;
  const response = await fetch(`/api/quest/collections/${encodeURIComponent(sessionId)}`, {
    cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });
  if (!response.ok) throw new Error('수집 세션의 카메라 연결 정보를 불러오지 못했습니다.');
  const record: unknown = await response.json();
  if (!object(record) || !text(record.viewerToken)) throw new Error('카메라 연결을 지원하는 수집 서버가 필요합니다.');
  return record.viewerToken;
}

/** 로컬 연결은 동일 origin을 사용하고 원격 연결은 지정된 수집 주소를 사용한다. */
export function cameraCollectorOrigin(): string {
  return (!usesMockCameras() && import.meta.env.VITE_COLLECTOR_ORIGIN?.trim()) || window.location.origin;
}
