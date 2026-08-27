import type { ClockPort } from '@/shared/lib/clock';

import type { CaptureSession, CaptureSessionStatus } from '../model/capture-session';

function historyFor(status: CaptureSessionStatus, createdAtMs: number) {
  const standard: readonly CaptureSessionStatus[] = [
    'draft', 'validating', 'ready', 'starting', 'recording', 'stopping', 'finalizing', 'processing', 'completed',
  ];
  if (status === 'failed' || status === 'interrupted') {
    return [
      { status: 'draft' as const, occurredAtMs: createdAtMs },
      { status: status === 'failed' ? ('validating' as const) : ('recording' as const), occurredAtMs: createdAtMs + 1000 },
      { status, occurredAtMs: createdAtMs + 2000 },
    ];
  }
  const end = Math.max(0, standard.indexOf(status));
  return standard.slice(0, end + 1).map((item, index) => ({ status: item, occurredAtMs: createdAtMs + index * 1000 }));
}

export function createInMemoryCaptureSessions(clock: ClockPort): readonly CaptureSession[] {
  const anchorMs = clock.nowMs();
  return Array.from({ length: 36 }, (_, index) => {
    const status: CaptureSessionStatus = index < 24 ? 'completed' : index < 29 ? 'failed' : index < 33 ? 'interrupted' : 'draft';
    const createdAtMs = anchorMs - index * 18 * 60 * 60 * 1000;
    const completed = status === 'completed';
    const environment = index % 4 === 0 ? 'simulation' as const : 'physical' as const;
    const deliveryMode = index % 5 === 0 ? 'replay' as const : 'live' as const;
    const dataOrigin = environment === 'simulation' ? 'synthetic' as const : index % 6 === 0 ? 'derived' as const : 'captured' as const;
    return {
      id: `session-${String(index + 1).padStart(3, '0')}`,
      name: `수집 세션 ${String(index + 1).padStart(2, '0')}`,
      robotId: `robot-${String((index % 8) + 1).padStart(3, '0')}`,
      sensorDeviceId: `sensor-rig-${String((index % 4) + 1).padStart(3, '0')}`,
      integrationProfileId: index % 2 === 0 ? 'multisensor-rig-v1' : 'vision-rig-v1',
      provenance: {
        environment,
        deliveryMode,
        controlMode: index % 3 === 0 ? 'teleop' as const : 'autonomous' as const,
        dataOrigin,
      },
      status,
      createdAtMs,
      startedAtMs: status === 'draft' || status === 'failed' ? null : createdAtMs + 3000,
      stoppedAtMs: completed || status === 'interrupted' ? createdAtMs + 63_000 : null,
      completedAtMs: completed ? createdAtMs + 66_000 : null,
      bytesWritten: completed ? 32_000_000 + index * 500_000 : status === 'interrupted' ? 7_500_000 : 0,
      streams: [
        { id: 'pose', displayName: '위치', expectedRateHz: 20, state: completed ? 'stopped' as const : status === 'interrupted' ? 'stale' as const : 'waiting' as const, observedRateHz: completed ? 19.9 : null, bytesWritten: completed ? 4_000_000 : 0, lastReceivedTimestampMs: completed ? createdAtMs + 62_000 : null },
        { id: 'battery', displayName: '배터리', expectedRateHz: 1, state: completed ? 'stopped' as const : status === 'interrupted' ? 'stale' as const : 'waiting' as const, observedRateHz: completed ? 1 : null, bytesWritten: completed ? 100_000 : 0, lastReceivedTimestampMs: completed ? createdAtMs + 62_000 : null },
        { id: 'imu', displayName: 'IMU', expectedRateHz: 20, state: completed ? 'stopped' as const : status === 'interrupted' ? 'stale' as const : 'waiting' as const, observedRateHz: completed ? 20 : null, bytesWritten: completed ? 12_000_000 : 0, lastReceivedTimestampMs: completed ? createdAtMs + 62_000 : null },
      ],
      episodeId: completed ? `episode-${String(index + 1).padStart(3, '0')}` : null,
      lastError: status === 'failed' ? '사전 점검에 실패했습니다.' : status === 'interrupted' ? '기록 중 스트림 수신이 중단되었습니다.' : null,
      preflight: status === 'draft' ? null : {
        passed: status !== 'failed',
        checks: [{ id: 'capture-readiness', label: '수집 준비 상태', state: status === 'failed' ? 'failed' as const : 'passed' as const, detail: status === 'failed' ? '필수 입력 상태를 확인하지 못했습니다.' : '필수 입력과 기록 대상이 준비되었습니다.' }],
      },
      statusHistory: historyFor(status, createdAtMs),
    };
  });
}
