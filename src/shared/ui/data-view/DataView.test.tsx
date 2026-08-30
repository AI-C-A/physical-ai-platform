import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DataView } from './DataView';

describe('DataView', () => {
  it('loading 상태를 공통 피드백으로 표현한다', () => {
    render(<DataView state="loading" />);
    expect(screen.getByRole('status', { name: '불러오는 중' })).toBeInTheDocument();
  });

  it('empty 상태를 공통 피드백으로 표현한다', () => {
    render(<DataView state="empty" />);
    expect(screen.getByText('표시할 데이터가 없습니다.')).toBeInTheDocument();
  });

  it('error 상태에서 다시 시도를 제공한다', async () => {
    const retry = vi.fn();
    render(<DataView message="연결 실패" onRetry={retry} state="error" />);
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('ready 상태에서 데이터와 페이지 이동 영역을 조합한다', () => {
    render(
      <DataView footer={<nav aria-label="페이지 이동">페이지</nav>}>
        <table><tbody><tr><td>로봇 1</td></tr></tbody></table>
      </DataView>,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '페이지 이동' })).toBeInTheDocument();
  });

  it('공통 Surface 클래스와 호출자 클래스를 함께 유지한다', () => {
    render(<DataView className="min-h-40" data-testid="data-view" />);
    expect(screen.getByTestId('data-view')).toHaveClass(
      'grid',
      'overflow-hidden',
      'min-h-40',
    );
  });
});
