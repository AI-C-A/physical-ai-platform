import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Panel } from '@/shared/ui/panel';
import { Spinner } from '@/shared/ui/spinner';

type QueryFeedbackProps =
  | {
      readonly kind: 'loading';
    }
  | {
      readonly kind: 'empty' | 'not-found';
      readonly message: string;
    }
  | {
      readonly kind: 'error';
      readonly message: string;
      readonly onRetry: () => void;
    };

const titles = {
  error: '데이터를 불러오지 못했습니다',
  empty: '표시할 데이터가 없습니다',
  'not-found': '대상을 찾을 수 없습니다',
} as const;

export function QueryFeedback(props: QueryFeedbackProps) {
  if (props.kind === 'loading') {
    return (
      <div className="flex min-h-32 items-center justify-center">
        <Spinner className="size-6" label="불러오는 중" />
      </div>
    );
  }

  return (
    <Panel title={titles[props.kind]}>
      {props.kind === 'error' ? (
        <ErrorMessage>{props.message}</ErrorMessage>
      ) : <p role="status">{props.message}</p>}
      {props.kind === 'error' ? (
        <Button className="mt-4" onClick={props.onRetry} variant="secondary">
          다시 시도
        </Button>
      ) : null}
    </Panel>
  );
}
