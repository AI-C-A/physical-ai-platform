import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FittedMedia } from './FittedMedia';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('FittedMedia', () => {
  it.each([40, 64])('제목 높이 %ipx를 제외하고 카드 전체를 16:9에 맞추며 구독을 정리한다', (chrome) => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const frame = this.closest('[data-fitted-media]')?.firstElementChild as HTMLElement;
      const width = Number.parseFloat(frame.style.width);
      const height = width * 9 / 16 + (this.hasAttribute('data-aspect-media-viewport') ? 0 : chrome);
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) };
    });
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect; });
    const { container, rerender, unmount } = render(<FittedMedia><div data-aspect-media-viewport /></FittedMedia>);
    const frame = container.querySelector('[data-fitted-media]')?.firstElementChild as HTMLElement;
    expect(Number.parseFloat(frame.style.width)).toBeCloseTo((300 - chrome) * 16 / 9);
    expect(observe).toHaveBeenCalledTimes(2);
    rerender(<FittedMedia constrained={false}><div data-aspect-media-viewport /></FittedMedia>);
    expect(frame.style.width).toBe('');
    expect(disconnect).toHaveBeenCalledOnce();
    unmount();
  });
});
