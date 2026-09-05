import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CaptureSession } from '@/entities/capture-session';
import type { RobotTelemetryEvent } from '@/entities/robot-telemetry';
import type { RuntimeConfig } from '@/shared/config';

import { createApplicationServices, type ApplicationServices } from './application-services';

const runtimeConfig: RuntimeConfig = {
  branding: { productName: 'ARMY-ROBOT', shortName: 'ARMY-ROBOT', logo: null },
  adapters: { mode: 'bundle', implementation: 'in-memory' },
  connections: { patrol: { endpoint: null }, telemetry: { endpoint: null, integrationProfileId: null }, video: { endpoint: null }, capture: { endpoint: null } },
};

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let settle: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      if (settle === undefined) throw new Error('지연 Promise가 초기화되지 않았습니다.');
      settle(value);
    },
  };
}

async function waitForInitialEpisodeSynchronization(
  services: ApplicationServices,
): Promise<void> {
  await vi.waitFor(async () => {
    const completedSessions = (await services.captureOperations.listSessions()).filter(
      (session) => session.status === 'completed',
    );
    const sourceSessionIds = new Set(
      (await services.episodeRepository.listEpisodes()).map(
        (episode) => episode.captureSessionId,
      ),
    );
    expect(
      completedSessions.every((session) => sourceSessionIds.has(session.id)),
    ).toBe(true);
  });
  await Promise.resolve();
}

async function createAndCompleteSession(
  services: ApplicationServices,
  name: string,
) {
  const session = await services.captureOperations.createSession({
    name,
    robotId: 'robot-001',
    sensorDeviceId: 'sensor-rig-001',
    integrationProfileId: 'multisensor-rig-v1',
    provenance: {
      environment: 'physical',
      deliveryMode: 'live',
      controlMode: 'teleop',
      dataOrigin: 'captured',
    },
    streams: [
      { id: 'pose', displayName: 'Pose', expectedRateHz: 20 },
    ],
  });
  const validation = services.captureOperations.validateSession(session.id);
  await vi.advanceTimersByTimeAsync(300);
  await validation;
  const start = services.captureOperations.startSession(session.id);
  await vi.advanceTimersByTimeAsync(300);
  await start;
  const stop = services.captureOperations.stopSession(session.id);
  await vi.advanceTimersByTimeAsync(1000);
  await stop;
  return session;
}

describe('application services composition', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-08-21T09:00:00+09:00')); });
  afterEach(() => vi.useRealTimers());

  it('external 선택에 factory가 없으면 subsystem과 함께 시작을 중단한다', () => {
    expect(() => createApplicationServices({ ...runtimeConfig, adapters: { mode: 'bundle', implementation: 'external' } })).toThrow('subsystem: robotCatalog');
  });

  it('같은 in-memory 위치 fixture를 운영 상태와 지도 조회에 제공한다', async () => {
    const services = createApplicationServices(runtimeConfig);
    expect(services.dataEnvironment).toBe('simulation');
    expect(services.patrolApiStatus.endpoint).toBeNull();
    await expect(services.patrolApiStatus.check()).rejects.toThrow(
      'Patrol API endpoint가 설정되지 않았습니다.',
    );
    const robots = await services.robotCatalog.listRobots();

    for (const robot of robots) {
      const [status, geolocation] = await Promise.all([
        services.robotOperationalStatus.getOperationalStatus(robot.id),
        services.robotGeolocation.getGeolocationObservation(robot.id),
      ]);
      expect(status?.data.latitude).toBe(geolocation?.latitudeDegrees);
      expect(status?.data.longitude).toBe(geolocation?.longitudeDegrees);
      expect(status?.data.latitude).not.toBeNull();
      expect(status?.data.longitude).not.toBeNull();
    }
    services.dispose();
  });

  it('Capture 계획을 현재 활성 운영 상태 API, Telemetry, Video stream 목록으로 조립한다', async () => {
    const services = createApplicationServices(runtimeConfig);
    const [robot] = await services.robotCatalog.listRobots();
    const [sensor] = await services.sensorDeviceCatalog.listSensorDevices();
    if (robot === undefined || sensor === undefined) {
      throw new Error('Capture 계획 시험 데이터가 필요합니다.');
    }
    const [operationalSources, telemetryChannels, videoSources, options] = await Promise.all([
      services.robotOperationalStatus.listOperationalDataSources(robot.id),
      services.robotTelemetry.getChannelDescriptors(robot.id),
      services.robotVideo.listSources(robot.id),
      services.captureOperations.getPlanOptions(robot.id, sensor.id),
    ]);

    expect(options.streams).toEqual([
      ...operationalSources.map((source) => ({
        ...source,
        expectedRateHz: null,
      })),
      ...telemetryChannels.map((descriptor) => ({
        id: descriptor.channel,
        displayName: descriptor.displayName,
        expectedRateHz: descriptor.expectedRateHz,
      })),
      ...videoSources.map((source) => ({
        id: source.id,
        displayName: source.displayName,
        expectedRateHz: null,
      })),
    ]);
    expect(options.streams.some((stream) => stream.id === 'rgb-main')).toBe(false);
    services.dispose();
  });

  it('completed Session을 idempotent하게 Episode로 연결한다', async () => {
    const services = createApplicationServices(runtimeConfig);
    await waitForInitialEpisodeSynchronization(services);
    const createEpisode = vi.spyOn(services.episodeRepository, 'createEpisode');
    const session = await createAndCompleteSession(services, '통합 여정 Session');
    await vi.waitFor(async () => {
      const completed = await services.captureOperations.getSession(session.id);
      const episodes = await services.episodeRepository.listEpisodes();
      expect(completed?.status).toBe('completed');
      expect(episodes.filter((episode) => episode.captureSessionId === session.id)).toHaveLength(1);
    });
    expect(createEpisode).toHaveBeenCalledOnce();
    const episode = (await services.episodeRepository.listEpisodes()).find((item) => item.captureSessionId === session.id);
    if (episode === undefined) throw new Error('Episode 자동 생성에 실패했습니다.');
    const dataset = await services.datasetRepository.createDataset({ name: '통합 여정 Dataset', description: '자동 생성 Episode를 선택한 Draft', tags: ['journey'], episodeIds: [episode.id] });
    expect(dataset).toMatchObject({ status: 'draft', episodeIds: [episode.id] });
    services.dispose();
  });

  it('지연 조회 중 재요청을 직렬 재실행하고 Episode를 중복 생성하지 않는다', async () => {
    const services = createApplicationServices(runtimeConfig);
    await waitForInitialEpisodeSynchronization(services);
    const originalListSessions = services.captureOperations.listSessions.bind(
      services.captureOperations,
    );
    const deferredSessions = createDeferred<readonly CaptureSession[]>();
    const listSessions = vi.spyOn(services.captureOperations, 'listSessions')
      .mockImplementationOnce(() => deferredSessions.promise);
    const createEpisode = vi.spyOn(services.episodeRepository, 'createEpisode');

    const session = await createAndCompleteSession(services, '지연 재요청 Session');
    const completedSessions = await originalListSessions();
    deferredSessions.resolve(completedSessions);

    await vi.waitFor(async () => {
      const episodes = await services.episodeRepository.listEpisodes();
      expect(
        episodes.filter((episode) => episode.captureSessionId === session.id),
      ).toHaveLength(1);
    });
    await vi.waitFor(() => expect(listSessions.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(createEpisode).toHaveBeenCalledOnce();
    services.dispose();
  });

  it('지연된 Session 목록 조회 뒤 dispose되면 Episode를 생성하지 않는다', async () => {
    const services = createApplicationServices(runtimeConfig);
    await waitForInitialEpisodeSynchronization(services);
    const originalListSessions = services.captureOperations.listSessions.bind(
      services.captureOperations,
    );
    const deferredSessions = createDeferred<readonly CaptureSession[]>();
    const listSessions = vi.spyOn(services.captureOperations, 'listSessions')
      .mockImplementationOnce(() => deferredSessions.promise);
    const createEpisode = vi.spyOn(services.episodeRepository, 'createEpisode');

    const session = await createAndCompleteSession(services, '종료 경합 Session');
    const completedSessions = await originalListSessions();
    expect(listSessions).toHaveBeenCalledOnce();
    services.dispose();
    deferredSessions.resolve(completedSessions);
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();

    expect(createEpisode).not.toHaveBeenCalled();
    const episodes = await services.episodeRepository.listEpisodes();
    expect(
      episodes.some((episode) => episode.captureSessionId === session.id),
    ).toBe(false);
  });

  it('dispose에서 in-memory app scope timer를 정리하고 재사용을 막는다', async () => {
    const services = createApplicationServices(runtimeConfig);
    await waitForInitialEpisodeSynchronization(services);
    const session = await services.captureOperations.createSession({
      name: '종료 직전 Session',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'multisensor-rig-v1',
      provenance: {
        environment: 'physical',
        deliveryMode: 'live',
        controlMode: 'teleop',
        dataOrigin: 'captured',
      },
      streams: [{ id: 'pose', displayName: 'Pose', expectedRateHz: 20 }],
    });
    const validation = services.captureOperations.validateSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await validation;
    const start = services.captureOperations.startSession(session.id);
    await vi.advanceTimersByTimeAsync(300);
    await start;
    await services.robotTelemetry.connect();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    services.dispose();
    services.dispose();

    expect(vi.getTimerCount()).toBe(0);
    await expect(services.robotTelemetry.connect()).rejects.toThrow(
      '종료된 Telemetry Adapter',
    );
    await expect(services.captureOperations.createSession({
      name: '종료 후 Session',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'multisensor-rig-v1',
      provenance: {
        environment: 'physical',
        deliveryMode: 'live',
        controlMode: 'teleop',
        dataOrigin: 'captured',
      },
      streams: [{ id: 'pose', displayName: 'Pose', expectedRateHz: 20 }],
    })).rejects.toThrow('종료된 Capture Adapter');
  });

  it('주입 Clock을 새 Capture와 Telemetry의 공통 관측 시간으로 사용한다', async () => {
    let nowMs = 4_200_000;
    const services = createApplicationServices(runtimeConfig, {
      clock: { nowMs: () => nowMs },
    });
    const session = await services.captureOperations.createSession({
      name: '주입 시각 Session',
      robotId: 'robot-001',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'multisensor-rig-v1',
      provenance: {
        environment: 'physical',
        deliveryMode: 'live',
        controlMode: 'teleop',
        dataOrigin: 'captured',
      },
      streams: [{ id: 'pose', displayName: 'Pose', expectedRateHz: 20 }],
    });
    expect(session.createdAtMs).toBe(4_200_000);
    expect(session.statusHistory[0]?.occurredAtMs).toBe(4_200_000);

    const events: RobotTelemetryEvent[] = [];
    const unsubscribe = services.robotTelemetry.subscribe(
      { robotIds: ['robot-001'], channels: ['pose'] },
      (event) => events.push(event),
    );
    await services.robotTelemetry.connect();
    nowMs = 4_200_200;
    await vi.advanceTimersByTimeAsync(100);

    expect(events[0]?.receivedTimestampMs).toBe(4_200_200);
    expect(events[0]?.sourceTimestampMs).toBe(4_200_200);
    unsubscribe();
    services.dispose();
  });
});
