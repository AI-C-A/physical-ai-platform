import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StartupFailure, StartupLoading } from './startup-failure';

describe('StartupFailure', () => {
  it('런타임 설정을 확인하는 동안 빈 화면 대신 시작 상태를 알린다', () => {
    render(<StartupLoading />);

    expect(
      screen.getByRole('status', { name: '애플리케이션 준비 중' }),
    ).toBeInTheDocument();
  });

  it('시작 실패 원인과 설정 확인 경로 및 복구 행동을 제공한다', () => {
    render(<StartupFailure message="adapters.mode 설정이 올바르지 않습니다." />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '애플리케이션을 시작하지 못했습니다',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('adapters.mode');
    expect(screen.getByText('/runtime-config.json')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '다시 불러오기' }),
    ).toBeInTheDocument();
  });
});
