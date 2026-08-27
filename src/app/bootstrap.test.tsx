import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bootstrapApplication } from './bootstrap';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('bootstrapApplication', () => {
  it('설정 조회 중 시작 상태를 표시하고 실패 결과로 전환한다', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    ));
    const rootElement = document.createElement('div');
    document.body.append(rootElement);

    let bootstrapPromise: Promise<void> | undefined;
    await act(async () => {
      bootstrapPromise = bootstrapApplication(rootElement);
      await Promise.resolve();
    });

    expect(
      screen.getByRole('status', { name: '애플리케이션 준비 중' }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveFetch?.(new Response(null, { status: 503 }));
      await bootstrapPromise;
    });

    expect(
      screen.getByRole('heading', { name: '애플리케이션을 시작하지 못했습니다' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 503');
  });

  it.each([
    {
      name: '네트워크 실패',
      fetchResult: () => Promise.reject(new TypeError('Failed to fetch')),
      message: '런타임 설정을 요청하지 못했습니다.',
    },
    {
      name: '잘못된 JSON',
      fetchResult: () => Promise.resolve(new Response('{')),
      message: '런타임 설정의 JSON 형식이 올바르지 않습니다.',
    },
    {
      name: '알 수 없는 payload',
      fetchResult: () => Promise.resolve(Response.json({})),
      message: 'adapters 설정은 객체여야 합니다.',
    },
  ])('$name을 복구 가능한 시작 실패로 표시한다', async ({ fetchResult, message }) => {
    vi.stubGlobal('fetch', vi.fn(fetchResult));
    const rootElement = document.createElement('div');
    document.body.append(rootElement);

    await act(async () => {
      await bootstrapApplication(rootElement);
    });

    expect(
      screen.getByRole('heading', { name: '애플리케이션을 시작하지 못했습니다' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeEnabled();
  });
});
