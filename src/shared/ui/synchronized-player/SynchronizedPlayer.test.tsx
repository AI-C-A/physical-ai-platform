import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SynchronizedPlayer } from './SynchronizedPlayer';

describe('SynchronizedPlayer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('영상이 없는 상태와 정적 이미지에는 작동하지 않는 재생 버튼을 표시하지 않는다', () => {
    const view = render(<SynchronizedPlayer sources={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('연결된 영상 소스가 없습니다.');
    expect(screen.queryByRole('button', { name: '전체 재생' })).not.toBeInTheDocument();

    view.rerender(<SynchronizedPlayer sources={[{
      id: 'head', imageSrc: '/head.png', label: '헤드 카메라', src: '/head.mp4',
    }]} />);
    expect(screen.queryByRole('button', { name: '전체 재생' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('헤드 카메라')).toBeVisible();
  });

  it('일부 영상 재생에 실패하면 모든 영상을 멈추고 다시 시도할 수 있다', async () => {
    const user = userEvent.setup();
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('media unavailable'));
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<SynchronizedPlayer sources={[
      { id: 'head', label: '헤드 카메라', src: '/head.mp4' },
      { id: 'left', label: '왼손 카메라', src: '/left.mp4' },
    ]} />);

    await user.click(screen.getByRole('button', { name: '전체 재생' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('영상을 재생할 수 없습니다.');
    expect(pause).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '전체 재생' })).toBeEnabled();

    play.mockResolvedValue(undefined);
    await user.click(screen.getByRole('button', { name: '전체 재생' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('재생을 준비하는 동안 정지하면 뒤늦은 실패를 표시하지 않는다', async () => {
    const user = userEvent.setup();
    let rejectPlay: ((reason: Error) => void) | undefined;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => new Promise((_resolve, reject) => {
      rejectPlay = reject;
    }));
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    render(<SynchronizedPlayer sources={[{ id: 'head', label: '헤드 카메라', src: '/head.mp4' }]} />);

    await user.click(screen.getByRole('button', { name: '전체 재생' }));
    expect(screen.getByRole('button', { name: '전체 재생' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '전체 정지' }));
    await act(async () => {
      rejectPlay?.(new Error('play interrupted'));
      await Promise.resolve();
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '전체 재생' })).toBeEnabled();
  });

  it.each(['video', 'image'])('%s 로딩 실패는 해당 소스에만 복구 버튼을 표시한다', async (kind) => {
    const user = userEvent.setup();
    render(<SynchronizedPlayer presentation="monitoring" sources={[
      {
        id: 'head', label: '헤드 카메라', src: '/head.mp4', status: 'live',
        ...(kind === 'image' ? { imageSrc: '/head.png' } : {}),
      },
      { id: 'left', label: '왼손 카메라', src: '/left.mp4', status: 'live' },
    ]} />);

    const original = screen.getByLabelText('헤드 카메라');
    fireEvent.error(original);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('헤드 카메라 영상을 불러오지 못했습니다.');
    expect(screen.getByLabelText('왼손 카메라')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '헤드 카메라 다시 불러오기' }));

    expect(screen.queryByRole('button', { name: '헤드 카메라 다시 불러오기' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('헤드 카메라')).not.toBe(original);
    if (kind === 'video') expect(screen.getByLabelText('헤드 카메라')).toHaveAttribute('preload', 'auto');
  });

  it('featured 레이아웃에서는 첫 카메라를 강조하고 상태와 프레임률을 표시한다', () => {
    render(
      <SynchronizedPlayer
        layout="featured"
        sources={[
          { id: 'head', label: '헤드 카메라', meta: '29.8 FPS', src: '/head.mp4', status: 'live' },
          { id: 'left', label: '왼손 카메라', meta: '29.7 FPS', src: '/left.mp4', status: 'live' },
          { id: 'right', label: '오른손 카메라', meta: '29.9 FPS', src: '/right.mp4', status: 'live' },
        ]}
      />,
    );

    const headVideo = screen.getByLabelText('헤드 카메라 · 29.8 FPS');
    expect(headVideo.closest('[data-fitted-media]')).toHaveClass('sm:col-span-2');
    expect(screen.getByText('29.8 FPS')).toBeInTheDocument();
    expect(screen.getAllByRole('status', { name: '실시간 연결' })).toHaveLength(3);
    expect(screen.getByRole('region', { name: '동기화 멀티뷰' })).toBeInTheDocument();
  });

  it('관제형 표현에서는 제목 아래 원본 16:9 영상을 자르지 않고 표시한다', () => {
    render(
      <SynchronizedPlayer
        layout="featured"
        presentation="monitoring"
        sources={[
          { id: 'head', label: '헤드 카메라', meta: '29.8 FPS', src: '/head.mp4', status: 'live' },
          { id: 'left', label: '왼손 카메라', src: '/left.mp4', status: 'live' },
          { id: 'right', label: '오른손 카메라', src: '/right.mp4', status: 'live' },
        ]}
      />,
    );

    const player = screen.getByRole('region', { name: '동기화 멀티뷰' });
    expect(player).toHaveAttribute('data-presentation', 'monitoring');
    expect(player).toHaveClass('h-full', 'min-h-0');
    const headFigure = screen.getByLabelText('헤드 카메라').closest('figure');
    expect(headFigure).toHaveClass(
      'grid-cols-1',
      'rounded-[var(--design-radius-surface)]',
      'bg-layer-canvas',
      'border-0',
    );
    expect(headFigure).not.toHaveClass('border', 'rounded-[var(--design-radius-soft-group)]');
    expect(headFigure).not.toHaveClass('outline-1', 'outline-media-outline');
    expect(headFigure).toHaveAttribute('data-surface-layer', 'canvas');
    const caption = headFigure?.querySelector('figcaption');
    expect(caption).toHaveClass('bg-layer-raised', 'text-foreground', 'flex-wrap');
    expect(caption).not.toHaveClass('absolute', 'bg-media-scrim');
    expect(headFigure?.firstElementChild).toBe(caption);
    expect(headFigure?.querySelector('[data-camera-viewport]')).toHaveClass('relative', 'w-full', 'aspect-video', 'overflow-hidden');
    expect(caption).toContainElement(screen.getByText('29.8 FPS'));
    expect(headFigure?.closest('[data-camera-card-layout]')).toHaveAttribute(
      'data-camera-card-layout',
      'aspect-video',
    );
    expect(headFigure?.closest('[data-camera-card-layout]')).toHaveClass('h-full', 'auto-rows-fr');
    expect(screen.queryByText('전체 재생')).not.toBeInTheDocument();
    expect(screen.queryByText('전체 정지')).not.toBeInTheDocument();
    expect(screen.queryByText('동기화 멀티뷰')).not.toBeInTheDocument();
    expect(screen.getByText('29.8 FPS')).toBeVisible();
    expect(screen.getAllByText('실시간')).toHaveLength(3);
    expect(screen.getAllByRole('status', { name: '실시간 연결' })).toHaveLength(3);
    expect(screen.getByLabelText('헤드 카메라')).toHaveClass('object-contain');
  });

  it.each([1, 2])('관제형 %i개 카메라도 제목과 16:9 영상에 맞춰 카드 크기를 정한다', (sourceCount) => {
    render(
      <SynchronizedPlayer
        layout="featured"
        presentation="monitoring"
        sources={Array.from({ length: sourceCount }, (_, index) => ({
          id: `camera-${String(index)}`,
          label: `카메라 ${String(index + 1)}`,
          src: `/camera-${String(index)}.mp4`,
          status: 'recorded' as const,
        }))}
      />,
    );

    const firstFigure = screen.getByLabelText('카메라 1').closest('figure');
    expect(firstFigure?.closest('[data-camera-card-layout]')).toHaveAttribute('data-camera-card-layout', 'aspect-video');
    expect(firstFigure?.closest('[data-camera-card-layout]')).toHaveAttribute('data-camera-source-count', String(sourceCount));
    expect(firstFigure?.closest('[data-camera-card-layout]')).toHaveClass('grid-cols-1');
    expect(firstFigure?.closest('[data-camera-card-layout]')).not.toHaveAttribute('style');
    expect(firstFigure?.querySelector('[data-camera-viewport]'))
      .toHaveClass('w-full', 'aspect-video');
    expect(firstFigure).not.toHaveClass('col-span-2');
  });

  it('Depth source는 RGB와 구분되는 렌더 모드를 표시한다', () => {
    render(
      <SynchronizedPlayer
        sources={[
          { id: 'depth', label: '헤드 Depth', renderMode: 'depth', src: '/depth.mp4' },
        ]}
      />,
    );

    const depthVideo = screen.getByLabelText('헤드 Depth');
    expect(depthVideo).toHaveAttribute('data-render-mode', 'depth');
    expect(depthVideo).toHaveClass('grayscale', 'invert', 'contrast-125');
  });

  it('정적 카메라 프레임은 영상 대신 원본 이미지를 렌더링한다', () => {
    render(
      <SynchronizedPlayer
        presentation="monitoring"
        sources={[
          {
            id: 'head-depth',
            imageSrc: '/head-depth.png',
            label: '헤드 Depth',
            renderMode: 'depth',
            src: '/fallback.mp4',
            status: 'live',
          },
        ]}
      />,
    );

    const depthImage = screen.getByLabelText('헤드 Depth');
    expect(depthImage).toHaveAttribute('src', '/head-depth.png');
    expect(depthImage).toHaveAttribute('data-render-mode', 'depth');
    expect(depthImage).not.toHaveClass('grayscale', 'invert', 'contrast-125');
    expect(depthImage.tagName).toBe('IMG');
    expect(depthImage).toHaveClass('object-contain');
  });

  it('전신 카메라는 영상 위에 17개 관절 스켈레톤을 표시한다', () => {
    render(
      <SynchronizedPlayer
        presentation="monitoring"
        sources={[
          {
            id: 'full-body',
            imageSrc: '/full-body.png',
            label: 'External RGB · Full body',
            overlay: 'full-body-skeleton',
            src: '/fallback.mp4',
            status: 'live',
          },
          {
            id: 'head',
            imageSrc: '/head.png',
            label: 'Head RGB',
            src: '/fallback.mp4',
            status: 'live',
          },
        ]}
      />,
    );

    const fullBodyFrame = screen.getByLabelText('External RGB · Full body').closest('figure');
    expect(within(fullBodyFrame as HTMLElement).getByRole('img', {
      name: '전신 스켈레톤 인식 · 관절 17개 · 추적 중',
    })).toHaveAttribute('data-full-body-skeleton', 'true');
    expect(within(fullBodyFrame as HTMLElement).getByText('전신 관절 · 17/17')).toBeVisible();
    expect(fullBodyFrame?.querySelector('figcaption'))
      .toContainElement(screen.getByText('전신 관절 · 17/17'));
    expect(fullBodyFrame?.querySelector('[data-camera-viewport]'))
      .not.toContainElement(screen.getByText('전신 관절 · 17/17'));
    expect(fullBodyFrame?.querySelector('svg')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
    expect(screen.getByLabelText('Head RGB').closest('figure'))
      .not.toContainElement(screen.getByRole('img', { name: /전신 스켈레톤 인식/u }));
  });

  it('오프라인 source는 마지막 샘플 이미지를 live처럼 표시하지 않는다', () => {
    render(
      <SynchronizedPlayer
        presentation="monitoring"
        sources={[{
          id: 'offline-head',
          imageSrc: '/head.png',
          label: 'Head RGB',
          src: '/fallback.mp4',
          status: 'offline',
        }]}
      />,
    );

    expect(screen.queryByLabelText('Head RGB')).not.toBeInTheDocument();
    expect(screen.getAllByText('연결 끊김')).toHaveLength(2);
    expect(screen.getByText('연결과 전원 상태를 확인하세요.')).toBeVisible();
  });
});
