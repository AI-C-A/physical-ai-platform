import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { RouteErrorBoundary } from './RouteErrorBoundary';

function BrokenPage(): never {
  throw new Error('화면 렌더링 실패');
}

describe('RouteErrorBoundary', () => {
  it('화면 오류를 landmark와 복구 행동이 있는 한국어 오류 화면으로 표시한다', async () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <BrokenPage />,
        errorElement: <RouteErrorBoundary />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: '요청한 화면을 표시하지 못했습니다',
      }),
    ).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('화면 렌더링 실패');
    expect(
      screen.getByRole('button', { name: '화면 다시 불러오기' }),
    ).toBeEnabled();
  });
});
