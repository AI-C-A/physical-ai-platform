import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getCapturePreflightStatusLabel,
  getCaptureSessionStatusLabel,
  getCaptureStreamStatusLabel,
  useCaptureSessionCommand,
  useCreateCaptureSessionCommand,
  useCaptureOperationsPort,
  useCaptureSessions,
  type CaptureCommand,
  type CapturePlanOptions,
  type CaptureSession,
  type CaptureSessionStatus,
  type ExecutionProvenance,
} from '@/entities/capture-session';
import { useRobotCatalog } from '@/entities/robot';
import { useSensorDeviceCatalog } from '@/entities/sensor-device';
import { useAsyncQuery } from '@/shared/lib/async-query';
import {
  getControlModeLabel,
  getDataOriginLabel,
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
  getExecutionProvenanceLabel,
} from '@/shared/domain';
import { formatBytes, formatRateHertz } from '@/shared/lib/format';
import { appendPathSegment } from '@/shared/lib/navigation';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Input } from '@/shared/ui/input';
import { PageHeader } from '@/shared/ui/page-header';
import { Panel } from '@/shared/ui/panel';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Select } from '@/shared/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

const flow: readonly CaptureSessionStatus[] = [
  'draft',
  'validating',
  'ready',
  'starting',
  'recording',
  'stopping',
  'finalizing',
  'processing',
  'completed',
];

const resumableStatuses: readonly CaptureSessionStatus[] = [
  'draft',
  'validating',
  'ready',
  'starting',
  'recording',
  'stopping',
  'finalizing',
  'processing',
];

function chooseSupported<T extends string>(
  requested: T,
  supported: readonly T[],
): T {
  return supported.includes(requested) ? requested : (supported[0] ?? requested);
}

function getStatusTone(
  status: CaptureSessionStatus,
): 'positive' | 'negative' | 'info' {
  if (status === 'completed') return 'positive';
  if (status === 'failed' || status === 'interrupted') return 'negative';
  return 'info';
}

export function CapturePage() {
  const robots = useRobotCatalog();
  const sensors = useSensorDeviceCatalog();
  const sessions = useCaptureSessions();
  const operations = useCaptureOperationsPort();
  const [name, setName] = useState('');
  const [robotId, setRobotId] = useState('');
  const [sensorId, setSensorId] = useState('');
  const [provenance, setProvenance] = useState<ExecutionProvenance>({
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'autonomous',
    dataOrigin: 'captured',
  });
  const [selectedStreamIds, setSelectedStreamIds] = useState<readonly string[]>(
    [],
  );
  const [hasCustomizedStreams, setHasCustomizedStreams] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<CaptureSession | null>(null);
  const [isPreparingNewCapture, setIsPreparingNewCapture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionSubscriptionFailure, setSessionSubscriptionFailure] =
    useState<{
      readonly message: string;
      readonly operations: typeof operations;
      readonly retrySequence: number;
      readonly sessionId: string;
    } | null>(null);
  const [sessionSubscriptionRetrySequence, setSessionSubscriptionRetrySequence] =
    useState(0);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const shouldFocusStatusRef = useRef(false);
  const selectionGenerationRef = useRef(0);

  useEffect(() => () => {
    selectionGenerationRef.current += 1;
  }, []);

  const activeSessions = useMemo(() => {
    if (sessions.status !== 'ready') return [];
    return [...sessions.data]
      .filter((item) => resumableStatuses.includes(item.status))
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
  }, [sessions]);
  const session = isPreparingNewCapture
    ? null
    : selectedSession ?? activeSessions[0] ?? null;

  const selectedRobot =
    robots.status === 'ready'
      ? (robots.robots.find((robot) => robot.id === robotId) ?? robots.robots[0])
      : undefined;
  const selectedSensor =
    sensors.status === 'ready'
      ? (sensors.sensorDevices.find((sensor) => sensor.id === sensorId) ??
        sensors.sensorDevices[0])
      : undefined;
  const targetRobotId = session?.robotId ?? selectedRobot?.id ?? '';
  const targetSensorId = session?.sensorDeviceId ?? selectedSensor?.id ?? '';
  const captureRobot =
    robots.status === 'ready'
      ? robots.robots.find((robot) => robot.id === targetRobotId)
      : undefined;
  const captureSensor =
    sensors.status === 'ready'
      ? sensors.sensorDevices.find((sensor) => sensor.id === targetSensorId)
      : undefined;
  const loadPlan = useCallback<() => Promise<CapturePlanOptions | null>>(
    () =>
      session !== null || targetRobotId === '' || targetSensorId === ''
        ? Promise.resolve(null)
        : operations.getPlanOptions(targetRobotId, targetSensorId),
    [operations, session, targetRobotId, targetSensorId],
  );
  const plan = useAsyncQuery(loadPlan);
  const planOptions = plan.status === 'ready' ? plan.data : null;
  const sessionId = session?.id ?? null;
  const sessionSubscriptionError =
    sessionSubscriptionFailure !== null
    && sessionSubscriptionFailure.operations === operations
    && sessionSubscriptionFailure.sessionId === sessionId
    && sessionSubscriptionFailure.retrySequence
      === sessionSubscriptionRetrySequence
      ? sessionSubscriptionFailure.message
      : null;
  const createCommand = useCreateCaptureSessionCommand();
  const validateCommand = useCaptureSessionCommand(sessionId, 'validate');
  const startCommand = useCaptureSessionCommand(sessionId, 'start');
  const stopCommand = useCaptureSessionCommand(sessionId, 'stop');
  const createCommandSnapshot = createCommand.snapshot;
  const resetCreateCommand = createCommand.reset;
  const validateCommandSnapshot = validateCommand.snapshot;
  const resetValidateCommand = validateCommand.reset;
  const startCommandSnapshot = startCommand.snapshot;
  const resetStartCommand = startCommand.reset;
  const stopCommandSnapshot = stopCommand.snapshot;
  const resetStopCommand = stopCommand.reset;
  const commands = [
    createCommand,
    validateCommand,
    startCommand,
    stopCommand,
  ] as const;
  const isPending = commands.some(
    (command) => command.snapshot.status === 'pending'
      || command.snapshot.status === 'success',
  );
  const commandError = commands.find(
    (command) => command.snapshot.status === 'error',
  )?.snapshot;
  const displayedError = error ?? (
    commandError?.status === 'error' ? commandError.message : null
  );
  const handledOperationIdsRef = useRef(new Set<string>());
  const adoptedCreateSubmissionRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      createCommandSnapshot.status !== 'pending'
      && createCommandSnapshot.status !== 'error'
    ) {
      return;
    }
    if (adoptedCreateSubmissionRef.current === createCommandSnapshot.operationId) return;
    adoptedCreateSubmissionRef.current = createCommandSnapshot.operationId;
    const input = createCommandSnapshot.submittedInput;
    setName(input.name);
    setRobotId(input.robotId);
    setSensorId(input.sensorDeviceId);
    setProvenance(input.provenance);
    setSelectedStreamIds(input.streams.map((stream) => stream.id));
    setHasCustomizedStreams(true);
    setSelectedSession(null);
    setIsPreparingNewCapture(true);
    setNameError(null);
  }, [createCommandSnapshot]);

  useEffect(() => {
    if (createCommandSnapshot.status !== 'success') return;
    const handledKey = `create:${String(createCommandSnapshot.operationId)}`;
    if (handledOperationIdsRef.current.has(handledKey)) return;
    handledOperationIdsRef.current.add(handledKey);
    shouldFocusStatusRef.current = true;
    setIsPreparingNewCapture(false);
    setSelectedSession(createCommandSnapshot.result);
    resetCreateCommand();
  }, [createCommandSnapshot, resetCreateCommand]);

  useEffect(() => {
    const settledCommands = [
      ['validate', validateCommandSnapshot, resetValidateCommand],
      ['start', startCommandSnapshot, resetStartCommand],
      ['stop', stopCommandSnapshot, resetStopCommand],
    ] as const;
    settledCommands.forEach(([kind, snapshot, reset]) => {
      if (snapshot.status !== 'success') return;
      const handledKey = `${kind}:${String(snapshot.operationId)}`;
      if (handledOperationIdsRef.current.has(handledKey)) return;
      handledOperationIdsRef.current.add(handledKey);
      reset();
      shouldFocusStatusRef.current = false;
      statusRef.current?.focus();
    });
  }, [
    resetStartCommand,
    resetStopCommand,
    resetValidateCommand,
    startCommandSnapshot,
    stopCommandSnapshot,
    validateCommandSnapshot,
  ]);

  useEffect(() => {
    if (sessionId === null) return undefined;
    const generation = selectionGenerationRef.current;
    let active = true;
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = operations.subscribeSession(sessionId, (event) => {
        if (
          active
          && generation === selectionGenerationRef.current
          && event.session.id === sessionId
        ) {
          setSelectedSession(event.session);
        }
      });
    } catch (reason: unknown) {
      active = false;
      const detail = reason instanceof Error ? ` ${reason.message}` : '';
      void Promise.resolve().then(() => {
        if (!mounted) return;
        setSessionSubscriptionFailure({
          message: `수집 상태 구독에 실패했습니다.${detail}`,
          operations,
          retrySequence: sessionSubscriptionRetrySequence,
          sessionId,
        });
      });
    }
    return () => {
      active = false;
      mounted = false;
      unsubscribe?.();
    };
  }, [operations, sessionId, sessionSubscriptionRetrySequence]);

  useEffect(() => {
    if (displayedError !== null) errorRef.current?.focus();
  }, [displayedError]);

  useEffect(() => {
    if (session === null || !shouldFocusStatusRef.current) return;
    let focusFrameId: number | null = null;
    const settleFrameId = globalThis.requestAnimationFrame(() => {
      focusFrameId = globalThis.requestAnimationFrame(() => {
        if (!shouldFocusStatusRef.current) return;
        shouldFocusStatusRef.current = false;
        statusRef.current?.focus();
      });
    });
    return () => {
      globalThis.cancelAnimationFrame(settleFrameId);
      if (focusFrameId !== null) globalThis.cancelAnimationFrame(focusFrameId);
    };
  }, [session]);

  if (
    sessions.status === 'loading'
    || (
      session === null
      && (
        robots.status === 'loading'
        || sensors.status === 'loading'
        || plan.status === 'loading'
      )
    )
  ) {
    return <QueryFeedback kind="loading" />;
  }
  if (sessions.status === 'error') {
    return <QueryFeedback kind="error" message={sessions.message} onRetry={sessions.retry} />;
  }
  if (session === null && robots.status === 'error') {
    return <QueryFeedback kind="error" message={robots.message} onRetry={robots.retry} />;
  }
  if (session === null && sensors.status === 'error') {
    return <QueryFeedback kind="error" message={sensors.message} onRetry={sensors.retry} />;
  }
  if (session === null && plan.status === 'error') {
    return <QueryFeedback kind="error" message={plan.message} onRetry={plan.retry} />;
  }
  if (
    session === null
    && (
      captureRobot === undefined
      || captureSensor === undefined
      || planOptions === null
    )
  ) {
    return <QueryFeedback kind="empty" message="수집 대상 또는 사용 가능한 계획이 없습니다." />;
  }

  let options: CapturePlanOptions;
  if (session === null) {
    if (planOptions === null) {
      return <QueryFeedback kind="empty" message="사용 가능한 수집 계획이 없습니다." />;
    }
    options = planOptions;
  } else {
    options = {
      streams: session.streams.map((stream) => ({
        id: stream.id,
        displayName: stream.displayName,
        expectedRateHz: stream.expectedRateHz,
      })),
      environments: [session.provenance.environment],
      deliveryModes: [session.provenance.deliveryMode],
      dataOrigins: [session.provenance.dataOrigin],
      controlModes: [session.provenance.controlMode],
    };
  }
  const editableStreamIds = hasCustomizedStreams
    ? selectedStreamIds
    : options.streams.map((stream) => stream.id);
  const effectiveStreamIds =
    session?.streams.map((stream) => stream.id) ?? editableStreamIds;
  const selectedProvenance: ExecutionProvenance = session?.provenance ?? {
    environment: chooseSupported(provenance.environment, options.environments),
    deliveryMode: chooseSupported(
      provenance.deliveryMode,
      options.deliveryModes,
    ),
    dataOrigin: chooseSupported(provenance.dataOrigin, options.dataOrigins),
    controlMode: chooseSupported(provenance.controlMode, options.controlModes),
  };

  function run(command: CaptureCommand<void, void>): void {
    shouldFocusStatusRef.current = true;
    setError(null);
    void command.execute().catch(() => undefined);
  }

  function toggleStream(id: string, checked: boolean): void {
    setSelectedStreamIds(() =>
      checked
        ? [...new Set([...editableStreamIds, id])]
        : editableStreamIds.filter((item) => item !== id),
    );
    setHasCustomizedStreams(true);
  }

  function create(): void {
    setError(null);
    if (name.trim().length === 0) {
      setNameError('수집 세션 이름을 입력해야 합니다.');
      nameInputRef.current?.focus();
      return;
    }
    setNameError(null);
    const streams = options.streams.filter((stream) =>
      editableStreamIds.includes(stream.id),
    );
    if (streams.length === 0) {
      setError('스트림을 하나 이상 선택해야 합니다.');
      return;
    }
    if (captureRobot === undefined || captureSensor === undefined) {
      setError('선택한 수집 대상을 확인할 수 없습니다.');
      return;
    }
    shouldFocusStatusRef.current = true;
    void createCommand.execute({
        name: name.trim(),
        robotId: captureRobot.id,
        sensorDeviceId: captureSensor.id,
        integrationProfileId: captureSensor.integrationProfileId,
        provenance: selectedProvenance,
        streams,
      }).catch(() => undefined);
  }

  function prepareNextCapture(): void {
    selectionGenerationRef.current += 1;
    resetCreateCommand();
    setIsPreparingNewCapture(true);
    setSelectedSession(null);
    setError(null);
    setNameError(null);
    setName('');
    setSelectedStreamIds([]);
    setHasCustomizedStreams(false);
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 수집"
      />

      {sessions.refreshError === null ? null : (
        <Panel title="최신 수집 세션을 반영하지 못했습니다">
          <ErrorMessage>
            진행 중인 수집 결과는 유지했습니다. {sessions.refreshError}
          </ErrorMessage>
          <Button className="mt-4" onClick={sessions.retry} variant="secondary">
            수집 세션 다시 불러오기
          </Button>
        </Panel>
      )}

      {sessionSubscriptionError === null ? null : (
        <Panel title="실시간 수집 상태를 연결하지 못했습니다">
          <ErrorMessage>
            현재 수집 상태는 유지했습니다. {sessionSubscriptionError}
          </ErrorMessage>
          <Button
            className="mt-4"
            onClick={() =>
              setSessionSubscriptionRetrySequence((sequence) => sequence + 1)
            }
            variant="secondary"
          >
            수집 상태 다시 연결
          </Button>
        </Panel>
      )}

      {displayedError === null ? null : (
        <ErrorMessage
          ref={errorRef}
          tabIndex={-1}
        >
          {displayedError}
        </ErrorMessage>
      )}

      {activeSessions.length === 0 ? null : (
        <Panel
          title="진행·준비 중인 수집"
        >
          <div className="flex flex-wrap gap-2">
            {activeSessions.map((activeSession) => (
              <Button
                aria-pressed={session?.id === activeSession.id}
                disabled={isPending}
                key={activeSession.id}
                onClick={() => {
                  selectionGenerationRef.current += 1;
                  resetCreateCommand();
                  setIsPreparingNewCapture(false);
                  setSelectedSession(activeSession);
                }}
                variant={
                  session?.id === activeSession.id ? 'primary' : 'secondary'
                }
              >
                {activeSession.name} · {getCaptureSessionStatusLabel(activeSession.status)}
              </Button>
            ))}
            <Button
              aria-pressed={session === null}
              disabled={isPending}
              onClick={prepareNextCapture}
              variant={session === null ? 'primary' : 'secondary'}
            >
              새 수집 구성
            </Button>
          </div>
        </Panel>
      )}

      <Panel aria-label="수집 대상">
        {session === null ? (captureRobot !== undefined && captureSensor !== undefined ? <div className="grid gap-3 md:grid-cols-2">
          <Select
            disabled={isPending}
            label="로봇"
            onValueChange={(value) => {
              setRobotId(value);
              setSelectedStreamIds([]);
              setHasCustomizedStreams(false);
            }}
            options={robots.robots.map((robot) => ({
              label: robot.displayName,
              value: robot.id,
            }))}
            value={captureRobot.id}
          />
          <Select
            disabled={isPending}
            label="센서 장치 / 리그"
            onValueChange={(value) => {
              setSensorId(value);
              setSelectedStreamIds([]);
              setHasCustomizedStreams(false);
            }}
            options={sensors.sensorDevices.map((sensor) => ({
              label: sensor.displayName,
              value: sensor.id,
            }))}
            value={captureSensor.id}
          />
        </div> : null) : (
          <dl className="grid gap-3 md:grid-cols-2">
            <div><dt className="text-xs text-neutral-500">로봇</dt><dd>{captureRobot?.displayName ?? session.robotId}</dd></div>
            <div><dt className="text-xs text-neutral-500">센서 장치 / 리그</dt><dd>{captureSensor?.displayName ?? session.sensorDeviceId}</dd></div>
          </dl>
        )}
      </Panel>

      <section className="grid items-start gap-6 xl:grid-cols-[minmax(19rem,0.45fr)_minmax(0,1.55fr)]">
        <Panel className="xl:sticky xl:top-24" title="수집 계획">
          <div className="grid gap-4">
            <Input
              disabled={session !== null || isPending}
              {...(session === null && nameError !== null ? { error: nameError } : {})}
              inputRef={nameInputRef}
              label="수집 세션 이름"
              onChange={(event) => {
                setName(event.target.value);
                if (nameError !== null) setNameError(null);
              }}
              placeholder="수집 세션 이름 입력"
              value={session?.name ?? name}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                disabled={session !== null || isPending}
                label="실행 환경"
                onValueChange={(value) =>
                  setProvenance((current) => ({
                    ...current,
                    environment: value as ExecutionProvenance['environment'],
                  }))
                }
                options={options.environments.map((value) => ({
                  label: getExecutionEnvironmentLabel(value),
                  value,
                }))}
                value={selectedProvenance.environment}
              />
              <Select
                disabled={session !== null || isPending}
                label="전달 방식"
                onValueChange={(value) =>
                  setProvenance((current) => ({
                    ...current,
                    deliveryMode: value as ExecutionProvenance['deliveryMode'],
                  }))
                }
                options={options.deliveryModes.map((value) => ({
                  label: getDeliveryModeLabel(value),
                  value,
                }))}
                value={selectedProvenance.deliveryMode}
              />
              <Select
                disabled={session !== null || isPending}
                label="데이터 출처"
                onValueChange={(value) =>
                  setProvenance((current) => ({
                    ...current,
                    dataOrigin: value as ExecutionProvenance['dataOrigin'],
                  }))
                }
                options={options.dataOrigins.map((value) => ({
                  label: getDataOriginLabel(value),
                  value,
                }))}
                value={selectedProvenance.dataOrigin}
              />
              <Select
                disabled={session !== null || isPending}
                label="제어 방식"
                onValueChange={(value) =>
                  setProvenance((current) => ({
                    ...current,
                    controlMode: value as ExecutionProvenance['controlMode'],
                  }))
                }
                options={options.controlModes.map((value) => ({
                  label: getControlModeLabel(value),
                  value,
                }))}
                value={selectedProvenance.controlMode}
              />
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-bold">기록 대상 스트림</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {options.streams.map((stream) => (
                <Checkbox
                  checked={effectiveStreamIds.includes(stream.id)}
                  disabled={session !== null || isPending}
                  key={stream.id}
                  label={stream.expectedRateHz === null
                    ? stream.displayName
                    : `${stream.displayName} · ${String(stream.expectedRateHz)}Hz`}
                  onCheckedChange={(checked) =>
                    toggleStream(stream.id, checked)
                  }
                />
              ))}
            </div>
          </div>
          {session === null ? (
            <Button
              className="mt-5 w-full"
              isLoading={isPending}
              onClick={create}
            >
              수집 세션 생성
            </Button>
          ) : null}
        </Panel>

        <div className="grid content-start gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">카메라 스트림</h2>
              <p className="text-sm text-neutral-600">
                화면을 선택해 크게 보고 소스별 연결 상태를 확인합니다.
              </p>
            </div>
            <Badge>{captureRobot?.displayName ?? targetRobotId}</Badge>
          </div>
          <Panel title="카메라 미리보기 준비 중">
            <p className="text-sm text-neutral-600">
              수집 세션과 기록 대상 스트림은 먼저 구성할 수 있습니다.
            </p>
          </Panel>
        </div>
      </section>

      {session === null ? null : (
        <>
          <Panel title="수집 작업 상태">
            <div
              aria-atomic="true"
              aria-live="polite"
              className="flex flex-wrap items-center justify-between gap-3"
              ref={statusRef}
              role="status"
              tabIndex={-1}
            >
              <div>
                <strong>{session.name}</strong>
                <p className="text-sm text-neutral-600">{session.id}</p>
              </div>
              <Badge tone={getStatusTone(session.status)}>
                {getCaptureSessionStatusLabel(session.status)}
              </Badge>
            </div>

            <ol className="mt-4 flex flex-wrap gap-2">
              {flow.map((status) => {
                const tone =
                  status === session.status
                    ? 'info'
                    : session.statusHistory.some((item) => item.status === status)
                      ? 'positive'
                      : 'neutral';
                return (
                  <li key={status}>
                    <Badge tone={tone}>{getCaptureSessionStatusLabel(status)}</Badge>
                  </li>
                );
              })}
            </ol>

            {session.lastError === null ? null : (
              <ErrorMessage className="mt-4">
                {session.lastError}
              </ErrorMessage>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {session.status === 'draft' ? (
                <Button
                  isLoading={isPending}
                  onClick={() =>
                    run(validateCommand)
                  }
                >
                  사전 점검 실행
                </Button>
              ) : null}
              {session.status === 'ready' ? (
                <Button
                  isLoading={isPending}
                  onClick={() => run(startCommand)}
                >
                  수집 시작
                </Button>
              ) : null}
              {session.status === 'recording' ? (
                <Button
                  isLoading={isPending}
                  onClick={() => run(stopCommand)}
                >
                  수집 중지 및 기록 마감
                </Button>
              ) : null}
              <Link
                className="inline-flex min-h-10 items-center text-sm font-semibold underline"
                to={appendPathSegment('/mlops/sessions', session.id)}
              >
                수집 세션 상세 보기
              </Link>
              {['completed', 'failed', 'interrupted'].includes(
                session.status,
              ) ? (
                <Button
                  disabled={isPending}
                  onClick={prepareNextCapture}
                  variant="secondary"
                >
                  새 수집 준비
                </Button>
              ) : null}
            </div>

            {session.preflight === null ? null : (
              <div className="mt-5">
                <h3 className="text-sm font-bold">사전 점검 결과</h3>
                <ul className="mt-2 grid gap-2 md:grid-cols-2">
                  {session.preflight.checks.map((check) => (
                    <li
                      className="flex items-start justify-between gap-3"
                      key={check.id}
                    >
                      <span>
                        <strong>{check.label}</strong>
                        <span className="block text-sm text-neutral-600">
                          {check.detail}
                        </span>
                      </span>
                      <Badge
                        tone={check.state === 'passed' ? 'positive' : 'negative'}
                      >
                        {getCapturePreflightStatusLabel(check.state)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="스트림 기록 상태">
            <p className="mb-3 text-sm text-neutral-600">
              누적 {formatBytes(session.bytesWritten)} ·{' '}
              {getExecutionProvenanceLabel(session.provenance)}
            </p>
            <Table aria-label="수집 세션 스트림 기록 상태">
              <TableHeader>
                <TableRow>
                  <TableHead>스트림</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>요청 주기</TableHead>
                  <TableHead>관측 주기</TableHead>
                  <TableHead>기록량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {session.streams.map((stream) => (
                  <TableRow key={stream.id}>
                    <TableCell>{stream.displayName}</TableCell>
                    <TableCell>{getCaptureStreamStatusLabel(stream.state)}</TableCell>
                    <TableCell>{formatRateHertz(stream.expectedRateHz)}</TableCell>
                    <TableCell>{formatRateHertz(stream.observedRateHz)}</TableCell>
                    <TableCell>{formatBytes(stream.bytesWritten)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {session.episodeId === null ? null : (
              <p className="mt-4" role="status">
                생성된 에피소드:{' '}
                <Link
                  className="font-semibold underline"
                  to={appendPathSegment('/mlops/episodes', session.episodeId)}
                >
                  {session.episodeId}
                </Link>
              </p>
            )}
          </Panel>
        </>
      )}

    </div>
  );
}
