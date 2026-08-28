import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isValidRobotGeolocation } from '@/entities/robot-telemetry';

import type { ApplicationServices } from './application-services';

export const adapterContractNowMs = Date.parse('2026-08-21T09:00:00+09:00');

export type ApplicationServicesFactory = () => ApplicationServices;

const implementationMarker = /mock|fixture|in-memory|simulated|simulator/i;

function firstOrThrow<T>(items: readonly T[], label: string): T {
  const item = items[0];
  if (item === undefined) throw new Error(`${label} 계약 시험 데이터가 필요합니다.`);
  return item;
}

function createAbsentId(
  existingIds: readonly string[],
  preferredId: string,
): string {
  const existingIdSet = new Set(existingIds);
  let sequence = 0;
  let candidate = preferredId;

  while (existingIdSet.has(candidate)) {
    sequence += 1;
    candidate = `${preferredId}-${String(sequence)}`;
  }

  return candidate;
}

function expectValidIds(
  items: readonly { readonly id: string }[],
  label: string,
): void {
  items.forEach((item) => {
    expect(item.id.trim(), `${label} ID는 비어 있을 수 없습니다.`).not.toHaveLength(0);
  });
  expect(
    new Set(items.map((item) => item.id)).size,
    `${label} ID는 조회 결과 안에서 고유해야 합니다.`,
  ).toBe(items.length);
}

function expectStableOrder<T>(
  items: readonly T[],
  compare: (left: T, right: T) => number,
): void {
  items.forEach((item, index) => {
    const next = items[index + 1];
    if (next !== undefined) expect(compare(item, next)).toBeLessThanOrEqual(0);
  });
}

async function settleComposition(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

export function describeAdapterBundleContract(
  label: string,
  createServices: ApplicationServicesFactory,
): void {
  describe(`${label} Adapter bundle contract`, () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(adapterContractNowMs);
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    describe('RobotCatalogPort', () => {
      it('목록·상세·검색·정렬·페이지 의미를 일관되게 제공한다', async () => {
        const catalog = createServices().robotCatalog;
        const robots = await catalog.listRobots();
        const first = firstOrThrow(robots, 'Robot');
        const absentRobotId = createAbsentId(
          robots.map((robot) => robot.id),
          'missing-robot',
        );

        expectValidIds(robots, 'Robot');
        await expect(catalog.getRobot(first.id)).resolves.toEqual(first);
        await expect(catalog.getRobot(absentRobotId)).resolves.toBeNull();

        const result = await catalog.queryRobots({
          search: '',
          sort: 'name-asc',
          page: 1,
          pageSize: 2,
        });
        const expectedOrder = [...robots].sort((left, right) => {
          const primary = left.displayName.localeCompare(right.displayName, 'ko');
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });
        expect(result).toMatchObject({
          page: 1,
          pageSize: 2,
          totalItems: robots.length,
          totalPages: Math.max(1, Math.ceil(robots.length / 2)),
        });
        expect(result.items).toEqual(expectedOrder.slice(0, 2));
        const exported = await catalog.queryRobots({
          search: '',
          sort: 'name-asc',
          page: 1,
          pageSize: 100_000,
        });
        expect(exported.items).toEqual(expectedOrder);
        expect(exported.items).toHaveLength(exported.totalItems);

        const filtered = await catalog.queryRobots({
          search: first.displayName,
          sort: 'name-asc',
          page: 1,
          pageSize: 20,
        });
        expect(filtered.items).toContainEqual(first);
        expect(
          filtered.items.every(
            (robot) =>
              robot.displayName
                .toLocaleLowerCase()
                .includes(first.displayName.toLocaleLowerCase()),
          ),
        ).toBe(true);
      });
    });

    describe('RobotOperationalStatusQueryPort', () => {
      it('등록 Robot의 필요한 운영 상태와 브라우저 수신 시각을 제공한다', async () => {
        const services = createServices();
        const firstRobot = firstOrThrow(
          await services.robotCatalog.listRobots(),
          'Robot',
        );
        const status = await services.robotOperationalStatus.getOperationalStatus(
          firstRobot.id,
        );

        expect(status).not.toBeNull();
        if (status === null) return;
        expect(status.robotId).toBe(firstRobot.id);
        expect(Number.isFinite(status.data.id)).toBe(true);
        expect(
          status.data.serialNumber === null || status.data.serialNumber.length > 0,
        ).toBe(true);
        expect(Number.isFinite(status.data.battery)).toBe(true);
        expect(typeof status.data.isConnecting).toBe('boolean');
        expect(status.data.isAvailable === null || typeof status.data.isAvailable === 'boolean').toBe(true);
        expect(typeof status.data.isCharging).toBe('boolean');
        expect(typeof status.data.isMovable).toBe('boolean');
        expect(status.data.latitude === null || Number.isFinite(status.data.latitude)).toBe(true);
        expect(status.data.longitude === null || Number.isFinite(status.data.longitude)).toBe(true);
        expect(Number.isFinite(status.receivedTimestampMs)).toBe(true);
      });
    });

    describe('SensorDeviceCatalogPort', () => {
      it('독립 Sensor Device 목록과 nullable 상세를 제공한다', async () => {
        const catalog = createServices().sensorDeviceCatalog;
        const devices = await catalog.listSensorDevices();
        const first = firstOrThrow(devices, 'Sensor Device');
        const absentSensorDeviceId = createAbsentId(
          devices.map((device) => device.id),
          'missing-sensor-device',
        );

        expectValidIds(devices, 'Sensor Device');
        await expect(catalog.getSensorDevice(first.id)).resolves.toEqual(first);
        await expect(
          catalog.getSensorDevice(absentSensorDeviceId),
        ).resolves.toBeNull();
      });
    });

    describe('RobotTelemetryPort', () => {
      it('descriptor·업무 source와 다중 Robot·channel 구독을 제공한다', async () => {
        const services = createServices();
        const robots = await services.robotCatalog.listRobots();
        const firstRobot = firstOrThrow(robots, 'Robot');
        const secondRobot = robots[1] ?? firstRobot;
        const descriptors = await services.robotTelemetry.getChannelDescriptors(
          firstRobot.id,
        );
        const source = await services.robotTelemetry.getExecutionSource();
        const events: Array<{ readonly robotId: string; readonly channel: string }> = [];
        const states: string[] = [];
        const unsubscribeConnection = services.robotTelemetry.subscribeConnection(
          (state) => states.push(state),
        );
        const unsubscribe = services.robotTelemetry.subscribe(
          {
            robotIds: [firstRobot.id, secondRobot.id],
            channels: ['pose', 'battery'],
          },
          (event) => events.push(event),
        );

        expect(descriptors.length).toBeGreaterThan(0);
        expect(new Set(descriptors.map((descriptor) => descriptor.channel)).size).toBe(
          descriptors.length,
        );
        descriptors.forEach((descriptor) => {
          expect(descriptor.displayName.trim()).not.toHaveLength(0);
          if (descriptor.expectedRateHz !== null) {
            expect(descriptor.expectedRateHz).toBeGreaterThan(0);
          }
          if (descriptor.staleAfterMs !== null) {
            expect(descriptor.staleAfterMs).toBeGreaterThan(0);
          }
        });
        expect(['physical', 'simulation']).toContain(source.environment);
        expect(['live', 'replay']).toContain(source.deliveryMode);

        await services.robotTelemetry.connect();
        await vi.advanceTimersByTimeAsync(1100);
        services.robotTelemetry.disconnect();

        expect(new Set(events.map((event) => event.robotId))).toEqual(
          new Set([firstRobot.id, secondRobot.id]),
        );
        expect(new Set(events.map((event) => event.channel))).toEqual(
          new Set(['pose', 'battery']),
        );
        expect(states).toEqual(
          expect.arrayContaining(['disconnected', 'connecting', 'connected']),
        );
        expect(states.at(-1)).toBe('disconnected');
        unsubscribe();
        unsubscribeConnection();
      });

      it('전달률 제한과 구독 해제를 소비자별로 적용한다', async () => {
        const services = createServices();
        const robot = firstOrThrow(
          await services.robotCatalog.listRobots(),
          'Robot',
        );
        const listener = vi.fn();
        const unsubscribe = services.robotTelemetry.subscribe(
          {
            robotIds: [robot.id],
            channels: ['pose'],
            maxDeliveryHz: 5,
          },
          listener,
        );

        await services.robotTelemetry.connect();
        await vi.advanceTimersByTimeAsync(1100);
        expect(listener.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(listener.mock.calls.length).toBeLessThanOrEqual(6);

        unsubscribe();
        const deliveredBeforeUnsubscribe = listener.mock.calls.length;
        await vi.advanceTimersByTimeAsync(500);
        services.robotTelemetry.disconnect();
        expect(listener).toHaveBeenCalledTimes(deliveredBeforeUnsubscribe);
        expect(() =>
          services.robotTelemetry.subscribe(
            { robotIds: [robot.id], channels: ['pose'], maxDeliveryHz: 0 },
            vi.fn(),
          ),
        ).toThrow();
      });
    });

    describe('RobotGeolocationQueryPort', () => {
      it('내부 Robot ID의 검증된 위치 관측값 또는 정직한 미제공 상태를 반환한다', async () => {
        const services = createServices();
        const robot = firstOrThrow(
          await services.robotCatalog.listRobots(),
          'Robot',
        );
        const geolocation =
          await services.robotGeolocation.getGeolocationObservation(robot.id);

        if (geolocation !== null) {
          expect(geolocation.robotId).toBe(robot.id);
          expect(isValidRobotGeolocation(geolocation)).toBe(true);
        }
      });
    });

    describe('RobotVideoPort', () => {
      it('Robot별 source와 MediaStream session 생명주기를 제공한다', async () => {
        const services = createServices();
        const robots = await services.robotCatalog.listRobots();
        const robot = firstOrThrow(robots, 'Robot');
        const sourceLists = await Promise.all(
          robots.map(({ id }) => services.robotVideo.listSources(id)),
        );
        const sources = sourceLists[0] ?? [];
        const source = firstOrThrow(sources, 'Camera source');
        const absentRobotId = createAbsentId(
          robots.map((item) => item.id),
          'missing-robot',
        );
        const absentVideoSourceId = createAbsentId(
          sourceLists.flatMap((items) => items.map((item) => item.id)),
          'missing-video-source',
        );

        expectValidIds(sourceLists.flat(), 'Camera source');
        expect(sources.every((item) => item.robotId === robot.id)).toBe(true);
        await expect(
          services.robotVideo.listSources(absentRobotId),
        ).resolves.toEqual([]);
        await expect(
          services.robotVideo.openSource(absentVideoSourceId),
        ).rejects.toBeInstanceOf(Error);

        const session = await services.robotVideo.openSource(source.id);
        const tracks = session.mediaStream.getTracks();
        const statuses: string[] = [];
        session.subscribeStatus((status) => statuses.push(status));

        expect(session.mediaStream).toBeDefined();
        expect(tracks.length).toBeGreaterThan(0);
        expect(statuses).toEqual(['connected']);
        session.close();
        session.close();
        expect(statuses).toEqual(['connected', 'disconnected']);
        tracks.forEach((track) => expect(track.readyState).toBe('ended'));
      });
    });

    describe('CaptureOperationsPort', () => {
      it('목록·상세·필터·정렬·페이지와 export 대상 집합을 일치시킨다', async () => {
        const capture = createServices().captureOperations;
        const sessions = await capture.listSessions();
        const target = firstOrThrow(sessions, 'Capture Session');
        const absentSessionId = createAbsentId(
          sessions.map((session) => session.id),
          'missing-session',
        );
        expectValidIds(sessions, 'Capture Session');
        await expect(capture.getSession(target.id)).resolves.toEqual(target);
        await expect(capture.getSession(absentSessionId)).resolves.toBeNull();

        const baseQuery = {
          search: '',
          status: target.status,
          robotId: target.robotId,
          environment: target.provenance.environment,
          deliveryMode: target.provenance.deliveryMode,
          startMs: null,
          sort: 'newest' as const,
        };
        const page = await capture.querySessions({
          ...baseQuery,
          page: 1,
          pageSize: 2,
        });
        const exported = await capture.querySessions({
          ...baseQuery,
          page: 1,
          pageSize: 100_000,
        });

        expect(page.totalItems).toBe(exported.totalItems);
        expect(exported.items).toHaveLength(exported.totalItems);
        expect(exported.items.slice(0, page.items.length)).toEqual(page.items);
        expect(
          exported.items.every(
            (session) =>
              session.status === target.status &&
              session.robotId === target.robotId &&
              session.provenance.environment === target.provenance.environment &&
              session.provenance.deliveryMode === target.provenance.deliveryMode,
          ),
        ).toBe(true);
        expectStableOrder(exported.items, (left, right) => {
          const primary = right.createdAtMs - left.createdAtMs;
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });
      });

      it('Plan option과 전체 정상 상태 전이를 Port에서 제공한다', async () => {
        const services = createServices();
        const robot = firstOrThrow(
          await services.robotCatalog.listRobots(),
          'Robot',
        );
        const sensor = firstOrThrow(
          await services.sensorDeviceCatalog.listSensorDevices(),
          'Sensor Device',
        );
        const options = await services.captureOperations.getPlanOptions(
          robot.id,
          sensor.id,
        );
        const stream = firstOrThrow(options.streams, 'Capture stream');
        const environment = firstOrThrow(options.environments, 'Environment');
        const deliveryMode = firstOrThrow(options.deliveryModes, 'Delivery mode');
        const controlMode = firstOrThrow(options.controlModes, 'Control mode');
        const dataOrigin = firstOrThrow(options.dataOrigins, 'Data origin');

        expect(new Set(options.streams.map((item) => item.id)).size).toBe(
          options.streams.length,
        );
        expectValidIds(options.streams, 'Capture stream');
        options.streams.forEach((item) => {
          if (item.expectedRateHz !== null) expect(item.expectedRateHz).toBeGreaterThan(0);
        });

        const invalidated = vi.fn();
        const unsubscribeSessions = services.captureOperations.subscribeSessions(
          invalidated,
        );
        const created = await services.captureOperations.createSession({
          name: 'Port 계약 Capture',
          robotId: robot.id,
          sensorDeviceId: sensor.id,
          integrationProfileId: robot.integrationProfileId,
          provenance: {
            environment,
            deliveryMode,
            controlMode,
            dataOrigin,
          },
          streams: [stream],
        });
        const statuses: string[] = [];
        const unsubscribeSession = services.captureOperations.subscribeSession(
          created.id,
          (event) => statuses.push(event.session.status),
        );
        expect(created).toMatchObject({
          status: 'draft',
          robotId: robot.id,
          sensorDeviceId: sensor.id,
          streams: [{ state: 'waiting', bytesWritten: 0 }],
        });
        expect(invalidated).toHaveBeenCalled();

        const validation = services.captureOperations.validateSession(created.id);
        await vi.advanceTimersByTimeAsync(300);
        await expect(validation).resolves.toMatchObject({ passed: true });
        const start = services.captureOperations.startSession(created.id);
        await vi.advanceTimersByTimeAsync(300);
        await start;
        const stop = services.captureOperations.stopSession(created.id);
        await vi.advanceTimersByTimeAsync(1000);
        await stop;

        const completed = await services.captureOperations.getSession(created.id);
        expect(completed?.statusHistory.map((item) => item.status)).toEqual([
          'draft',
          'validating',
          'ready',
          'starting',
          'recording',
          'stopping',
          'finalizing',
          'processing',
          'completed',
        ]);
        expect(completed).toMatchObject({
          status: 'completed',
          lastError: null,
        });
        expect(completed?.episodeId).not.toBeNull();
        expect(statuses).toEqual(
          expect.arrayContaining(['draft', 'ready', 'recording', 'completed']),
        );
        unsubscribeSession();
        unsubscribeSessions();
      });

      it('현재 상태가 허용하지 않는 중복 작업과 같은 Robot 동시 recording을 거부한다', async () => {
        const services = createServices();
        const robots = await services.robotCatalog.listRobots();
        const firstRobot = firstOrThrow(robots, 'Robot');
        const secondRobot = robots[1] ?? firstRobot;
        const sensor = firstOrThrow(
          await services.sensorDeviceCatalog.listSensorDevices(),
          'Sensor Device',
        );
        const options = await services.captureOperations.getPlanOptions(
          firstRobot.id,
          sensor.id,
        );
        const stream = firstOrThrow(options.streams, 'Capture stream');
        const inputFor = (name: string, robotId: string) => ({
          name,
          robotId,
          sensorDeviceId: sensor.id,
          integrationProfileId: firstRobot.integrationProfileId,
          provenance: {
            environment: firstOrThrow(options.environments, 'Environment'),
            deliveryMode: firstOrThrow(options.deliveryModes, 'Delivery mode'),
            controlMode: firstOrThrow(options.controlModes, 'Control mode'),
            dataOrigin: firstOrThrow(options.dataOrigins, 'Data origin'),
          },
          streams: [stream],
        });
        const first = await services.captureOperations.createSession(
          inputFor('첫 Session', firstRobot.id),
        );
        const conflict = await services.captureOperations.createSession(
          inputFor('충돌 Session', firstRobot.id),
        );
        const parallel = await services.captureOperations.createSession(
          inputFor('병행 Session', secondRobot.id),
        );

        await expect(
          services.captureOperations.startSession(first.id),
        ).rejects.toBeInstanceOf(Error);
        for (const session of [first, conflict, parallel]) {
          const validation = services.captureOperations.validateSession(session.id);
          await vi.advanceTimersByTimeAsync(300);
          await validation;
        }
        for (const session of [first, parallel]) {
          const start = services.captureOperations.startSession(session.id);
          await vi.advanceTimersByTimeAsync(300);
          await start;
        }

        await expect(
          services.captureOperations.startSession(conflict.id),
        ).rejects.toBeInstanceOf(Error);
        expect((await services.captureOperations.getSession(conflict.id))?.status).toBe(
          'ready',
        );
        expect((await services.captureOperations.getSession(parallel.id))?.status).toBe(
          'recording',
        );
      });
    });

    describe('EpisodeRepositoryPort', () => {
      it('조회 계약과 Capture Session별 한 Episode 생성 규칙을 제공한다', async () => {
        const services = createServices();
        await settleComposition();
        const episodes = await services.episodeRepository.listEpisodes();
        const template = firstOrThrow(episodes, 'Episode');
        const absentEpisodeId = createAbsentId(
          episodes.map((episode) => episode.id),
          'missing-episode',
        );
        const absentCaptureSessionId = createAbsentId(
          episodes.map((episode) => episode.captureSessionId),
          `contract-session-${String(adapterContractNowMs)}`,
        );
        expectValidIds(episodes, 'Episode');
        await expect(
          services.episodeRepository.getEpisode(template.id),
        ).resolves.toEqual(template);
        await expect(
          services.episodeRepository.getEpisode(absentEpisodeId),
        ).resolves.toBeNull();

        const baseQuery = {
          search: '',
          robotId: null,
          environment: null,
          deliveryMode: null,
          sort: 'newest',
        } as const;
        const query = await services.episodeRepository.queryEpisodes({
          ...baseQuery,
          page: 1,
          pageSize: 2,
        });
        const exported = await services.episodeRepository.queryEpisodes({
          ...baseQuery,
          page: 1,
          pageSize: 100_000,
        });
        expect(exported.items).toHaveLength(exported.totalItems);
        expect(exported.items.slice(0, query.items.length)).toEqual(query.items);
        expect(exported.items).toContainEqual(template);
        expectStableOrder(exported.items, (left, right) => {
          const primary = right.createdAtMs - left.createdAtMs;
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });

        const invalidated = vi.fn();
        const unsubscribe = services.episodeRepository.subscribe(invalidated);
        const input = {
          name: 'Port 계약 Episode',
          captureSessionId: absentCaptureSessionId,
          robotId: template.robotId,
          sensorDeviceId: template.sensorDeviceId,
          integrationProfileId: template.integrationProfileId,
          provenance: template.provenance,
          createdAtMs: services.clock.nowMs(),
          durationMs: 1000,
          bytesWritten: 2048,
          streams: template.streams.slice(0, 1),
        };
        const created = await services.episodeRepository.createEpisode(input);
        expect(invalidated).toHaveBeenCalled();
        invalidated.mockClear();
        const duplicate = await services.episodeRepository.createEpisode({
          ...input,
          name: '중복 요청 이름',
        });
        expect(duplicate).toEqual(created);
        expect(invalidated).not.toHaveBeenCalled();
        unsubscribe();
      });
    });

    describe('DatasetRepositoryPort', () => {
      it('조회·생성·수정·Clock·invalidation 계약을 제공한다', async () => {
        const services = createServices();
        await settleComposition();
        const datasets = await services.datasetRepository.listDatasets();
        const firstDataset = firstOrThrow(datasets, 'Dataset');
        const absentDatasetId = createAbsentId(
          datasets.map((dataset) => dataset.id),
          'missing-dataset',
        );
        const episode = firstOrThrow(
          await services.episodeRepository.listEpisodes(),
          'Episode',
        );
        expectValidIds(datasets, 'Dataset');
        await expect(
          services.datasetRepository.getDataset(firstDataset.id),
        ).resolves.toEqual(firstDataset);
        await expect(
          services.datasetRepository.getDataset(absentDatasetId),
        ).resolves.toBeNull();

        const baseQuery = {
          search: '',
          tag: null,
          sort: 'updated-desc',
        } as const;
        const query = await services.datasetRepository.queryDatasets({
          ...baseQuery,
          page: 1,
          pageSize: 2,
        });
        const exported = await services.datasetRepository.queryDatasets({
          ...baseQuery,
          page: 1,
          pageSize: 100_000,
        });
        expect(exported.items).toHaveLength(exported.totalItems);
        expect(exported.items.slice(0, query.items.length)).toEqual(query.items);
        expect(exported.items).toContainEqual(firstDataset);
        expectStableOrder(exported.items, (left, right) => {
          const primary = right.updatedAtMs - left.updatedAtMs;
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });

        const invalidated = vi.fn();
        const unsubscribe = services.datasetRepository.subscribe(invalidated);
        const created = await services.datasetRepository.createDataset({
          name: 'Port 계약 Dataset',
          description: 'Repository 계약 검증',
          tags: ['contract'],
          episodeIds: [episode.id],
        });
        expect(created).toMatchObject({
          status: 'draft',
          createdAtMs: services.clock.nowMs(),
          updatedAtMs: services.clock.nowMs(),
        });
        expect(invalidated).toHaveBeenCalled();
        invalidated.mockClear();

        const updated = await services.datasetRepository.updateDataset({
          id: created.id,
          name: '수정된 Port 계약 Dataset',
          description: created.description,
          tags: [...created.tags, 'updated'],
          episodeIds: created.episodeIds,
        });
        expect(updated).toMatchObject({
          id: created.id,
          name: '수정된 Port 계약 Dataset',
          status: 'draft',
        });
        expect(invalidated).toHaveBeenCalled();
        unsubscribe();

        await expect(
          services.datasetRepository.createDataset({
            name: ' ',
            description: '',
            tags: [],
            episodeIds: [episode.id],
          }),
        ).rejects.toBeInstanceOf(Error);
        await expect(
          services.datasetRepository.updateDataset({
            id: createAbsentId(
              (await services.datasetRepository.listDatasets()).map(
                (dataset) => dataset.id,
              ),
              'missing-dataset',
            ),
            name: '없는 Dataset',
            description: '',
            tags: [],
            episodeIds: [episode.id],
          }),
        ).rejects.toBeInstanceOf(Error);
      });
    });

    describe('RobotEventRepositoryPort', () => {
      it('유형·Robot·기간 필터와 페이지 결과를 제공한다', async () => {
        const repository = createServices().robotEventRepository;
        const events = await repository.listEvents();
        const target = firstOrThrow(events, 'Robot Event');
        expectValidIds(events, 'Robot Event');
        const result = await repository.queryEvents({
          type: target.type,
          robotId: target.robotId,
          startMs: target.occurredAtMs,
          page: 1,
          pageSize: 5,
        });

        expect(result.totalItems).toBeGreaterThan(0);
        expect(result.items.length).toBeLessThanOrEqual(5);
        expect(
          result.items.every(
            (event) =>
              event.type === target.type &&
              event.robotId === target.robotId &&
              event.occurredAtMs >= target.occurredAtMs,
          ),
        ).toBe(true);
        expectStableOrder(result.items, (left, right) => {
          const primary = right.occurredAtMs - left.occurredAtMs;
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });
        const unsubscribe = repository.subscribe(vi.fn());
        expect(unsubscribe).toBeTypeOf('function');
        unsubscribe();
      });
    });

    describe('AnalyticsPort', () => {
      it('Overview와 운영 record를 Query 조건에 맞게 반환한다', async () => {
        const services = createServices();
        await settleComposition();
        const range = {
          startMs: services.clock.nowMs() - 90 * 86_400_000,
          endMs: services.clock.nowMs() + 1,
          robotId: null,
        };
        const overview = await services.analytics.getOverview(range);
        expect(overview.sessionCount).toBeGreaterThanOrEqual(0);
        if (overview.successRatePercent === null) {
          expect(overview.sessionCount).toBe(0);
        } else {
          expect(overview.successRatePercent).toBeGreaterThanOrEqual(0);
          expect(overview.successRatePercent).toBeLessThanOrEqual(100);
        }
        expect(overview.statusSeries.length).toBeGreaterThan(0);
        expect(overview.trendSeries.length).toBeGreaterThan(0);

        const operations = await services.analytics.queryOperations({
          ...range,
          type: 'session',
          status: null,
          environment: null,
          deliveryMode: null,
          groupBy: 'status',
        });
        expect(operations.records.every((record) => record.type === 'session')).toBe(
          true,
        );
        expectStableOrder(operations.records, (left, right) => {
          const primary = right.timestampMs - left.timestampMs;
          return primary === 0 ? left.id.localeCompare(right.id) : primary;
        });
        expect(
          operations.groups.reduce((total, group) => total + group.count, 0),
        ).toBe(operations.records.length);
      });

      it('Telemetry bucket·표시점 제한·aggregate 불변식을 반환한다', async () => {
        const services = createServices();
        const robot = firstOrThrow(
          await services.robotCatalog.listRobots(),
          'Robot',
        );
        const startMs = services.clock.nowMs() - 7 * 86_400_000;
        const endMs = services.clock.nowMs();
        const result = await services.analytics.queryTelemetry({
          robotId: robot.id,
          channel: 'pose',
          startMs,
          endMs,
          maxPoints: 100,
        });

        expect(result.bucketMs).toBeGreaterThan(0);
        expect(result.displayedPointCount).toBe(result.points.length);
        expect(result.points.length).toBeLessThanOrEqual(100);
        result.points.forEach((point, index) => {
          expect(point.timestampMs).toBeGreaterThanOrEqual(startMs);
          expect(point.timestampMs).toBeLessThanOrEqual(endMs);
          if (index > 0) {
            expect(point.timestampMs).toBeGreaterThan(
              result.points[index - 1]?.timestampMs
                ?? Number.POSITIVE_INFINITY,
            );
          }
          expect(point.minimum).toBeLessThanOrEqual(point.average);
          expect(point.maximum).toBeGreaterThanOrEqual(point.average);
          expect(point.sampleCount).toBeGreaterThan(0);
        });
      });

      it('의존 Repository 변경을 invalidation으로 전달하고 해제한다', async () => {
        const services = createServices();
        await settleComposition();
        const episode = firstOrThrow(
          await services.episodeRepository.listEpisodes(),
          'Episode',
        );
        const invalidated = vi.fn();
        const unsubscribe = services.analytics.subscribe(invalidated);
        await services.datasetRepository.createDataset({
          name: 'Analytics invalidation Dataset',
          description: '',
          tags: [],
          episodeIds: [episode.id],
        });
        expect(invalidated).toHaveBeenCalled();
        unsubscribe();
        invalidated.mockClear();
        await services.datasetRepository.createDataset({
          name: '구독 해제 Dataset',
          description: '',
          tags: [],
          episodeIds: [episode.id],
        });
        expect(invalidated).not.toHaveBeenCalled();
      });
    });

    it('업무 payload에 구현 Adapter 식별자를 포함하지 않는다', async () => {
      const services = createServices();
      await settleComposition();
      const robot = firstOrThrow(
        await services.robotCatalog.listRobots(),
        'Robot',
      );
      const sensor = firstOrThrow(
        await services.sensorDeviceCatalog.listSensorDevices(),
        'Sensor Device',
      );
      const payload = await Promise.all([
        services.robotCatalog.listRobots(),
        services.sensorDeviceCatalog.listSensorDevices(),
        services.robotTelemetry.getChannelDescriptors(robot.id),
        services.robotTelemetry.getExecutionSource(),
        services.robotGeolocation.getGeolocationObservation(robot.id),
        services.robotVideo.listSources(robot.id),
        services.captureOperations.getPlanOptions(robot.id, sensor.id),
        services.captureOperations.listSessions(),
        services.episodeRepository.listEpisodes(),
        services.datasetRepository.listDatasets(),
        services.robotEventRepository.listEvents(),
      ]);
      expect(JSON.stringify(payload)).not.toMatch(implementationMarker);
    });
  });
}
