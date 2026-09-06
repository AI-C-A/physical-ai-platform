import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import type { QuestLivePreviewPort } from '@/entities/hand-pose';
import { QuestLiveMonitor } from './QuestLiveMonitor';

it('PC는 WebXR 없이 코드를 만들고 연결 링크를 제공하며 종료할 수 있다', async () => {
  const user = userEvent.setup();
  const session = { sessionId: 'session-1', pairingCode: '123456', viewerToken: 'viewer-secret', expiresAtMs: Date.now() + 60_000, pairingExpiresAtMs: Date.now() + 30_000 };
  const port = {
    createSession: vi.fn(() => Promise.resolve(session)),
    readSession: vi.fn<QuestLivePreviewPort['readSession']>(() => Promise.resolve({ sessionId: session.sessionId, sourceState: 'pending', frameCount: 0, frame: null })),
    closeSession: vi.fn(() => Promise.resolve()),
  };
  const { unmount } = render(<MemoryRouter><QuestLiveMonitor port={port} /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: 'Quest 연결 코드 만들기' }));
  expect(screen.getByLabelText('Quest 연결 코드')).toHaveTextContent('123456');
  expect(screen.getByRole('link', { name: /\/collect\/quest\?code=123456/u })).toHaveAttribute('href', `${window.location.origin}/collect/quest?code=123456`);
  expect(screen.queryByText(/viewer-secret/u)).not.toBeInTheDocument();
  expect(await screen.findByText('Quest 연결 대기')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '연결 종료' }));
  expect(port.closeSession).toHaveBeenCalledWith(session);
  expect(screen.getByRole('button', { name: 'Quest 연결 코드 만들기' })).toBeInTheDocument();
  unmount();
  expect(port.closeSession).toHaveBeenCalledOnce();
});
