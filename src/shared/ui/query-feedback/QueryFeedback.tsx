import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Panel } from '@/shared/ui/panel';
import { Spinner } from '@/shared/ui/spinner';
import { Surface } from '@/shared/ui/surface';

type QueryFeedbackProps =
  | {
      readonly kind: 'loading';
    }
  | {
      readonly kind: 'empty' | 'filtered-empty' | 'not-found' | 'stale-cache' | 'unavailable';
      readonly message: string;
      readonly onRetry?: () => void;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly onRetry: () => void;
    };

const titles = {
  empty: '표시할 데이터가 없습니다',
  'filtered-empty': '조건에 맞는 결과가 없습니다',
  'not-found': '대상을 찾을 수 없습니다',
  'stale-cache': '마지막 정상 데이터를 표시합니다',
  unavailable: '현재 사용할 수 없습니다',
} as const;

export function QueryFeedback(props: QueryFeedbackProps) {
  if (props.kind === 'loading') {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <Spinner className="size-6" label="불러오는 중" />
      </div>
    );
  }

  if (props.kind === 'empty' || props.kind === 'filtered-empty') {
    return (
      <Surface density="compact" className="flex min-w-0 items-center gap-[var(--layout-toolbar-gap)]">
        <p className="min-w-0 flex-1 break-words text-sm leading-6 text-muted" role="status">{props.message}</p>
        {props.onRetry === undefined ? null : (
          <Button className="shrink-0" onClick={props.onRetry} variant="secondary">
            다시 시도
          </Button>
        )}
      </Surface>
    );
  }

  if (props.kind === 'error') {
    return (
      <Surface density="compact" className="flex min-w-0 items-center gap-[var(--layout-toolbar-gap)]">
        <span className="shrink-0 text-status-negative-foreground">
          <Icon name="events" size="md" />
        </span>
        <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-6 text-foreground" role="alert">
          {props.message}
        </p>
        <Button className="shrink-0" onClick={props.onRetry} variant="secondary">
          다시 시도
        </Button>
      </Surface>
    );
  }

  return (
    <Panel title={titles[props.kind]}>
      <p role="status">{props.message}</p>
      {props.onRetry === undefined ? null : (
        <Button className="mt-4" onClick={props.onRetry} variant="secondary">
          다시 시도
        </Button>
      )}
    </Panel>
  );
}
