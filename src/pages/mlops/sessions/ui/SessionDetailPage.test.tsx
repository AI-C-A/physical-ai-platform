import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import {
  CaptureOperationsContext,
  type CaptureOperationsPort,
  type CaptureSession,
} from '@/entities/capture-session';

import { SessionDetailPage } from './SessionDetailPage';

const initialSession: CaptureSession = {
  id: 'session-001',
  name: '상세 갱신 검증 세션',
  robotId: 'robot-001',
  sensorDeviceId: 'sensor-rig-001',
  integrationProfileId: 'robot-profile-v1',
  provenance: {
    environment: 'physical',
    deliveryMode: 'live',
    controlMode: 'teleop',
    dataOrigin: 'captured',
  },
  status: 'recording',
  createdAtMs: 1,
  startedAtMs: 2,
  stoppedAtMs: null,
  completedAtMs: null,
  bytesWritten: 1024,
  streams: [],
  episodeId: null,
  lastError: null,
  preflight: null,
  statusHistory: [
    { status: 'recording', occurredAtMs: 2 },
  ],
};

const recoveredSession: CaptureSession = {
  ...initialSession,
  status: 'completed',
  stoppedAtMs: 3,
  completedAtMs: 4,
  statusHistory: [
    ...initialSession.statusHistory,
    { status: 'completed', occurredAtMs: 4 },
  ],
};

function makeOperations(
  getSession: CaptureOperationsPort['getSession'],
  subscribeSessions: CaptureOperationsPort['subscribeSessions'],
): CaptureOperationsPort {
  return {
    listSessions: () => Promise.resolve([]),
    querySessions: (query) => Promise.resolve({
      items: [],
      page: query.page,
      pageSize: query.pageSize,
      totalItems: 0,
      totalPages: 1,
    }),
    getSession,
    getPlanOptions: () => Promise.reject(new Error('사용하지 않는 조회')),
    createSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    validateSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    startSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    stopSession: () => Promise.reject(new Error('사용하지 않는 명령')),
    subscribeSession: () => () => undefined,
    subscribeSessions,
  };
}

describe('SessionDetailPage', () => {
  it('구독 갱신 실패 시 기존 상세와 재시도를 제공하고 최신 상태로 복구한다', async () => {
    const user = userEvent.setup();
    let invalidate: (() => void) | undefined;
    const getSession = vi.fn<CaptureOperationsPort['getSession']>()
      .mockResolvedValueOnce(initialSession)
      .mockRejectedValueOnce(new Error('수집 세션 상세 갱신 실패'))
      .mockResolvedValueOnce(recoveredSession);
    const operations = makeOperations(
      getSession,
      (listener) => {
        invalidate = listener;
        return () => undefined;
      },
    );

    render(
      <CaptureOperationsContext.Provider value={operations}>
        <MemoryRouter initialEntries={['/mlops/sessions/session-001']}>
          <Routes>
            <Route path="/mlops/sessions/:sessionId" element={<SessionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </CaptureOperationsContext.Provider>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: '상세 갱신 검증 세션' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('기록 중');
    expect(screen.getAllByText('기록 중').length).toBeGreaterThan(0);
    await waitFor(() => expect(invalidate).toBeDefined());

    act(() => invalidate?.());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '기존 상세 정보를 유지했습니다. 수집 세션 상세 갱신 실패',
    );
    expect(screen.getAllByText('기록 중').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));

    await waitFor(() => expect(getSession).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByText('완료').length).toBeGreaterThan(0));
    expect(screen.getByRole('status')).toHaveTextContent('완료');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
