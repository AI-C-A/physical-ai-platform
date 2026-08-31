import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  RobotVideoContext,
  type RobotVideoPort,
  type RobotVideoSession,
} from '@/entities/robot-video';

import { MultiRobotCameraGrid } from './MultiRobotCameraGrid';

const targets = [
  { robotId: 'robot-a', displayName: '정찰 로봇 A' },
  { robotId: 'robot-b', displayName: '정찰 로봇 B' },
] as const;

function createSession(close: () => void): RobotVideoSession {
  return {
    close,
    mediaStream: { getTracks: () => [] } as unknown as MediaStream,
    subscribeStatus: (listener) => {
      listener('connected');
      return () => undefined;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('MultiRobotCameraGrid', () => {
  it('모든 로봇 카메라를 연결하고 전역 확대 후 복귀하며 제거된 로봇만 정리한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const closeBySource = new Map<string, ReturnType<typeof vi.fn>>();
    const port: RobotVideoPort = {
      listSources: (robotId) => Promise.resolve([
        {
          id: `${robotId}-front`,
          robotId,
          displayName: `${robotId === 'robot-a' ? 'A' : 'B'} 전방`,
        },
        {
          id: `${robotId}-rear`,
          robotId,
          displayName: `${robotId === 'robot-a' ? 'A' : 'B'} 후방`,
        },
      ]),
      openSource: (sourceId) => {
        const close = vi.fn();
        closeBySource.set(sourceId, close);
        return Promise.resolve(createSession(close));
      },
    };
    const user = userEvent.setup();
    const view = render(
      <RobotVideoContext.Provider value={port}>
        <MultiRobotCameraGrid targets={targets} />
      </RobotVideoContext.Provider>,
    );

    await waitFor(() => expect(closeBySource.size).toBe(4));
    await user.click(await screen.findByRole('button', {
      name: '정찰 로봇 A A 전방 확대 보기',
    }));

    const grid = screen.getByRole('region', { name: '다중 로봇 카메라' });
    expect(grid).toHaveAttribute('data-focused-robot', 'robot-a');
    expect(grid).toHaveAttribute('data-focused-source', 'robot-a-front');
    expect(screen.getByLabelText('정찰 로봇 B 카메라 패널'))
      .toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('정찰 로봇 A A 전방 영상 영역'))
      .toHaveAttribute('data-camera-focus-state', 'focused');

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(grid).not.toHaveAttribute('data-focused-source');
    });
    expect(screen.getByRole('button', {
      name: '정찰 로봇 A A 전방 확대 보기',
    }))
      .toHaveFocus();

    view.rerender(
      <RobotVideoContext.Provider value={port}>
        <MultiRobotCameraGrid targets={[targets[0]]} />
      </RobotVideoContext.Provider>,
    );

    await waitFor(() => {
      expect(closeBySource.get('robot-b-front')).toHaveBeenCalledOnce();
      expect(closeBySource.get('robot-b-rear')).toHaveBeenCalledOnce();
    });
    expect(closeBySource.get('robot-a-front')).not.toHaveBeenCalled();
    expect(closeBySource.get('robot-a-rear')).not.toHaveBeenCalled();
  });

  it('한 로봇의 연결 실패를 해당 패널에만 표시하고 다른 로봇 관제를 유지한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const port: RobotVideoPort = {
      listSources: (robotId) => Promise.resolve([{
        id: `${robotId}-front`,
        robotId,
        displayName: `${robotId === 'robot-a' ? 'A' : 'B'} 전방`,
      }]),
      openSource: (sourceId) => sourceId.startsWith('robot-a')
        ? Promise.reject(new Error('연결 실패'))
        : Promise.resolve(createSession(vi.fn())),
    };

    render(
      <RobotVideoContext.Provider value={port}>
        <MultiRobotCameraGrid targets={targets} />
      </RobotVideoContext.Provider>,
    );

    expect(await screen.findByText('카메라 영상을 불러오지 못했습니다.'))
      .toBeInTheDocument();
    expect(await screen.findByLabelText('정찰 로봇 B B 전방 영상'))
      .toBeInTheDocument();
    expect(screen.getByLabelText('정찰 로봇 A 카메라 패널'))
      .toHaveTextContent('연결 문제');
    expect(screen.getByLabelText('정찰 로봇 B 카메라 패널'))
      .not.toHaveTextContent('관제 중');
    expect(screen.queryByText('관제 중')).not.toBeInTheDocument();
  });

  it('6대의 카메라 30개를 모두 연결하고 화면 이탈 시 전부 정리한다', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const closeSessions: Array<ReturnType<typeof vi.fn>> = [];
    const sixTargets = Array.from({ length: 6 }, (_, index) => ({
      robotId: `robot-${String(index + 1)}`,
      displayName: `로봇 ${String(index + 1)}`,
    }));
    const openSource = vi.fn(() => {
      const close = vi.fn();
      closeSessions.push(close);
      return Promise.resolve(createSession(close));
    });
    const port: RobotVideoPort = {
      listSources: (robotId) => Promise.resolve(
        Array.from({ length: 5 }, (_, index) => ({
          id: `${robotId}-camera-${String(index + 1)}`,
          robotId,
          displayName: `카메라 ${String(index + 1)}`,
        })),
      ),
      openSource,
    };

    const view = render(
      <RobotVideoContext.Provider value={port}>
        <MultiRobotCameraGrid targets={sixTargets} />
      </RobotVideoContext.Provider>,
    );

    await waitFor(() => expect(openSource).toHaveBeenCalledTimes(30));
    expect(screen.getAllByLabelText(/로봇 \d 카메라 \d 영상$/u)).toHaveLength(30);
    expect(screen.getByRole('region', { name: '다중 로봇 카메라' }))
      .toHaveClass('lg:grid-rows-3');
    const robotPanels = screen.getAllByLabelText(/카메라 패널$/u);
    expect(robotPanels).toHaveLength(6);
    robotPanels.forEach((panel) => {
      expect(panel).toHaveAttribute('data-panel-surface', 'soft-group');
      expect(panel).toHaveAttribute('data-surface-layer', 'soft-group');
      expect(panel).toHaveClass('border-0');
      expect(panel).toHaveClass('shadow-none');
      expect(panel).not.toHaveClass('shadow-sm');
      expect(panel.querySelector('header')).toHaveClass('gap-2', 'px-2');
      expect(panel.querySelector(':scope > div')).toHaveClass('p-2');
    });
    robotPanels.forEach((panel) => {
      const heading = panel.querySelector(':scope > header h2');
      expect(heading).toHaveClass('text-foreground');
    });
    screen.getByRole('region', { name: '다중 로봇 카메라' })
      .querySelectorAll('[data-camera-tile="true"]')
      .forEach((tile) => {
      expect(tile).toHaveClass(
        'rounded-[var(--design-radius-soft-group)]',
      );
      expect(tile).not.toHaveClass('ring-1');
      });
    expect(screen.getAllByRole('region', { name: '카메라 영상' })[0])
      .toHaveClass('gap-2');

    view.unmount();
    closeSessions.forEach((close) => expect(close).toHaveBeenCalledOnce());
  });
});
