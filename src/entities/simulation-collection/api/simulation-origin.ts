/**
 * 시뮬레이션(WebXR Action Annotation Factory)이 배포된 origin.
 * Quest와 PC 모니터가 같은 주소로 들어가야 같은 방을 공유하므로 한곳에서만 정한다.
 * `VITE_SIMULATION_ORIGIN`으로 바꾸고, 비어 있으면 Tailscale Funnel 주소를 쓴다.
 */
const DEFAULT_SIMULATION_ORIGIN = 'https://orca.tail58a6fa.ts.net';

/** 시뮬레이션의 참가자 표시 이름 상한. 릴레이가 이 길이로 자른다. */
export const SIMULATION_NAME_MAX = 24;
/** 방 이름 상한. 릴레이가 이 길이로 자른다. */
export const SIMULATION_ROOM_MAX = 40;

export function simulationOrigin(): string {
  const configured = import.meta.env.VITE_SIMULATION_ORIGIN?.trim();
  return (configured ? configured : DEFAULT_SIMULATION_ORIGIN).replace(/\/+$/u, '');
}

/** 릴레이가 허용하는 형태로 방 이름을 정리한다. 비어 있으면 기본 방(`main`)이 된다. */
export function normalizeSimulationRoom(value: string): string {
  return value.trim().slice(0, SIMULATION_ROOM_MAX) || 'main';
}

/**
 * 참가자가 브라우저에서 여는 페이지 주소.
 * `spectate`를 켜면 시뮬레이션이 헤드셋 시점을 그대로 비추는 관전 모드로 바로 들어간다
 * (PC 모니터가 "VR에서 받아온 화면"을 띄우는 데 쓴다).
 */
export function simulationPageUrl(room: string, options: { readonly name?: string; readonly spectate?: boolean } = {}): string {
  const url = new URL('/', simulationOrigin());
  url.searchParams.set('room', normalizeSimulationRoom(room));
  if (options.name !== undefined) url.searchParams.set('name', options.name.slice(0, SIMULATION_NAME_MAX));
  if (options.spectate === true) url.searchParams.set('spectate', '1');
  return url.href;
}

// 사람이 헤드셋에서 입력하기 쉬운 코드 문자셋: 헷갈리는 0/O/1/I/5/S 제외.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
const ROOM_CODE_LENGTH = 6;

/**
 * 수집 세션 ID에서 방 코드를 만든다. 세션마다 안정적이고, VR 로비의 방 입력란에
 * 그대로 칠 수 있는 짧은 코드다(= 릴레이 방 이름). 저장 없이 ID에서 매번 같은 값이 나온다.
 */
export function deriveRoomCode(sessionId: string): string {
  // FNV-1a 변형 두 개로 32비트씩 뽑아 6자리를 채운다. 암호 강도가 아니라 표시용이다.
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < sessionId.length; i += 1) {
    const c = sessionId.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  let value = (h1 ^ Math.imul(h2, 0x27d4eb2f)) >>> 0;
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    // 두 해시를 번갈아 섞어 6자리를 채운다.
    if (i === 3) value = (value ^ h2) >>> 0;
    code += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
    value = Math.floor(value / ROOM_CODE_ALPHABET.length) || h1;
  }
  return code;
}

/** 모니터가 여는 릴레이 WebSocket 주소. */
export function simulationRelayUrl(room: string): string {
  const url = new URL('/party', simulationOrigin());
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  url.searchParams.set('room', normalizeSimulationRoom(room));
  return url.href;
}
