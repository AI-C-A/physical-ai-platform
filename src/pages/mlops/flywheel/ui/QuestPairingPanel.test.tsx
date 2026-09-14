import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';

import { QuestPairingPanel } from './QuestPairingPanel';

import { CollectionConnectionPage } from './FlywheelWorkspacePages';

async function setup(expired = false, configure?: (port: ReturnType<typeof createInMemoryFlywheel>) => void, standalone = false) {
  let now = Date.now() - (expired ? 30 * 60_000 : 0);
  const port = createInMemoryFlywheel({ nowMs: () => now });
  const session = await port.createHumanDemonstrationSession({
    projectId: 'project-tiger', siteId: 'site-lab', name: '연결 복구',
    taskId: 'task-sort', instruction: '물체 분류',
    exoskeletonDeviceId: 'exo-1', questDeviceId: 'quest-1',
    headCameraDeviceId: 'head-1', externalCameraDeviceId: '',
  });
  now = Date.now();
  const renew = vi.spyOn(port, 'renewHumanDemonstrationPairing');
  configure?.(port);
  render(
    <MemoryRouter initialEntries={[`/mlops/collection/${session.id}/setup`]}>
      <FlywheelContext.Provider value={port}>
        {standalone ? <StrictMode><QuestPairingPanel session={session} /></StrictMode>
          : <Routes><Route element={<CollectionConnectionPage />} path="/mlops/collection/:sessionId/setup" /></Routes>}
      </FlywheelContext.Provider>
    </MemoryRouter>,
  );
  return { port, session, renew };
}

describe('Quest pairing recovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('처음 열 때 이미 만료된 코드는 같은 세션에서 자동 발급한다', async () => {
    const { port, session } = await setup(true);
    try {
      const code = await screen.findByRole('status', { name: 'Quest 연결 코드' });
      expect(code.textContent).not.toBe(session.humanDemonstration?.pairing.code);
      expect(screen.queryByRole('heading', { name: '연결 코드가 만료되었습니다' })).not.toBeInTheDocument();
      expect(screen.getByText('새 코드가 발급되었습니다.')).toBeInTheDocument();
      expect(await port.getSession(session.id)).toMatchObject({ id: session.id, taskId: session.taskId });
    } finally { port.dispose(); }
  });

  it('StrictMode에서도 한 번만 발급하고 세션 재조회 없이 새 코드를 표시한다', async () => {
    const { port, session, renew } = await setup(true, undefined, true);
    try {
      const code = await screen.findByRole('status', { name: 'Quest 연결 코드' });
      expect(code.textContent).not.toBe(session.humanDemonstration?.pairing.code);
      expect(renew).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('timer')).toHaveTextContent('5:00');
    } finally { port.dispose(); }
  });

  it('재발급 중 중복 요청을 막고 실패 후 같은 자리에서 재시도한다', async () => {
    const user = userEvent.setup();
    let rejectRequest: (reason: Error) => void = () => undefined;
    const { port, renew } = await setup(true, (port) => {
      vi.spyOn(port, 'renewHumanDemonstrationPairing').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    });
    try {
      await screen.findByText('연결 코드 발급 중…');
      expect(renew).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: '새 코드 받기' })).not.toBeInTheDocument();
      act(() => rejectRequest(new Error('offline')));
      expect(await screen.findByRole('alert')).toHaveTextContent('새 코드를 받지 못했습니다');
      const button = screen.getByRole('button', { name: '새 코드 받기' });
      await user.dblClick(button);
      await screen.findByRole('status', { name: 'Quest 연결 코드' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally { port.dispose(); }
  });

  it('시간이 지나면 만료 상태로 전환하되 코드를 자동 교체하지 않는다', async () => {
    const { port, renew } = await setup();
    try {
      await screen.findByRole('status', { name: 'Quest 연결 코드' });
      expect(renew).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: '새 코드 받기' })).not.toBeInTheDocument();
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
      await waitFor(() => expect(screen.queryByRole('status', { name: 'Quest 연결 코드' })).not.toBeInTheDocument(), { timeout: 2_000 });
      expect(screen.getByText('연결 코드가 만료되었습니다.')).toBeVisible();
      expect(renew).toHaveBeenCalledTimes(1);
    } finally { port.dispose(); }
  });
});
