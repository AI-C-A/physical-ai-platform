import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  PatrolApiStatusCheckError,
  usePatrolApiStatusPort,
} from '@/entities/robot';
import {
  useColorSchemePreference,
  useMapStylePreference,
} from '@/shared/config';
import { formatDateTime } from '@/shared/lib/format';
import { useClock } from '@/shared/lib/clock';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { Panel } from '@/shared/ui/panel';
import { Select } from '@/shared/ui/select';

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

interface SettingsPageProps {
  readonly showMapStyleSettings?: boolean;
}

const colorSchemeOptions = [
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
  { label: '시스템', value: 'system' },
] as const;

interface SettingsRowProps {
  readonly children: ReactNode;
  readonly description: string;
  readonly title: string;
}

function SettingsRow({
  children,
  description,
  title,
}: SettingsRowProps) {
  return (
    <div className="grid min-h-[var(--layout-data-row-height)] gap-4 py-5 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)] md:items-center">
      <div className="grid gap-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="max-w-2xl text-sm text-muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function AppearanceSettings() {
  const { preference, selectPreference } = useColorSchemePreference();

  return (
    <SettingsRow
      description="시스템 설정을 따르거나 라이트·다크 모드를 고정합니다."
      title="화면 모드"
    >
      <Select
        className="w-full md:w-56 md:justify-self-end"
        label="색상 모드"
        onValueChange={selectPreference}
        options={colorSchemeOptions}
        showLabel={false}
        value={preference}
      />
    </SettingsRow>
  );
}

function MapStyleSettings() {
  const {
    availableStyles,
    selectedStyle,
    selectMapStyle,
  } = useMapStylePreference();
  const options = availableStyles.map((style) => ({
    label: style.label,
    value: style.id,
  }));

  return (
    <SettingsRow
      description="실외 모니터링 지도에 적용하며 실내 3D 지도에는 영향을 주지 않습니다."
      title="지도 스타일"
    >
      <Select
        className="w-full md:w-56 md:justify-self-end"
        label="지도 스타일"
        onValueChange={selectMapStyle}
        options={options}
        showLabel={false}
        value={selectedStyle.id}
      />
    </SettingsRow>
  );
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

export function SettingsPage({
  showMapStyleSettings = false,
}: SettingsPageProps) {
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
        description="표시 방식과 외부 서비스 연결을 관리합니다."
        title="설정"
      />
      <Panel
        contentClassName="divide-y divide-border"
        title="화면"
      >
        <AppearanceSettings />
        {showMapStyleSettings ? <MapStyleSettings /> : null}
      </Panel>
      <Panel title="외부 연결">
        <section aria-labelledby="patrol-api-title" className="grid gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1">
              <h3 className="font-semibold text-foreground" id="patrol-api-title">
                Patrol API
              </h3>
              <p className="text-sm text-muted">
                로봇 정보를 불러오는 연결을 확인합니다.
              </p>
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
        </section>
      </Panel>
    </div>
  );
}
