import { useEffect, useRef, useState } from 'react';

import {
  PatrolApiStatusCheckError,
  usePatrolApiStatusPort,
} from '@/entities/robot';
import { formatDateTime } from '@/shared/lib/format';
import { useClock } from '@/shared/lib/clock';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { DetailPane } from '@/shared/ui/detail-pane';
import { PageHeader } from '@/shared/ui/page-header';
import { Panel } from '@/shared/ui/panel';

type CheckStatus =
  | 'unconfigured'
  | 'unchecked'
  | 'checking'
  | 'healthy'
  | 'error';

interface CheckState {
  readonly checkedAtMs: number | null;
  readonly message: string;
  readonly status: CheckStatus;
}

function createInitialState(endpoint: string | null): CheckState {
  return endpoint === null
    ? {
        checkedAtMs: null,
        message: 'Patrol API 연결 주소가 설정되지 않았습니다.',
        status: 'unconfigured',
      }
    : {
        checkedAtMs: null,
        message: '아직 연결 상태를 확인하지 않았습니다.',
        status: 'unchecked',
      };
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'name' in error
    && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  return error instanceof PatrolApiStatusCheckError && error.reason === 'timeout'
    ? '응답이 늦어 상태를 확인하지 못했습니다. 다시 시도해 주세요.'
    : 'Patrol API 상태를 확인하지 못했습니다. 연결 설정을 확인한 뒤 다시 시도해 주세요.';
}

function getStatusPresentation(status: CheckStatus): {
  readonly label: string;
  readonly tone: 'neutral' | 'positive' | 'negative' | 'info';
} {
  if (status === 'unconfigured') return { label: '미설정', tone: 'neutral' };
  if (status === 'checking') return { label: '확인 중', tone: 'info' };
  if (status === 'healthy') return { label: '정상', tone: 'positive' };
  if (status === 'error') return { label: '오류', tone: 'negative' };
  return { label: '확인 전', tone: 'neutral' };
}

export function SettingsPage() {
  const clock = useClock();
  const patrolApiStatus = usePatrolApiStatusPort();
  const activeControllerRef = useRef<AbortController | null>(null);
  const [checkState, setCheckState] = useState<CheckState>(
    () => createInitialState(patrolApiStatus.endpoint),
  );
  const presentation = getStatusPresentation(checkState.status);
  const hasChecked =
    checkState.status === 'healthy' || checkState.status === 'error';

  useEffect(() => () => {
    const controller = activeControllerRef.current;
    activeControllerRef.current = null;
    controller?.abort();
  }, []);

  const checkPatrolApi = async (): Promise<void> => {
    if (patrolApiStatus.endpoint === null) return;

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setCheckState((current) => ({
      ...current,
      message: 'Patrol API 연결을 확인하고 있습니다.',
      status: 'checking',
    }));

    try {
      await patrolApiStatus.check(controller.signal);
      if (activeControllerRef.current !== controller) return;
      setCheckState({
        checkedAtMs: clock.nowMs(),
        message: '로봇 정보를 정상적으로 불러왔습니다.',
        status: 'healthy',
      });
    } catch (error: unknown) {
      if (
        activeControllerRef.current !== controller
        || isAbortError(error)
      ) {
        return;
      }
      setCheckState({
        checkedAtMs: clock.nowMs(),
        message: getErrorMessage(error),
        status: 'error',
      });
    } finally {
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    }
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        description="외부 서비스의 연결 상태를 확인합니다."
        title="설정"
      />
      <Panel
        description="로봇 정보를 불러올 수 있는지 확인합니다."
        title="Patrol API 연결 상태"
      >
        <DetailPane
          aria-labelledby="patrol-api-title"
          layer="base"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3
                className="font-bold text-foreground"
                id="patrol-api-title"
              >
                Patrol API
              </h3>
            </div>
            <Badge tone={presentation.tone}>{presentation.label}</Badge>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
            <dt className="font-semibold text-muted">연결 주소</dt>
            <dd className="min-w-0">
              {patrolApiStatus.endpoint === null ? (
                <span className="text-muted">설정되지 않음</span>
              ) : (
                <code className="break-all rounded bg-surface px-2 py-1 text-xs text-foreground">
                  {patrolApiStatus.endpoint}
                </code>
              )}
            </dd>
            <dt className="font-semibold text-muted">마지막 확인</dt>
            <dd className="text-muted">
              {formatDateTime(checkState.checkedAtMs)}
            </dd>
          </dl>

          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p
              aria-atomic="true"
              aria-live="polite"
              className={
                checkState.status === 'error'
                  ? 'text-sm text-status-negative-foreground'
                  : 'text-sm text-muted'
              }
            >
              {checkState.message}
            </p>
            <Button
              disabled={patrolApiStatus.endpoint === null}
              isLoading={checkState.status === 'checking'}
              onClick={() => void checkPatrolApi()}
              variant="secondary"
            >
              {checkState.status === 'checking'
                ? '연결 확인 중'
                : hasChecked
                  ? '다시 확인'
                  : '상태 확인'}
            </Button>
          </div>
        </DetailPane>
      </Panel>
    </div>
  );
}
