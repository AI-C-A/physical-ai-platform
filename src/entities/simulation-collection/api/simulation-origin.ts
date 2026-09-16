/**
 * 시뮬레이션(WebXR Action Annotation Factory)이 배포된 origin.
 * Quest와 PC 모니터가 같은 주소로 들어가야 같은 방을 공유하므로 한곳에서만 정한다.
 * `VITE_SIMULATION_ORIGIN`으로 바꾸고, 비어 있으면 Tailscale Funnel 주소를 쓴다.
 */
const DEFAULT_SIMULATION_ORIGIN = 'https://orca.tail58a6fa.ts.net';

export function simulationOrigin(): string {
  const configured = import.meta.env.VITE_SIMULATION_ORIGIN?.trim();
  return (configured ? configured : DEFAULT_SIMULATION_ORIGIN).replace(/\/+$/u, '');
}

/** 콘솔이 코드를 발급받으려 여는 릴레이 WebSocket 주소(기본 방). */
export function simulationRelayUrl(): string {
  const url = new URL('/party', simulationOrigin());
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return url.href;
}
