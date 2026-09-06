import { Icon } from '@/shared/ui/icon';
import { getMediaStreamLabel, type MediaStreamState } from './media-stream-state';

export function MediaStreamPlaceholder({ state }: { readonly state: Extract<MediaStreamState, 'idle' | 'offline' | 'stale'> }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-media-background text-center" role="status">
      <div className="grid justify-items-center gap-2 px-4 text-media-foreground-muted">
        <Icon name={state === 'offline' ? 'wifi-off' : 'radio'} size="md" />
        <span className="text-sm font-semibold">{getMediaStreamLabel(state)}</span>
        <span className="text-xs">{state === 'offline' ? '연결과 전원 상태를 확인하세요.' : state === 'stale' ? '최근 데이터가 도착하지 않고 있습니다.' : '데이터 수신을 기다리고 있습니다.'}</span>
      </div>
    </div>
  );
}
