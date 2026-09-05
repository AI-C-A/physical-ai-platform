import type { PageRequest, PageResult } from '@/shared/lib/query';

import type { RobotDescriptor } from './robot';

/** 연동 서버의 원문 대신 사용자가 조치할 수 있는 권한·인증 실패만 공개한다. */
export class RobotCatalogAccessError extends Error {
  constructor(reason: 'access-denied' | 'authentication', options?: ErrorOptions) {
    super(reason === 'access-denied'
      ? '등록된 로봇을 조회할 권한이 없습니다. 관리자에게 로봇 접근 권한을 확인해 주세요.'
      : '로봇 연동 인증에 실패했습니다. 관리자에게 연동 인증 설정을 확인해 주세요.', options);
    this.name = 'RobotCatalogAccessError';
  }
}

export interface RobotQuery extends PageRequest {
  readonly search: string;
  readonly sort: 'name-asc' | 'name-desc';
}

export interface RobotCatalogPort {
  listRobots(): Promise<readonly RobotDescriptor[]>;
  queryRobots(query: RobotQuery): Promise<PageResult<RobotDescriptor>>;
  getRobot(robotId: string): Promise<RobotDescriptor | null>;
}
