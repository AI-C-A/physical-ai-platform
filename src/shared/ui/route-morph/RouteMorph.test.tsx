import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RouteMorphProvider,
  useRouteMorph,
  useRouteMorphTarget,
} from './index';

function SourceRoute() {
  const morph = useRouteMorph('demo-route');
  const linkMorph = useRouteMorph('demo-link');

  return (
    <>
      <button
        {...morph.getTriggerProps('/target')}
        style={{ borderRadius: '18px' }}
        type="button"
      >
        버튼에서 열기
      </button>
      <Link
        {...linkMorph.getTriggerProps('/target')}
        target="_blank"
        to="/target"
      >
        링크에서 열기
      </Link>
    </>
  );
}

function TargetRoute() {
  const morph = useRouteMorph('demo-route');
  const targetProps = useRouteMorphTarget();

  return (
    <main {...targetProps}>
      <h1>목적지 화면</h1>
      <button onClick={() => morph.close('/')} type="button">
        닫기
      </button>
    </main>
  );
}

function renderRoutes() {
  const router = createMemoryRouter([
    {
      element: (
        <RouteMorphProvider>
          <Outlet />
        </RouteMorphProvider>
      ),
      children: [
        { index: true, element: <SourceRoute /> },
        { path: '/target', element: <TargetRoute /> },
      ],
    },
  ]);
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

beforeEach(() => {
  const startViewTransition = vi.fn((update: unknown) => {
    if (typeof update !== 'function') {
      throw new Error('View Transition update callback이 필요합니다.');
    }
    const updateCallback = update as () => unknown;
    const updateCallbackDone = Promise.resolve().then(() => {
      const result = updateCallback();
      return result;
    });
    return {
      finished: updateCallbackDone,
      ready: Promise.resolve(),
      skipTransition: vi.fn(),
      types: new Set<string>(),
      updateCallbackDone,
    } as unknown as ViewTransition;
  });
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransition,
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.restoreAllMocks();
});

describe('RouteMorph', () => {
  it('임의 버튼과 목적지를 활성화하고 source 곡률을 역방향까지 보존한다', async () => {
    const user = userEvent.setup();
    const view = renderRoutes();
    const source = screen.getByRole('button', { name: '버튼에서 열기' });

    await user.click(source);

    expect(await screen.findByRole('heading', { name: '목적지 화면' }))
      .toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute(
      'data-route-morph-id',
      'demo-route',
    );
    expect(screen.getByRole('main')).toHaveAttribute('data-route-morph-active', '');
    expect(document.documentElement.style.getPropertyValue('--route-morph-radius'))
      .toBe('18px');
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute(
        'data-route-morph-direction',
      );
    });

    await user.click(screen.getByRole('button', { name: '닫기' }));

    const restoredSource = await screen.findByRole('button', {
      name: '버튼에서 열기',
    });
    expect(restoredSource).toHaveAttribute('data-route-morph-active', '');
    expect(document.documentElement.style.getPropertyValue('--route-morph-radius'))
      .toBe('18px');

    view.unmount();
    expect(document.documentElement).not.toHaveAttribute(
      'data-route-morph-direction',
    );
    expect(document.documentElement.style.getPropertyValue('--route-morph-radius'))
      .toBe('');
  });

  it('새 탭으로 여는 링크 조작은 가로채지 않는다', () => {
    const { router } = renderRoutes();
    const link = screen.getByRole('link', { name: '링크에서 열기' });

    expect(fireEvent.click(link)).toBe(true);
    expect(router.state.location.pathname).toBe('/');
    expect(document.documentElement).not.toHaveAttribute(
      'data-route-morph-direction',
    );
  });
});
