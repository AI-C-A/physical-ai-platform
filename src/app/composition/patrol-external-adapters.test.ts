import { describe, expect, it, vi } from 'vitest';

import {
  PatrolRobotCatalogAdapter,
  PatrolRobotOperationalStatusQuery,
} from '@/entities/robot';
import { PatrolRobotEventRepository } from '@/entities/robot-event';
import { KinesisCameraAdapter } from '@/entities/robot-video';
import type { RuntimeConfig } from '@/shared/config';

import { createApplicationServices } from './application-services';
import { createPatrolExternalAdapters } from './patrol-external-adapters';

const realRuntimeConfig: RuntimeConfig = {
  branding: {
    productName: 'ROBOT Army TIGER+',
    shortName: 'ROBOT Army TIGER+',
    logo: null,
  },
  adapters: {
    mode: 'bundle',
    implementation: 'external',
  },
  connections: {
    patrol: { endpoint: '/api/integrations/patrol' },
    telemetry: { endpoint: null, integrationProfileId: null },
    video: { endpoint: null },
    capture: { endpoint: null },
  },
};

describe('Patrol real Adapter 구성', () => {
  it('Patrol 읽기 Adapter와 명시적인 no-data Port로 전체 bundle을 만든다', async () => {
    const services = createApplicationServices(realRuntimeConfig, {
      externalAdapterFactory: createPatrolExternalAdapters,
    });
    expect(services).not.toHaveProperty('dataEnvironment');

    expect(services.robotCatalog).toBeInstanceOf(PatrolRobotCatalogAdapter);
    expect(services.patrolApiStatus).toBe(services.robotCatalog);
    expect(services.patrolApiStatus.endpoint).toBe(
      '/api/integrations/patrol',
    );
    expect(services.robotOperationalStatus)
      .toBeInstanceOf(PatrolRobotOperationalStatusQuery);
    expect(services.robotVideo).toBeInstanceOf(KinesisCameraAdapter);
    await expect(services.sensorDeviceCatalog.listSensorDevices()).resolves.toEqual([]);
    await expect(services.robotTelemetry.getChannelDescriptors('robot-1')).resolves.toEqual([]);
    await expect(services.robotGeolocation.getGeolocationObservation('robot-1')).resolves.toBeNull();
    await expect(services.captureOperations.listSessions()).resolves.toEqual([]);
    expect(services.robotEventRepository).toBeInstanceOf(PatrolRobotEventRepository);
    await expect(services.episodeRepository.listEpisodes()).resolves.toEqual([]);
    await expect(services.datasetRepository.listDatasets()).resolves.toEqual([]);
    await expect(services.interventionQueue.listActiveRequests()).resolves.toEqual([]);
    await expect(services.analytics.getOverview({
      startMs: 0,
      endMs: 1,
      robotId: null,
    })).resolves.toMatchObject({
      sessionCount: 0,
      successRatePercent: null,
      episodeCount: 0,
      datasetCount: 0,
    });

    const connectionListener = vi.fn();
    services.robotTelemetry.subscribeConnection(connectionListener);
    expect(connectionListener).toHaveBeenCalledWith('disconnected');
    services.dispose();
  });

  it('command transport가 없는 쓰기 작업을 거절한다', async () => {
    const services = createApplicationServices(realRuntimeConfig, {
      externalAdapterFactory: createPatrolExternalAdapters,
    });

    await expect(services.datasetRepository.createDataset({
      name: 'dataset',
      description: '',
      tags: [],
      episodeIds: [],
    })).rejects.toThrow('이 실행 환경에서는 지원하지 않는 작업입니다');
    await expect(services.captureOperations.startSession('session-1'))
      .rejects.toThrow('이 실행 환경에서는 지원하지 않는 작업입니다');
    await expect(services.interventionQueue.accept('intervention-1'))
      .rejects.toThrow('이 실행 환경에서는 지원하지 않는 작업입니다');
    services.dispose();
  });
});
