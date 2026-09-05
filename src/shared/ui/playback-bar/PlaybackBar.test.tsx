import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaybackBar } from './PlaybackBar';

function TestPlaybackBar() {
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(33);
  return (
    <PlaybackBar
      ariaLabel="Episode 재생 컨트롤"
      durationMs={1_000}
      formatTime={(timeMs) => `${String(timeMs)} ms`}
      label="Episode 001"
      onPlayingChange={setPlaying}
      onPositionChange={setPositionMs}
      playing={playing}
      positionMs={positionMs}
    />
  );
}

describe('PlaybackBar', () => {
  afterEach(() => vi.useRealTimers());

  it('공통 surface와 토큰 기반 조작 영역으로 재생 상태를 제어한다', async () => {
    const user = userEvent.setup();
    render(<TestPlaybackBar />);

    const controls = screen.getByRole('group', { name: 'Episode 재생 컨트롤' });
    expect(controls).toHaveAttribute('data-surface-layer', 'soft-group');
    expect(within(controls).getByRole('slider', { name: 'Episode 재생 컨트롤 위치' }))
      .toHaveValue('33');
    expect(within(controls).getByRole('status')).toHaveTextContent('일시 정지됨');

    await user.click(within(controls).getByRole('button', { name: '재생' }));
    expect(within(controls).getByRole('button', { name: '일시정지' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(controls).getByRole('status')).toHaveTextContent('재생 중');

    await user.click(within(controls).getByRole('button', { name: '다음 프레임' }));
    expect(within(controls).getByRole('slider')).toHaveValue('66');
    expect(within(controls).getByRole('button', { name: '재생' }))
      .toHaveAttribute('aria-pressed', 'false');

    await user.click(within(controls).getByRole('button', { name: '재생 속도 1배' }));
    expect(within(controls).getByRole('button', { name: '재생 속도 2배' })).toBeVisible();
  });

  it('Space 단축키는 편집 영역과 모달, 반복 키 입력의 기본 동작을 보존한다', () => {
    render(
      <>
        <TestPlaybackBar />
        <div contentEditable suppressContentEditableWarning tabIndex={0}>메모 입력</div>
        <div aria-label="에피소드 검수" aria-modal="true" role="dialog" tabIndex={0}>검수 내용</div>
      </>,
    );

    fireEvent.keyDown(screen.getByText('메모 입력'), { code: 'Space' });
    fireEvent.keyDown(screen.getByRole('dialog'), { code: 'Space' });
    fireEvent.keyDown(document.body, { code: 'Space', repeat: true });

    expect(screen.getByRole('button', { name: '재생' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('비활성화된 재생기는 재생 시간이 흐르지 않는다', () => {
    vi.useFakeTimers();
    const onPositionChange = vi.fn();
    const onPlayingChange = vi.fn();
    render(
      <PlaybackBar
        disabled
        durationMs={1_000}
        formatTime={String}
        label="Episode 001"
        onPlayingChange={onPlayingChange}
        onPositionChange={onPositionChange}
        playing
        positionMs={33}
      />,
    );

    act(() => { vi.advanceTimersByTime(1_000); });

    expect(onPositionChange).not.toHaveBeenCalled();
  });
});
