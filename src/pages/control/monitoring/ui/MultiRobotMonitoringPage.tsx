import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import {
  useRobotCatalog,
  useRobotOperationalStatuses,
  type RobotDescriptor,
} from '@/entities/robot';
import {
  MultiRobotCameraGrid,
  type MultiRobotCameraTarget,
} from '@/entities/robot-video';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Icon } from '@/shared/ui/icon';
import { SearchField } from '@/shared/ui/search-field';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import { Sheet } from '@/shared/ui/sheet';

import {
  maximumMultiMonitoringRobotCount,
  minimumMultiMonitoringRobotCount,
  multiMonitoringModeSearchParameter,
  multiMonitoringModeValue,
  multiMonitoringRobotIdSearchParameter,
  normalizeMultiMonitoringRobotIds,
  readMultiMonitoringRobotIds,
  setMultiMonitoringSelectionMode,
  writeMultiMonitoringRobotIds,
} from '../model/multi-monitoring-search-params';
import { filterMonitoringRobots } from '../model/monitoring-robot-health';
import {
  monitoringViewportContentClassName,
  monitoringViewportHeaderClassName,
} from './monitoring-viewport-layout';
import { RobotMultiSelectionList } from './RobotMultiSelectionList';

function isSameSequence(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

interface MultiMonitoringLocationState {
  readonly selectionNotice?: string;
}

function MultiMonitoringExitLink({
  returnPath,
}: {
  readonly returnPath: string;
}) {
  return (
    <Link
      aria-label="다중 영상 관제 나가기"
      className={getButtonClassName(
        'ghost',
        'shrink-0 text-negative hover:bg-status-negative-background hover:text-negative active:bg-status-negative-background',
      )}
      to={returnPath}
    >
      <Icon name="close" size="md" />
      <span>나가기</span>
    </Link>
  );
}

function ConfigurationSheet({
  onToggleRobot,
  operationalStatuses,
  robots,
  selectedRobotIds,
}: {
  readonly onToggleRobot: (robotId: string) => void;
  readonly operationalStatuses: ReturnType<typeof useRobotOperationalStatuses>;
  readonly robots: readonly RobotDescriptor[];
  readonly selectedRobotIds: readonly string[];
}) {
  const [search, setSearch] = useState('');
  const staleRobotIds = useMemo(() => new Set(Object.keys(operationalStatuses.streamIssuesByRobotId)), [operationalStatuses.streamIssuesByRobotId]);
  const filteredRobots = useMemo(() => filterMonitoringRobots({
    filter: 'all',
    robots,
    search,
    sort: 'name',
    staleRobotIds: new Set<string>(),
    statuses: {},
  }), [robots, search]);

  return (
    <Sheet
      title="관제 구성 변경"
      trigger={(
        <Button className="text-muted hover:text-foreground" variant="ghost">
          <Icon name="robot" />
          구성 변경
        </Button>
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <SearchField
          label="로봇 검색"
          onValueChange={(value) => setSearch(value)}
          placeholder="이름, ID 또는 기체 번호"
          showLabel={false}
          value={search}
        />
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
          <span>최소 2대, 최대 6대 선택</span>
          <span aria-live="polite" className="font-semibold tabular-nums">
            {selectedRobotIds.length}/{maximumMultiMonitoringRobotCount}
          </span>
        </div>
        {filteredRobots.length === 0 ? (
          <p className="mt-4 text-sm text-muted" role="status">
            검색 결과가 없습니다.
          </p>
        ) : (
          <RobotMultiSelectionList
            maximumSelection={maximumMultiMonitoringRobotCount}
            minimumSelection={
              selectedRobotIds.length >= minimumMultiMonitoringRobotCount
                ? minimumMultiMonitoringRobotCount
                : 0
            }
            onToggleRobot={onToggleRobot}
            operationalStatuses={
              operationalStatuses.status === 'ready'
                ? operationalStatuses.data
                : {}
            }
            robots={filteredRobots}
            selectedRobotIds={selectedRobotIds}
            staleRobotIds={staleRobotIds}
          />
        )}
      </div>
    </Sheet>
  );
}

export function MultiRobotMonitoringPage() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const robots = useRobotCatalog();
  const allRobotIds = useMemo(
    () => robots.robots.map((robot) => robot.id),
    [robots.robots],
  );
  const operationalStatuses = useRobotOperationalStatuses(allRobotIds);
  const rawRobotIds = useMemo(
    () => searchParams.getAll(multiMonitoringRobotIdSearchParameter),
    [searchParams],
  );
  const selectedRobotIds = useMemo(
    () => readMultiMonitoringRobotIds(searchParams),
    [searchParams],
  );

  const validRobots = useMemo(() => {
    if (robots.status !== 'ready') return [];
    const robotById = new Map(robots.robots.map((robot) => [robot.id, robot]));
    return selectedRobotIds.flatMap((robotId) => {
      const robot = robotById.get(robotId);
      return robot === undefined ? [] : [robot];
    });
  }, [robots.robots, robots.status, selectedRobotIds]);
  const validRobotIds = useMemo(
    () => validRobots.map((robot) => robot.id),
    [validRobots],
  );
  const invalidRobotIds = useMemo(
    () => robots.status === 'ready'
      ? selectedRobotIds.filter((robotId) => !validRobotIds.includes(robotId))
      : [],
    [robots.status, selectedRobotIds, validRobotIds],
  );
  const normalizedRobotIds = normalizeMultiMonitoringRobotIds(rawRobotIds);
  const detectedSelectionNotice = invalidRobotIds.length > 0
    ? `찾을 수 없는 로봇 ${invalidRobotIds.join(', ')}을(를) 선택에서 제외했습니다.`
    : !isSameSequence(rawRobotIds, normalizedRobotIds)
      ? '중복되었거나 최대 수를 넘은 로봇 선택을 정리했습니다.'
      : null;
  const locationState = location.state as MultiMonitoringLocationState | null;
  const selectionNotice = detectedSelectionNotice
    ?? locationState?.selectionNotice
    ?? null;

  useEffect(() => {
    const isModeCanonical = searchParams.get(multiMonitoringModeSearchParameter)
      === multiMonitoringModeValue;
    if (
      isSameSequence(rawRobotIds, normalizedRobotIds)
      && isModeCanonical
    ) return;

    const nextSearchParams = setMultiMonitoringSelectionMode(
      writeMultiMonitoringRobotIds(searchParams, normalizedRobotIds),
      true,
    );
    setSearchParams(nextSearchParams, {
      replace: true,
      state: detectedSelectionNotice === null
        ? locationState
        : { selectionNotice: detectedSelectionNotice },
    });
  }, [
    detectedSelectionNotice,
    locationState,
    normalizedRobotIds,
    rawRobotIds,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (robots.status !== 'ready') return;
    if (invalidRobotIds.length === 0) return;
    setSearchParams((currentSearchParams) =>
      writeMultiMonitoringRobotIds(currentSearchParams, validRobotIds), {
      replace: true,
      state: {
        selectionNotice:
          `찾을 수 없는 로봇 ${invalidRobotIds.join(', ')}을(를) 선택에서 제외했습니다.`,
      },
    });
  }, [
    robots.status,
    invalidRobotIds,
    setSearchParams,
    validRobotIds,
  ]);

  const updateSelectedRobotIds = (nextRobotIds: readonly string[]): void => {
    setSearchParams((currentSearchParams) =>
      writeMultiMonitoringRobotIds(currentSearchParams, nextRobotIds), {
      replace: true,
      state: null,
    });
  };
  const toggleRobot = (robotId: string): void => {
    const isSelected = validRobotIds.includes(robotId);
    if (
      !isSelected
      && validRobotIds.length >= maximumMultiMonitoringRobotCount
    ) return;
    if (
      isSelected
      && validRobotIds.length === minimumMultiMonitoringRobotCount
    ) return;

    updateSelectedRobotIds(
      isSelected
        ? validRobotIds.filter((selectedId) => selectedId !== robotId)
        : [...validRobotIds, robotId],
    );
  };
  const returnSearchParams = setMultiMonitoringSelectionMode(
    writeMultiMonitoringRobotIds(searchParams, validRobotIds),
    true,
  );
  const returnPath = `/control/monitoring?${returnSearchParams.toString()}`;
  const targets: readonly MultiRobotCameraTarget[] = validRobots.map((robot) => ({
    displayName: robot.displayName,
    robotId: robot.id,
  }));

  return (
    <ColorSchemeArea
      className="flex h-dvh min-h-0 flex-col overflow-hidden"
      layer="raised"
      scheme="dark"
    >
      <header className={monitoringViewportHeaderClassName}>
        <h1 className="truncate text-base font-bold text-foreground sm:text-lg">
          다중 관제
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {robots.status === 'ready' ? (
            <ConfigurationSheet
              onToggleRobot={toggleRobot}
              operationalStatuses={operationalStatuses}
              robots={robots.robots}
              selectedRobotIds={validRobotIds}
            />
          ) : null}
          <MultiMonitoringExitLink returnPath={returnPath} />
        </div>
      </header>

      {selectionNotice === null ? null : (
        <p
          aria-label="선택 정리 안내"
          className="mx-2 mb-2 mt-2 shrink-0 rounded-[var(--design-radius-control)] bg-status-warning-background px-3 py-2 text-xs text-status-warning-foreground sm:mx-3"
          role="status"
        >
          {selectionNotice}
        </p>
      )}

      <div className={monitoringViewportContentClassName}>
        {robots.status === 'loading' ? (
          <QueryFeedback kind="loading" />
        ) : robots.status === 'error' ? (
          <QueryFeedback
            kind="error"
            message={robots.message}
            onRetry={robots.retry}
          />
        ) : targets.length < minimumMultiMonitoringRobotCount ? (
          <div className="grid h-full place-content-center">
            <QueryFeedback
              kind="empty"
              message="다중 관제를 시작하려면 로봇을 2대 이상 선택해 주세요."
            />
          </div>
        ) : (
          <MultiRobotCameraGrid targets={targets} />
        )}
      </div>
    </ColorSchemeArea>
  );
}
