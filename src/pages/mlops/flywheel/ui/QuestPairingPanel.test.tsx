import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';

import { CollectionConnectionPage } from './FlywheelWorkspacePages';

async function setup(expired = false) {
  let now = Date.now() - (expired ? 30 * 60_000 : 0);
  const port = createInMemoryFlywheel({ nowMs: () => now });
  const session = await port.createHumanDemonstrationSession({
    projectId: 'project-tiger', siteId: 'site-lab', name: '연결 복구',
    taskId: 'task-sort', instruction: '물체 분류',
    exoskeletonDeviceId: 'exo-1', questDeviceId: 'quest-1',
    headCameraDeviceId: 'head-1', externalCameraDeviceId: '',
  });
  now = Date.now();
  render(
    <MemoryRouter initialEntries={[`/mlops/collection/${session.id}/setup`]}>
      <FlywheelContext.Provider value={port}>
        <Routes><Route element={<CollectionConnectionPage />} path="/mlops/collection/:sessionId/setup" /></Routes>
      </FlywheelContext.Provider>
    </MemoryRouter>,
  );
  return { port, session };
}

describe('Quest pairing recovery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('만료된 코드를 숨기고 같은 세션에서 새 코드를 발급한다', async () => {
    const user = userEvent.setup();
    const { port, session } = await setup(true);
    try {
      await screen.findByRole('heading', { name: '연결 코드가 만료되었습니다' });
      expect(screen.queryByRole('status', { name: 'Quest pairing code' })).not.toBeInTheDocument();
      const renew = screen.getByRole('button', { name: '새 코드 받기' });
      await user.click(renew);
      const code = await screen.findByRole('status', { name: 'Quest pairing code' });
      expect(code.textContent).not.toBe(session.humanDemonstration?.pairing.code);
      expect(renew).toHaveFocus();
      expect(screen.getByText('새 코드가 발급되었습니다.')).toBeInTheDocument();
      expect(await port.getSession(session.id)).toMatchObject({ id: session.id, taskId: session.taskId });
    } finally { port.dispose(); }
  });

  it('재발급 중 중복 요청을 막고 실패 후 같은 자리에서 재시도한다', async () => {
    const user = userEvent.setup();
    const { port } = await setup(true);
    try {
      await screen.findByRole('heading', { name: '연결 코드가 만료되었습니다' });
      let rejectRequest: (reason: Error) => void = () => undefined;
      const renew = vi.spyOn(port, 'renewHumanDemonstrationPairing').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
      const button = screen.getByRole('button', { name: '새 코드 받기' });
      await user.dblClick(button);
      expect(renew).toHaveBeenCalledTimes(1);
      expect(button).toBeDisabled();
      act(() => rejectRequest(new Error('offline')));
      expect(await screen.findByRole('alert')).toHaveTextContent('새 코드를 받지 못했습니다');
      await user.click(button);
      await screen.findByRole('status', { name: 'Quest pairing code' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally { port.dispose(); }
  });

  it('시간이 지나면 만료 상태로 전환하되 코드를 자동 교체하지 않는다', async () => {
    const { port } = await setup();
    try {
      await screen.findByRole('status', { name: 'Quest pairing code' });
      const renew = vi.spyOn(port, 'renewHumanDemonstrationPairing');
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31 * 60_000);
      await waitFor(() => expect(screen.queryByRole('status', { name: 'Quest pairing code' })).not.toBeInTheDocument(), { timeout: 2_000 });
      expect(screen.getByRole('heading', { name: '연결 코드가 만료되었습니다' })).toBeVisible();
      expect(renew).not.toHaveBeenCalled();
    } finally { port.dispose(); }
  });
});
