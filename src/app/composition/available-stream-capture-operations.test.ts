import { describe, expect, it, vi } from 'vitest';

import { InMemoryCaptureOperationsAdapter } from '@/entities/capture-session';
import type { RobotOperationalStatusQueryPort } from '@/entities/robot';
import type { RobotTelemetryPort } from '@/entities/robot-telemetry';
import type { RobotVideoPort } from '@/entities/robot-video';

import { AvailableStreamCaptureOperations } from './available-stream-capture-operations';

const telemetry: RobotTelemetryPort = {
  getChannelDescriptors: () => Promise.resolve([
    { channel: 'pose', displayName: '위치', expectedRateHz: 20, staleAfterMs: 300 },
    { channel: 'battery', displayName: '배터리', expectedRateHz: 1, staleAfterMs: 2500 },
  ]),
  getExecutionSource: () => Promise.resolve({
    environment: 'physical',
    deliveryMode: 'live',
  }),
  connect: () => Promise.resolve(),
  subscribe: () => () => undefined,
  subscribeConnection: () => () => undefined,
  disconnect: () => undefined,
};

const operationalStatus: RobotOperationalStatusQueryPort = {
  listOperationalDataSources: (robotId) => Promise.resolve([{
    id: `${robotId}:operational-status`,
    displayName: '로봇 운영 상태 API',
  }]),
  getOperationalStatus: () => Promise.resolve(null),
};

describe('AvailableStreamCaptureOperations', () => {
  it('API, Telemetry, Video Port가 제공한 stream을 계획에 사용한다', async () => {
    const base = new InMemoryCaptureOperationsAdapter();
    const video: RobotVideoPort = {
      listSources: () => Promise.resolve([
        { id: 'camera-left', robotId: 'robot-01', displayName: '좌측 카메라' },
        { id: 'camera-right', robotId: 'robot-01', displayName: '우측 카메라' },
      ]),
      openSource: () => Promise.reject(new Error('계획 시험에서는 영상을 열지 않습니다.')),
    };
    const operations = new AvailableStreamCaptureOperations(
      base,
      operationalStatus,
      telemetry,
      video,
    );

    await expect(operations.getPlanOptions('robot-01', 'sensor-rig-001'))
      .resolves.toMatchObject({
        streams: [
          {
            id: 'robot-01:operational-status',
            displayName: '로봇 운영 상태 API',
            expectedRateHz: null,
          },
          { id: 'pose', displayName: '위치', expectedRateHz: 20 },
          { id: 'battery', displayName: '배터리', expectedRateHz: 1 },
          { id: 'camera-left', displayName: '좌측 카메라', expectedRateHz: null },
          { id: 'camera-right', displayName: '우측 카메라', expectedRateHz: null },
        ],
      });
    base.dispose();
  });

  it('서로 다른 Adapter가 같은 stream ID를 반환하면 모호한 계획을 거절한다', async () => {
    const base = new InMemoryCaptureOperationsAdapter();
    const video: RobotVideoPort = {
      listSources: () => Promise.resolve([
        { id: 'pose', robotId: 'robot-01', displayName: '충돌 카메라' },
      ]),
      openSource: () => Promise.reject(new Error('계획 시험에서는 영상을 열지 않습니다.')),
    };
    const operations = new AvailableStreamCaptureOperations(
      base,
      operationalStatus,
      telemetry,
      video,
    );

    await expect(
      operations.getPlanOptions('robot-01', 'sensor-rig-001'),
    ).rejects.toThrow('중복된 기록 대상 stream 식별자');
    base.dispose();
  });

  it('상태 변경과 구독은 원래 Capture Adapter에 위임한다', async () => {
    const base = new InMemoryCaptureOperationsAdapter();
    const createSession = vi.spyOn(base, 'createSession');
    const video: RobotVideoPort = {
      listSources: () => Promise.resolve([]),
      openSource: () => Promise.reject(new Error('계획 시험에서는 영상을 열지 않습니다.')),
    };
    const operations = new AvailableStreamCaptureOperations(
      base,
      operationalStatus,
      telemetry,
      video,
    );
    const input = {
      name: 'stream 계획',
      robotId: 'robot-01',
      sensorDeviceId: 'sensor-rig-001',
      integrationProfileId: 'profile-01',
      provenance: {
        environment: 'physical' as const,
        deliveryMode: 'live' as const,
        controlMode: 'teleop' as const,
        dataOrigin: 'captured' as const,
      },
      streams: [{ id: 'pose', displayName: '위치', expectedRateHz: 20 }],
    };

    await operations.createSession(input);

    expect(createSession).toHaveBeenCalledWith(input);
    base.dispose();
  });
});
