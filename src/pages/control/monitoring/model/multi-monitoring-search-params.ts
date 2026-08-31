export const multiMonitoringModeSearchParameter = 'mode';
export const multiMonitoringModeValue = 'multi';
export const multiMonitoringRobotIdSearchParameter = 'robotId';
export const minimumMultiMonitoringRobotCount = 2;
export const maximumMultiMonitoringRobotCount = 6;

export function normalizeMultiMonitoringRobotIds(
  robotIds: readonly string[],
): readonly string[] {
  const uniqueRobotIds: string[] = [];
  const seenRobotIds = new Set<string>();

  for (const robotId of robotIds) {
    const normalizedRobotId = robotId.trim();
    if (
      normalizedRobotId.length === 0
      || seenRobotIds.has(normalizedRobotId)
    ) continue;
    seenRobotIds.add(normalizedRobotId);
    uniqueRobotIds.push(normalizedRobotId);
    if (uniqueRobotIds.length === maximumMultiMonitoringRobotCount) break;
  }

  return uniqueRobotIds;
}

export function readMultiMonitoringRobotIds(
  searchParams: URLSearchParams,
): readonly string[] {
  return normalizeMultiMonitoringRobotIds(
    searchParams.getAll(multiMonitoringRobotIdSearchParameter),
  );
}

export function writeMultiMonitoringRobotIds(
  searchParams: URLSearchParams,
  robotIds: readonly string[],
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);
  nextSearchParams.delete(multiMonitoringRobotIdSearchParameter);
  normalizeMultiMonitoringRobotIds(robotIds).forEach((robotId) => {
    nextSearchParams.append(multiMonitoringRobotIdSearchParameter, robotId);
  });
  return nextSearchParams;
}

export function setMultiMonitoringSelectionMode(
  searchParams: URLSearchParams,
  enabled: boolean,
): URLSearchParams {
  const nextSearchParams = new URLSearchParams(searchParams);
  if (enabled) {
    nextSearchParams.set(
      multiMonitoringModeSearchParameter,
      multiMonitoringModeValue,
    );
  } else {
    nextSearchParams.delete(multiMonitoringModeSearchParameter);
    nextSearchParams.delete(multiMonitoringRobotIdSearchParameter);
  }
  return nextSearchParams;
}

export function isMultiMonitoringSelectionMode(
  searchParams: URLSearchParams,
): boolean {
  return searchParams.get(multiMonitoringModeSearchParameter)
    === multiMonitoringModeValue;
}
