import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

interface RobotOfflineNoticeProps {
  readonly onReconnect: () => void;
}

export function RobotOfflineNotice({ onReconnect }: RobotOfflineNoticeProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <span aria-atomic="true" aria-label="실시간 상태: 오프라인. 마지막으로 확인한 정보를 표시합니다." role="status">
        <Badge tone="negative">오프라인</Badge>
      </span>
      <Button onClick={onReconnect} variant="secondary">다시 연결</Button>
    </div>
  );
}
