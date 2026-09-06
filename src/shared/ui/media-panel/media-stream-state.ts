export type MediaStreamState = 'live' | 'recorded' | 'idle' | 'offline' | 'stale';

export function getMediaStreamLabel(state: MediaStreamState): string {
  return { live: '실시간', recorded: '기록', idle: '수신 대기', offline: '연결 끊김', stale: '수신 지연' }[state];
}
