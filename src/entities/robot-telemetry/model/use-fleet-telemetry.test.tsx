import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryTelemetryAdapter } from '../api/in-memory-telemetry';
import { RobotTelemetryContext } from './robot-telemetry-context';
import { useFleetTelemetry } from './use-fleet-telemetry';

const developmentRobotCounts = [1, 8, 32, 64, 128] as const;

function FleetTelemetryProbe({ robotIds }: { readonly robotIds: readonly string[] }) {
  const snapshot = useFleetTelemetry(robotIds);
  const readyRobotCount = Object.values(snapshot.robots).filter(
    (robot) => robot.pose !== null && robot.battery !== null,
  ).length;

  return (
    <div>
      <output aria-label="Fleet 연결 상태">{snapshot.connectionState}</output>
      <output aria-label="수신 완료 Robot 수">{readyRobotCount}</output>
    </div>
  );
}

describe('useFleetTelemetry 개발 부하 회귀', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(developmentRobotCounts)(
    '%i대 × 2 channel에서도 snapshot당 React commit을 한 번만 만든다',
    async (robotCount) => {
      const robotIds = Array.from(
        { length: robotCount },
        (_, index) => `robot-${index + 1}`,
      );
      const adapter = new InMemoryTelemetryAdapter(robotIds);
      let commitCount = 0;
      const onRender: ProfilerOnRenderCallback = () => {
        commitCount += 1;
      };
      const view = render(
        <RobotTelemetryContext.Provider value={adapter}>
          <Profiler id="fleet-telemetry" onRender={onRender}>
            <FleetTelemetryProbe robotIds={robotIds} />
          </Profiler>
        </RobotTelemetryContext.Provider>,
      );

      for (let step = 0; step < 6; step += 1) {
        await act(() => vi.advanceTimersByTimeAsync(200));
      }

      expect(screen.getByRole('status', { name: '수신 완료 Robot 수' })).toHaveTextContent(
        String(robotCount),
      );
      expect(commitCount).toBe(7);

      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('구분 문자가 포함된 Robot ID를 원본 식별자 그대로 구독한다', async () => {
    const robotIds = ['robot|alpha'];
    const adapter = new InMemoryTelemetryAdapter(robotIds);
    const view = render(
      <RobotTelemetryContext.Provider value={adapter}>
        <FleetTelemetryProbe robotIds={robotIds} />
      </RobotTelemetryContext.Provider>,
    );

    await act(() => vi.advanceTimersByTimeAsync(1_200));

    expect(
      screen.getByRole('status', { name: '수신 완료 Robot 수' }),
    ).toHaveTextContent('1');
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('동일한 roster의 새 배열로 다시 그려도 연결을 재시작하지 않는다', async () => {
    const robotIds = ['robot-2', 'robot-1'];
    const adapter = new InMemoryTelemetryAdapter(robotIds);
    const connect = vi.spyOn(adapter, 'connect');
    const disconnect = vi.spyOn(adapter, 'disconnect');
    const renderProbe = (ids: readonly string[]) => (
      <RobotTelemetryContext.Provider value={adapter}>
        <FleetTelemetryProbe robotIds={ids} />
      </RobotTelemetryContext.Provider>
    );
    const view = render(renderProbe(robotIds));
    await act(() => vi.advanceTimersByTimeAsync(200));

    view.rerender(renderProbe(['robot-2', 'robot-1']));
    await act(() => vi.advanceTimersByTimeAsync(200));

    expect(connect).toHaveBeenCalledOnce();
    expect(disconnect).not.toHaveBeenCalled();
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('roster 변경 첫 render부터 이전 연결 상태와 데이터를 노출하지 않는다', async () => {
    const adapter = new InMemoryTelemetryAdapter(['robot-1', 'robot-2']);
    const renderProbe = (ids: readonly string[]) => (
      <RobotTelemetryContext.Provider value={adapter}>
        <FleetTelemetryProbe robotIds={ids} />
      </RobotTelemetryContext.Provider>
    );
    const view = render(renderProbe(['robot-1']));
    await act(() => vi.advanceTimersByTimeAsync(1_200));
    expect(screen.getByRole('status', { name: 'Fleet 연결 상태' })).toHaveTextContent(
      'connected',
    );
    expect(screen.getByRole('status', { name: '수신 완료 Robot 수' })).toHaveTextContent(
      '1',
    );

    view.rerender(renderProbe(['robot-2']));

    expect(screen.getByRole('status', { name: 'Fleet 연결 상태' })).toHaveTextContent(
      'disconnected',
    );
    expect(screen.getByRole('status', { name: '수신 완료 Robot 수' })).toHaveTextContent(
      '0',
    );

    await act(() => vi.advanceTimersByTimeAsync(1_200));
    expect(screen.getByRole('status', { name: 'Fleet 연결 상태' })).toHaveTextContent(
      'connected',
    );
    expect(screen.getByRole('status', { name: '수신 완료 Robot 수' })).toHaveTextContent(
      '1',
    );
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
