import { useCallback, useMemo, useState } from 'react';

import { Surface } from '@/shared/ui/surface';

import type { VideoConnectionStatus } from '../model/robot-video';
import { RobotCameraGrid } from './RobotCameraGrid';

export interface MultiRobotCameraTarget {
  readonly displayName: string;
  readonly robotId: string;
}

interface FocusedCamera {
  readonly robotId: string;
  readonly sourceId: string;
}

function getPanelStatus(
  statuses: Readonly<Record<string, VideoConnectionStatus>>,
): {
  readonly indicatorClassName: string;
  readonly label: string;
  readonly toneClassName: string;
} | null {
  const values = Object.values(statuses);
  if (values.some((status) => status === 'error' || status === 'disconnected')) {
    return {
      indicatorClassName: 'bg-negative',
      label: '연결 문제',
      toneClassName: 'text-negative',
    };
  }
  if (values.length > 0 && values.every((status) => status === 'connected')) {
    return null;
  }
  return {
    indicatorClassName: 'bg-warning',
    label: '연결 중',
    toneClassName: 'text-warning',
  };
}

function MultiRobotCameraPanel({
  focusedCamera,
  isLastOddPanel,
  onFocusChange,
  target,
}: {
  readonly focusedCamera: FocusedCamera | null;
  readonly isLastOddPanel: boolean;
  readonly onFocusChange: (focusedCamera: FocusedCamera | null) => void;
  readonly target: MultiRobotCameraTarget;
}) {
  const [statuses, setStatuses] = useState<
    Readonly<Record<string, VideoConnectionStatus>>
  >({});
  const handleStatusChange = useCallback((
    sourceId: string,
    status: VideoConnectionStatus | null,
  ) => {
    setStatuses((currentStatuses) => {
      if (status === null) {
        if (!(sourceId in currentStatuses)) return currentStatuses;
        const nextStatuses = { ...currentStatuses };
        delete nextStatuses[sourceId];
        return nextStatuses;
      }
      if (currentStatuses[sourceId] === status) return currentStatuses;
      return { ...currentStatuses, [sourceId]: status };
    });
  }, []);
  const panelStatus = useMemo(() => getPanelStatus(statuses), [statuses]);
  const isDimmed = focusedCamera !== null
    && focusedCamera.robotId !== target.robotId;
  const focusedSourceId = focusedCamera?.robotId === target.robotId
    ? focusedCamera.sourceId
    : null;

  return (
    <Surface
      aria-hidden={isDimmed || undefined}
      aria-label={`${target.displayName} 카메라 패널`}
      className={[
        'grid min-h-[16rem] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0 lg:min-h-0',
        isLastOddPanel
          ? 'lg:col-span-2 lg:w-[calc(50%-0.25rem)] lg:justify-self-center'
          : undefined,
      ].filter(Boolean).join(' ')}
      data-panel-surface="soft-group"
      inert={isDimmed || undefined}
      layer="soft-group"
    >
      <header className="flex min-h-9 items-center justify-between gap-2 px-2">
        <h2 className="truncate text-sm font-bold text-foreground">
          {target.displayName}
        </h2>
        {panelStatus === null ? null : (
          <span
            aria-live="polite"
            className={`flex shrink-0 items-center gap-1.5 text-[11px] font-medium ${panelStatus.toneClassName}`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${panelStatus.indicatorClassName}`}
            />
            {panelStatus.label}
          </span>
        )}
      </header>
      <div className="min-h-0 overflow-hidden p-2">
        <RobotCameraGrid
          focusedSourceId={focusedSourceId}
          onFocusedSourceChange={(sourceId) => {
            onFocusChange(sourceId === null
              ? null
              : { robotId: target.robotId, sourceId });
          }}
          onSourceStatusChange={handleStatusChange}
          presentation="multi-monitoring"
          robotId={target.robotId}
          sourceLabelPrefix={target.displayName}
        />
      </div>
    </Surface>
  );
}

export function MultiRobotCameraGrid({
  targets,
}: {
  readonly targets: readonly MultiRobotCameraTarget[];
}) {
  const [focusedCamera, setFocusedCamera] = useState<FocusedCamera | null>(null);
  const targetRobotIds = useMemo(
    () => new Set(targets.map((target) => target.robotId)),
    [targets],
  );

  const visibleFocusedCamera = focusedCamera !== null
    && targetRobotIds.has(focusedCamera.robotId)
    ? focusedCamera
    : null;

  const desktopRowsClassName = targets.length <= 2
    ? 'lg:grid-rows-1'
    : targets.length <= 4
      ? 'lg:grid-rows-2'
      : 'lg:grid-rows-3';

  return (
    <section
      aria-label="다중 로봇 카메라"
      className={`grid h-full min-h-0 grid-cols-1 content-start gap-2 overflow-y-auto lg:grid-cols-2 lg:content-stretch lg:overflow-hidden ${desktopRowsClassName}`}
      data-focused-robot={visibleFocusedCamera?.robotId ?? undefined}
      data-focused-source={visibleFocusedCamera?.sourceId ?? undefined}
    >
      {targets.map((target, index) => (
        <MultiRobotCameraPanel
          focusedCamera={visibleFocusedCamera}
          isLastOddPanel={
            targets.length % 2 === 1
            && index === targets.length - 1
          }
          key={target.robotId}
          onFocusChange={setFocusedCamera}
          target={target}
        />
      ))}
    </section>
  );
}
