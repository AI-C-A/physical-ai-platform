import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  PatrolApiStatusCheckError,
  PatrolApiStatusContext,
  type PatrolApiStatusPort,
} from '@/entities/robot';
import { ClockContext } from '@/shared/lib/clock';

import { SettingsPage } from './SettingsPage';

function createDeferred(): {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => {
      if (resolvePromise === undefined) {
        throw new Error('지연 상태 확인이 초기화되지 않았습니다.');
      }
      resolvePromise();
    },
  };
}

function renderPage(
  patrolApiStatus: PatrolApiStatusPort,
  nowMs = Date.parse('2026-08-28T15:30:45+09:00'),
) {
  return render(
    <ClockContext.Provider value={{ nowMs: () => nowMs }}>
      <PatrolApiStatusContext.Provider value={patrolApiStatus}>
        <SettingsPage />
      </PatrolApiStatusContext.Provider>
    </ClockContext.Provider>,
  );
}

describe('SettingsPage', () => {
  it('진입 시 요청하지 않고 수동 확인의 진행·성공 상태를 표시한다', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred();
    const check = vi.fn<(
      signal?: AbortSignal,
    ) => Promise<void>>(() => deferred.promise);
    renderPage({
      endpoint: '/api/integrations/patrol',
      check,
    });

    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
    expect(screen.getByText('/api/integrations/patrol')).toBeInTheDocument();
    expect(screen.getByText('확인 전')).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '상태 확인' }));
    expect(check).toHaveBeenCalledOnce();
    expect(check.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
    expect(screen.getByText('확인 중')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '연결 확인 중' }),
    ).toBeDisabled();

    deferred.resolve();
    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(
      screen.getByText('로봇 정보를 정상적으로 불러왔습니다.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeEnabled();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('실패 메시지를 표시하고 같은 버튼으로 다시 확인한다', async () => {
    const user = userEvent.setup();
    const check = vi.fn()
      .mockRejectedValueOnce(new Error('Patrol 서비스를 사용할 수 없습니다.'))
      .mockResolvedValueOnce(undefined);
    renderPage({
      endpoint: '/api/integrations/patrol',
      check,
    });

    await user.click(screen.getByRole('button', { name: '상태 확인' }));
    expect(await screen.findByText('오류')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Patrol API 상태를 확인하지 못했습니다. 연결 설정을 확인한 뒤 다시 시도해 주세요.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Patrol 서비스를 사용할 수 없습니다.'))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 확인' }));
    expect(await screen.findByText('정상')).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('timeout 원인을 사용자가 해결할 수 있는 문구로 안내한다', async () => {
    const user = userEvent.setup();
    renderPage({
      endpoint: '/api/integrations/patrol',
      check: () => Promise.reject(new PatrolApiStatusCheckError('timeout')),
    });

    await user.click(screen.getByRole('button', { name: '상태 확인' }));
    expect(await screen.findByText(
      '응답이 늦어 상태를 확인하지 못했습니다. 다시 시도해 주세요.',
    )).toBeInTheDocument();
  });

  it('endpoint가 없으면 미설정으로 표시하고 확인을 비활성화한다', () => {
    const check = vi.fn(() => Promise.resolve());
    renderPage({ endpoint: null, check });

    expect(screen.getByText('미설정')).toBeInTheDocument();
    expect(screen.getByText('설정되지 않음')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '상태 확인' })).toBeDisabled();
    expect(check).not.toHaveBeenCalled();
  });

  it('화면을 벗어나면 진행 중인 상태 확인을 취소한다', async () => {
    const user = userEvent.setup();
    let observedSignal: AbortSignal | undefined;
    const check = vi.fn((signal?: AbortSignal) => new Promise<void>(
      (_resolve, reject) => {
        observedSignal = signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      },
    ));
    const view = renderPage({
      endpoint: '/api/integrations/patrol',
      check,
    });

    await user.click(screen.getByRole('button', { name: '상태 확인' }));
    view.unmount();

    await waitFor(() => expect(observedSignal?.aborted).toBe(true));
  });
});
