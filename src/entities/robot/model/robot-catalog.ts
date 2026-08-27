import type { PageRequest, PageResult } from '@/shared/lib/query';

import type { RobotDescriptor } from './robot';

export interface RobotQuery extends PageRequest {
  readonly search: string;
  readonly sort: 'name-asc' | 'name-desc';
}

export interface RobotCatalogPort {
  listRobots(): Promise<readonly RobotDescriptor[]>;
  queryRobots(query: RobotQuery): Promise<PageResult<RobotDescriptor>>;
  getRobot(robotId: string): Promise<RobotDescriptor | null>;
}
