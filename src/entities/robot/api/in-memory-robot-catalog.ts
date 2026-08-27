import { createPageResult } from '@/shared/lib/query';

import type { RobotCatalogPort } from '../model/robot-catalog';
import type { RobotDescriptor } from '../model/robot';

export function createInMemoryRobotCatalog(
  robots: readonly RobotDescriptor[],
): RobotCatalogPort {
  return {
    listRobots: () => Promise.resolve(robots),
    queryRobots: (query) => {
      const search = query.search.trim().toLocaleLowerCase();
      const filtered = robots.filter((robot) => {
        const matchesSearch =
          robot.displayName.toLocaleLowerCase().includes(search)
          || robot.id.toLocaleLowerCase().includes(search);
        return matchesSearch;
      });
      const sorted = [...filtered].sort((left, right) => {
        const primary = query.sort === 'name-desc'
          ? right.displayName.localeCompare(left.displayName, 'ko')
          : left.displayName.localeCompare(right.displayName, 'ko');
        return primary === 0 ? left.id.localeCompare(right.id) : primary;
      });
      return Promise.resolve(createPageResult(sorted, query));
    },
    getRobot: (robotId) =>
      Promise.resolve(robots.find((robot) => robot.id === robotId) ?? null),
  };
}
