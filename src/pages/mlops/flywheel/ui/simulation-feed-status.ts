import type { SimulationFeed } from '@/entities/simulation-collection';
import type { StatusIndicatorTone } from '@/shared/ui/status-indicator';

/** 시뮬레이션 화면(iframe)에서 스냅샷을 받는 상태를 표시 문구로 바꾼다. */
export function feedStatus(feed: SimulationFeed): { readonly label: string; readonly tone: StatusIndicatorTone } {
  if (!feed.connected) return { label: '시뮬레이션 화면 연결 대기', tone: 'neutral' };
  if (feed.recording || feed.task !== null) return { label: '수집 데이터 수신 중', tone: 'positive' };
  return { label: '시뮬레이션 화면 연결됨', tone: 'positive' };
}
