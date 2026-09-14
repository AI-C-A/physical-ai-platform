import { BrandingContext } from '@/shared/config';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createUnavailableQuestCollector, QuestCollectorContext, type QuestCollectorSnapshot } from '@/entities/hand-pose';

import { QuestCollectorPage } from './QuestCollectorPage';

function renderCollector(overrides: Partial<QuestCollectorSnapshot> = {}, initialEntry = '/collect/quest', withLivePreview = false) {
  const fallback = createUnavailableQuestCollector();
  const base = fallback.getSnapshot();
  const snapshot: QuestCollectorSnapshot = {
    ...base,
    support: { state: 'supported', secureContext: true, detail: '' },
    backend: { ...base.backend, state: 'offline' },
    ...overrides,
  };
  const port = {
    ...fallback,
    ...(withLivePreview ? { livePreview: {
      createSession: vi.fn(), readSession: vi.fn(), closeSession: vi.fn(),
    } } : {}),
    getSnapshot: () => snapshot,
    checkSupport: vi.fn(() => Promise.resolve(snapshot)),
    pair: vi.fn(() => Promise.resolve(snapshot)),
    startImmersiveSession: vi.fn(() => Promise.resolve(snapshot)),
    endImmersiveSession: vi.fn(() => Promise.resolve(snapshot)),
    reconnectBackend: vi.fn(() => Promise.resolve(snapshot)),
    leaveCollector: vi.fn(),
  };
  const view = render(
    <BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}><MemoryRouter initialEntries={[initialEntry]}>
      <QuestCollectorContext.Provider value={port}>
        <Routes>
          <Route path="/collect/quest" element={<QuestCollectorPage />} />
          <Route path="/mlops/collection" element={<h1>수집 목록</h1>} />
        </Routes>
      </QuestCollectorContext.Provider>
    </MemoryRouter></BrandingContext.Provider>,
  );
  return { port, ...view };
}

describe('Quest 수집의 단계별 동작', () => {
  it('연결 전에는 코드 입력만 제공하고 연결 실패 후 같은 코드로 재시도한다', async () => {
    const user = userEvent.setup();
    const { port } = renderCollector();
    port.pair.mockRejectedValueOnce(new Error('private pairing endpoint failed'));
    expect(screen.queryByRole('button', { name: '손 추적 시작' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Collector 운영 상태' })).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '6자리 연결 코드' }), '123456');
    await user.click(screen.getByRole('button', { name: '연결' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PC의 연결 코드와 연결 상태를 확인하고 다시 시도하세요.');
    expect(screen.queryByText(/private pairing endpoint/u)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: '연결' }));
    expect(port.pair).toHaveBeenNthCalledWith(2, '123456');
  });

  it('지원되지 않는 기기는 원인과 함께 연결을 막는다', () => {
    renderCollector({ support: { state: 'unsupported', secureContext: false, detail: '보안 연결이 필요합니다.' } });
    expect(screen.getByRole('alert')).toHaveTextContent('보안 연결이 필요합니다.');
    expect(screen.getByRole('button', { name: '연결' })).toBeDisabled();
  });

  it('MR 실행 중 연결이 끊겨도 재연결과 종료를 제공하며 페이지를 떠나면 정리한다', async () => {
    const user = userEvent.setup();
    const { port, unmount } = renderCollector({
      pairing: { state: 'paired', sessionId: 'session-1', participantId: 'participant-1', sourceDeviceId: 'quest-1', detail: null },
      immersive: { state: 'running', detail: null },
      recording: { state: 'recording', episodeId: 'episode-1', command: 'start', acknowledgement: 'acknowledged', detail: null },
    });
    expect(screen.getByRole('region', { name: 'Collector 운영 상태' })).toHaveTextContent('녹화 중');
    expect(screen.getByRole('alert')).toHaveTextContent('PC와 연결이 끊겼습니다.');
    await user.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(port.reconnectBackend).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '손 추적 중지' }));
    expect(port.endImmersiveSession).toHaveBeenCalledOnce();
    unmount();
    expect(port.leaveCollector).toHaveBeenCalledOnce();
  });
});

it('Quest에는 PC 미리보기 링크를 노출하지 않는다', () => {
  renderCollector({}, '/collect/quest', true);
  expect(screen.getByRole('textbox', { name: '6자리 연결 코드' })).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Quest 연결 코드 만들기' })).not.toBeInTheDocument();
});

it('기존 PC 보기 주소는 수집 목록으로 이동하고 Quest를 시작하지 않는다', async () => {
  const { port } = renderCollector({}, '/collect/quest?view=pc', true);
  expect(await screen.findByRole('heading', { name: '수집 목록' })).toBeVisible();
  expect(port.checkSupport).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
