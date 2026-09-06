import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  CaptureOperationsContext,
  type CaptureOperationsPort,
  type CaptureSession,
} from '@/entities/capture-session';
import {
  RobotCatalogContext,
  type RobotCatalogPort,
  type RobotDescriptor,
} from '@/entities/robot';
import {
  RobotVideoContext,
  type RobotVideoPort,
} from '@/entities/robot-video';
import {
  SensorDeviceCatalogContext,
  type SensorDeviceCatalogPort,
  type SensorDeviceDescriptor,
} from '@/entities/sensor-device';

import { CapturePage } from './capture-page';

const robot: RobotDescriptor = {
  id: 'robot-001',
  serialNumber: 'MOCK00001',
  name: '정찰 Robot 01',
  displayName: '정찰 Robot 01',
  integrationProfileId: 'robot-profile-v1',
};

const sensor: SensorDeviceDescriptor = {
  id: 'sensor-rig-001',
  displayName: 'Sensor Rig 01',
  modelName: null,
  hardwareVersion: null,
  softwareVersion: null,
  capabilities: ['rgb', 'imu'],
  integrationProfileId: 'sensor-profile-v1',
};

const recordingSession: CaptureSession = {
  id: 'session-active',
  name: '진행 중 기록',
  robotId: robot.id,
  sensorDeviceId: sensor.id,
  integrationProfileId: sensor.integrationProfileId,
  provenance: {
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'teleop',
    dataOrigin: 'captured',
  },
  status: 'recording',
  createdAtMs: 1000,
  startedAtMs: 1200,
  stoppedAtMs: null,
  completedAtMs: null,
  bytesWritten: 1024,
  streams: [
    {
      id: 'pose',
      displayName: 'Pose',
      expectedRateHz: 20,
      state: 'active',
      observedRateHz: 20,
      bytesWritten: 1024,
      lastReceivedTimestampMs: 1500,
    },
  ],
  episodeId: null,
  lastError: null,
  preflight: {
    passed: true,
    checks: [
      {
        id: 'ready',
        label: 'Capture 준비 상태',
        state: 'passed',
        detail: '기록 준비가 완료되었습니다.',
      },
    ],
  },
  statusHistory: [
    { status: 'draft', occurredAtMs: 1000 },
    { status: 'recording', occurredAtMs: 1200 },
  ],
};

const robotCatalog: RobotCatalogPort = {
  listRobots: () => Promise.resolve([robot]),
  queryRobots: () =>
    Promise.resolve({
      items: [robot],
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
    }),
  getRobot: () => Promise.resolve(robot),
};

const sensorCatalog: SensorDeviceCatalogPort = {
  listSensorDevices: () => Promise.resolve([sensor]),
  getSensorDevice: () => Promise.resolve(sensor),
};

const video: RobotVideoPort = {
  listSources: () => Promise.resolve([]),
  openSource: () => Promise.reject(new Error('source가 없습니다.')),
};

function makeOperations(
  overrides: Partial<CaptureOperationsPort> = {},
): CaptureOperationsPort {
  return {
    listSessions: () => Promise.resolve([recordingSession]),
    querySessions: () =>
      Promise.resolve({
        items: [recordingSession],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }),
    getSession: () => Promise.resolve(recordingSession),
    getPlanOptions: () =>
      Promise.resolve({
        streams: [{ id: 'pose', displayName: '위치', expectedRateHz: 20 }],
        environments: ['physical'],
        deliveryModes: ['live'],
        dataOrigins: ['captured'],
        controlModes: ['teleop'],
      }),
    createSession: () => Promise.resolve(recordingSession),
    validateSession: () => Promise.resolve({ passed: true, checks: [] }),
    startSession: () => Promise.resolve(),
    stopSession: () => Promise.resolve(),
    subscribeSession: () => () => undefined,
    subscribeSessions: () => () => undefined,
    ...overrides,
  };
}

function renderCapturePage(operations: CaptureOperationsPort) {
  return render(
    <RobotCatalogContext.Provider value={robotCatalog}>
      <SensorDeviceCatalogContext.Provider value={sensorCatalog}>
        <RobotVideoContext.Provider value={video}>
          <CaptureOperationsContext.Provider value={operations}>
            <MemoryRouter>
              <CapturePage />
            </MemoryRouter>
          </CaptureOperationsContext.Provider>
        </RobotVideoContext.Provider>
      </SensorDeviceCatalogContext.Provider>
    </RobotCatalogContext.Provider>,
  );
}

function getCaptureStatus(sessionName: string): HTMLElement {
  const status = screen
    .getAllByRole('status')
    .find((candidate) => candidate.textContent?.includes(sessionName));
  if (status === undefined) {
    throw new Error(`수집 상태 영역을 찾을 수 없습니다: ${sessionName}`);
  }
  return status;
}

describe('CapturePage', () => {
  it('Port의 진행 중 Session을 복구해 중지 작업을 다시 제공한다', async () => {
    const stopSession = vi.fn(() => Promise.resolve());
    const getPlanOptions = vi.fn(() => Promise.reject(new Error('계획 조회 실패')));
    const operations: CaptureOperationsPort = {
      listSessions: () => Promise.resolve([recordingSession]),
      querySessions: () =>
        Promise.resolve({
          items: [recordingSession],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        }),
      getSession: () => Promise.resolve(recordingSession),
      getPlanOptions,
      createSession: () => Promise.resolve(recordingSession),
      validateSession: () =>
        Promise.resolve({ passed: true, checks: [] }),
      startSession: () => Promise.resolve(),
      stopSession,
      subscribeSession: (_sessionId, listener) => {
        listener({ session: recordingSession, occurredAtMs: 1500 });
        return () => undefined;
      },
      subscribeSessions: () => () => undefined,
    };
    const unavailableRobotCatalog: RobotCatalogPort = {
      listRobots: () => Promise.reject(new Error('Robot catalog 실패')),
      queryRobots: () => Promise.reject(new Error('Robot catalog 실패')),
      getRobot: () => Promise.resolve(null),
    };
    const unavailableSensorCatalog: SensorDeviceCatalogPort = {
      listSensorDevices: () => Promise.reject(new Error('Sensor catalog 실패')),
      getSensorDevice: () => Promise.resolve(null),
    };

    render(
      <RobotCatalogContext.Provider value={unavailableRobotCatalog}>
        <SensorDeviceCatalogContext.Provider value={unavailableSensorCatalog}>
          <RobotVideoContext.Provider value={video}>
            <CaptureOperationsContext.Provider value={operations}>
              <MemoryRouter>
                <CapturePage />
              </MemoryRouter>
            </CaptureOperationsContext.Provider>
          </RobotVideoContext.Provider>
        </SensorDeviceCatalogContext.Provider>
      </RobotCatalogContext.Provider>,
    );

    expect(await screen.findByText('진행·준비 중인 수집')).toBeInTheDocument();
    expect(screen.getAllByText(recordingSession.robotId).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('table', { name: '수집 세션 스트림 기록 상태' }),
    ).toBeInTheDocument();
    const stopButton = await screen.findByRole('button', {
      name: '수집 중지 및 기록 마감',
    });
    expect(getPlanOptions).not.toHaveBeenCalled();
    fireEvent.click(stopButton);
    await waitFor(() => expect(stopSession).toHaveBeenCalledWith(recordingSession.id));
  });

  it('다른 진행 중 Session이 있어도 새 수집 구성을 시작할 수 있다', async () => {
    const draftSession: CaptureSession = {
      ...recordingSession,
      id: 'session-draft',
      name: '두 번째 수집',
      status: 'draft',
      startedAtMs: null,
      bytesWritten: 0,
      preflight: null,
    };
    const createSession = vi.fn<CaptureOperationsPort['createSession']>(
      () => Promise.resolve(draftSession),
    );
    const operations: CaptureOperationsPort = {
      listSessions: () => Promise.resolve([recordingSession]),
      querySessions: () =>
        Promise.resolve({
          items: [recordingSession],
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        }),
      getSession: () => Promise.resolve(recordingSession),
      getPlanOptions: () =>
        Promise.resolve({
          streams: [
            { id: 'pose', displayName: '위치', expectedRateHz: 20 },
          ],
          environments: ['physical'],
          deliveryModes: ['live'],
          dataOrigins: ['captured'],
          controlModes: ['teleop'],
        }),
      createSession,
      validateSession: () => Promise.resolve({ passed: true, checks: [] }),
      startSession: () => Promise.resolve(),
      stopSession: () => Promise.resolve(),
      subscribeSession: (_sessionId, listener) => {
        listener({ session: recordingSession, occurredAtMs: 1500 });
        return () => undefined;
      },
      subscribeSessions: () => () => undefined,
    };

    render(
      <RobotCatalogContext.Provider value={robotCatalog}>
        <SensorDeviceCatalogContext.Provider value={sensorCatalog}>
          <RobotVideoContext.Provider value={video}>
            <CaptureOperationsContext.Provider value={operations}>
              <MemoryRouter>
                <CapturePage />
              </MemoryRouter>
            </CaptureOperationsContext.Provider>
          </RobotVideoContext.Provider>
        </SensorDeviceCatalogContext.Provider>
      </RobotCatalogContext.Provider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '새 수집 구성' }));
    const nameInput = await screen.findByRole('textbox', { name: '수집 세션 이름' });
    expect(nameInput).toBeEnabled();
    fireEvent.change(nameInput, { target: { value: '두 번째 수집' } });
    const createButton = screen.getByRole('button', { name: '수집 세션 생성' });
    fireEvent.click(createButton);
    fireEvent.click(createButton);

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(createSession.mock.calls[0]?.[0]).toMatchObject({
      name: '두 번째 수집',
      robotId: robot.id,
    });
    await waitFor(() => expect(getCaptureStatus(draftSession.name)).toHaveFocus());
  });

  it('빈 이름 제출 시 오류를 연결하고 이름 입력으로 포커스를 이동한다', async () => {
    const createSession = vi.fn<CaptureOperationsPort['createSession']>();
    renderCapturePage(makeOperations({ createSession }));

    fireEvent.click(await screen.findByRole('button', { name: '새 수집 구성' }));
    const nameInput = await screen.findByRole('textbox', { name: '수집 세션 이름' });
    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));

    expect(nameInput).toHaveFocus();
    expect(screen.getByText('수집 세션 이름을 입력해야 합니다.')).toBeInTheDocument();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('주기를 모르는 기록 source에는 Hz 표시를 붙이지 않는다', async () => {
    renderCapturePage(makeOperations({
      getPlanOptions: () => Promise.resolve({
        streams: [
          {
            id: 'robot-001:operational-status',
            displayName: '로봇 운영 상태 API',
            expectedRateHz: null,
          },
          { id: 'pose', displayName: '위치', expectedRateHz: 20 },
        ],
        environments: ['physical'],
        deliveryModes: ['live'],
        dataOrigins: ['captured'],
        controlModes: ['teleop'],
      }),
      listSessions: () => Promise.resolve([]),
    }));

    expect(await screen.findByRole('checkbox', {
      name: '로봇 운영 상태 API',
    })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '위치 · 20Hz' })).toBeInTheDocument();
    expect(screen.queryByText(/로봇 운영 상태 API.*Hz/u)).not.toBeInTheDocument();
  });

  it('생성 중 Session 전환을 잠가 요청 대상과 결과를 같은 문맥에 유지한다', async () => {
    let resolveCreate: ((session: CaptureSession) => void) | undefined;
    const createSession = vi.fn<CaptureOperationsPort['createSession']>(
      () =>
        new Promise<CaptureSession>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderCapturePage(makeOperations({ createSession }));

    fireEvent.click(await screen.findByRole('button', { name: '새 수집 구성' }));
    fireEvent.change(await screen.findByRole('textbox', { name: '수집 세션 이름' }), {
      target: { value: '늦게 생성되는 수집' },
    });
    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());

    const activeSessionButton = screen.getByRole('button', {
      name: /진행 중 기록/u,
    });
    expect(activeSessionButton).toBeDisabled();
    fireEvent.click(activeSessionButton);
    expect(activeSessionButton).toHaveAttribute('aria-pressed', 'false');

    const createdSession: CaptureSession = {
      ...recordingSession,
      id: 'session-late',
      name: '늦게 생성되는 수집',
      status: 'draft',
      startedAtMs: null,
      bytesWritten: 0,
    };
    await act(async () => {
      resolveCreate?.(createdSession);
      await Promise.resolve();
    });

    expect(getCaptureStatus(createdSession.name)).toBeInTheDocument();
  });

  it('Session 생성 중 제출 대상과 계획 입력을 잠가 요청 이후 변경 손실을 막는다', async () => {
    let resolveCreate: ((session: CaptureSession) => void) | undefined;
    const createSession = vi.fn<CaptureOperationsPort['createSession']>(
      () =>
        new Promise<CaptureSession>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    renderCapturePage(makeOperations({ createSession }));

    fireEvent.click(await screen.findByRole('button', { name: '새 수집 구성' }));
    const nameInput = await screen.findByRole('textbox', {
      name: '수집 세션 이름',
    });
    fireEvent.change(nameInput, { target: { value: '잠금 검증 수집' } });
    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(nameInput).toBeDisabled();
    for (const select of screen.getAllByRole('combobox')) {
      expect(select).toBeDisabled();
    }
    expect(screen.getByRole('checkbox', { name: /위치/u })).toBeDisabled();

    const createdSession: CaptureSession = {
      ...recordingSession,
      id: 'session-created',
      name: '잠금 검증 수집',
      status: 'draft',
      startedAtMs: null,
      bytesWritten: 0,
    };
    await act(async () => {
      resolveCreate?.(createdSession);
      await Promise.resolve();
    });

    expect(createSession.mock.calls[0]?.[0]).toMatchObject({
      name: '잠금 검증 수집',
      robotId: robot.id,
      sensorDeviceId: sensor.id,
      streams: [{ id: 'pose' }],
    });
    expect(getCaptureStatus(createdSession.name)).toBeInTheDocument();
  });

  it('생성 중 이탈 후 재진입하면 app 범위 pending을 이어받아 중복 Session을 막는다', async () => {
    let resolveCreate: ((session: CaptureSession) => void) | undefined;
    const createSession = vi.fn<CaptureOperationsPort['createSession']>(
      () => new Promise<CaptureSession>((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const operations = makeOperations({
      createSession,
      listSessions: () => Promise.resolve([]),
    });
    const first = renderCapturePage(operations);

    const nameInput = await screen.findByRole('textbox', {
      name: '수집 세션 이름',
    });
    fireEvent.change(nameInput, { target: { value: '재진입 중복 방지 수집' } });
    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());

    first.unmount();
    renderCapturePage(operations);
    const remountedCreateButton = await screen.findByRole('button', {
      name: '수집 세션 생성',
    });
    expect(remountedCreateButton).toBeDisabled();
    fireEvent.click(remountedCreateButton);
    expect(createSession).toHaveBeenCalledOnce();

    const createdSession: CaptureSession = {
      ...recordingSession,
      id: 'session-remounted',
      name: '재진입 중복 방지 수집',
      status: 'draft',
      startedAtMs: null,
      bytesWritten: 0,
    };
    await act(async () => {
      resolveCreate?.(createdSession);
      await Promise.resolve();
    });

    expect(getCaptureStatus(createdSession.name)).toBeInTheDocument();
  });

  it('생성 중 재진입한 요청이 실패해도 이름과 스트림 선택을 보존해 재시도한다', async () => {
    let rejectCreate: ((reason: Error) => void) | undefined;
    const retriedSession: CaptureSession = {
      ...recordingSession,
      id: 'session-retried',
      name: '재시도할 수집',
      status: 'draft',
      startedAtMs: null,
      bytesWritten: 0,
      streams: [],
    };
    const createSession = vi
      .fn<CaptureOperationsPort['createSession']>()
      .mockImplementationOnce(() => new Promise<CaptureSession>((_resolve, reject) => {
        rejectCreate = reject;
      }))
      .mockResolvedValueOnce(retriedSession);
    const operations = makeOperations({
      createSession,
      getPlanOptions: () => Promise.resolve({
        streams: [
          { id: 'pose', displayName: '위치', expectedRateHz: 20 },
          { id: 'imu', displayName: 'IMU', expectedRateHz: 20 },
        ],
        environments: ['physical'],
        deliveryModes: ['live'],
        dataOrigins: ['captured'],
        controlModes: ['teleop'],
      }),
      listSessions: () => Promise.resolve([]),
    });
    const first = renderCapturePage(operations);

    const nameInput = await screen.findByRole('textbox', {
      name: '수집 세션 이름',
    });
    fireEvent.change(nameInput, { target: { value: '재시도할 수집' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /위치/u }));
    expect(screen.getByRole('checkbox', { name: /위치/u })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /IMU/u })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());

    first.unmount();
    renderCapturePage(operations);
    const remountedName = await screen.findByRole('textbox', {
      name: '수집 세션 이름',
    });
    await waitFor(() => expect(remountedName).toHaveValue('재시도할 수집'));
    expect(remountedName).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /위치/u })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /IMU/u })).toBeChecked();

    await act(async () => {
      rejectCreate?.(new Error('재진입 생성 실패'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('재진입 생성 실패');
    expect(remountedName).toHaveValue('재시도할 수집');
    expect(remountedName).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /위치/u })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /IMU/u })).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '수집 세션 생성' }));
    await waitFor(() => expect(createSession).toHaveBeenCalledTimes(2));
    expect(createSession.mock.calls[1]?.[0]).toMatchObject({
      name: '재시도할 수집',
      streams: [{ id: 'imu' }],
    });
  });

  it('이전 Session의 늦은 구독 이벤트를 선택 변경 뒤 무시한다', async () => {
    const newerSession: CaptureSession = {
      ...recordingSession,
      id: 'session-newer',
      name: '최근 수집',
      createdAtMs: 2000,
    };
    const listeners = new Map<
      string,
      Parameters<CaptureOperationsPort['subscribeSession']>[1]
    >();
    const operations = makeOperations({
      listSessions: () => Promise.resolve([recordingSession, newerSession]),
      querySessions: () =>
        Promise.resolve({
          items: [recordingSession, newerSession],
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
        }),
      subscribeSession: (sessionId, listener) => {
        listeners.set(sessionId, listener);
        return () => undefined;
      },
    });
    renderCapturePage(operations);

    await waitFor(() => expect(getCaptureStatus(newerSession.name)).toBeInTheDocument());
    await waitFor(() => expect(listeners.has(newerSession.id)).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /진행 중 기록/u }));
    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();

    act(() => {
      listeners.get(newerSession.id)?.({
        session: { ...newerSession, name: '오래된 구독 결과' },
        occurredAtMs: 3000,
      });
    });

    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();
    expect(screen.queryByText('오래된 구독 결과')).not.toBeInTheDocument();
  });

  it('Session 상태 구독이 동기 실패해도 현재 상태를 유지하고 다시 연결한다', async () => {
    const recoveredSession: CaptureSession = {
      ...recordingSession,
      name: '다시 연결된 수집',
    };
    const unsubscribe = vi.fn();
    const subscribeSession = vi
      .fn<CaptureOperationsPort['subscribeSession']>()
      .mockImplementationOnce(() => {
        throw new Error('실시간 구독 실패');
      })
      .mockImplementationOnce((_sessionId, listener) => {
        listener({ session: recoveredSession, occurredAtMs: 2000 });
        return unsubscribe;
      });
    const view = renderCapturePage(makeOperations({ subscribeSession }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '수집 상태를 갱신하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.',
    );
    expect(screen.queryByText('실시간 구독 실패')).not.toBeInTheDocument();
    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: '수집 상태 다시 연결' }),
    );

    await waitFor(() => expect(subscribeSession).toHaveBeenCalledTimes(2));
    expect(getCaptureStatus(recoveredSession.name)).toBeInTheDocument();
    expect(
      screen.queryByText(/수집 상태를 갱신하지 못했습니다/u),
    ).not.toBeInTheDocument();

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('작업 완료 후 수집 상태 영역으로 포커스를 이동한다', async () => {
    const stopSession = vi.fn(() => Promise.resolve());
    renderCapturePage(makeOperations({ stopSession }));

    fireEvent.click(
      await screen.findByRole('button', { name: '수집 중지 및 기록 마감' }),
    );

    await waitFor(() => expect(stopSession).toHaveBeenCalledWith(recordingSession.id));
    await waitFor(() =>
      expect(getCaptureStatus(recordingSession.name)).toHaveFocus(),
    );
  });

  it('Session command 중 대상 전환을 잠그고 실패를 현재 상태에 노출한다', async () => {
    let rejectStop: ((reason: Error) => void) | undefined;
    const stopSession = vi.fn(
      () => new Promise<void>((_resolve, reject) => {
        rejectStop = reject;
      }),
    );
    renderCapturePage(makeOperations({ stopSession }));

    fireEvent.click(
      await screen.findByRole('button', { name: '수집 중지 및 기록 마감' }),
    );
    await waitFor(() => expect(stopSession).toHaveBeenCalledOnce());
    const activeSessionButton = screen.getByRole('button', {
      name: /진행 중 기록/u,
    });
    const prepareButton = screen.getByRole('button', { name: '새 수집 구성' });
    expect(activeSessionButton).toBeDisabled();
    expect(prepareButton).toBeDisabled();

    await act(async () => {
      rejectStop?.(new Error('기록 마감 실패'));
      await Promise.resolve();
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('기록 마감 실패');
    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();
    expect(activeSessionButton).toBeEnabled();
    expect(prepareButton).toBeEnabled();
  });

  it('Session 목록 갱신 실패 시 기존 작업을 유지하고 재시도를 제공한다', async () => {
    let invalidate: (() => void) | undefined;
    let listCallCount = 0;
    const listSessions = vi.fn<CaptureOperationsPort['listSessions']>(() => {
      listCallCount += 1;
      return listCallCount === 2
        ? Promise.reject(new Error('Session 갱신 실패'))
        : Promise.resolve([recordingSession]);
    });
    renderCapturePage(makeOperations({
      listSessions,
      subscribeSessions: (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    }));

    await waitFor(() => expect(invalidate).toBeDefined());
    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();
    act(() => invalidate?.());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Session 갱신 실패',
    );
    expect(getCaptureStatus(recordingSession.name)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: '수집 세션 다시 불러오기' }),
    );

    await waitFor(() => expect(listSessions).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(screen.queryByText(/Session 갱신 실패/u)).not.toBeInTheDocument(),
    );
  });
});
