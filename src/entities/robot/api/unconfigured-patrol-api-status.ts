import type { PatrolApiStatusPort } from '../model/patrol-api-status';

/** 외부 Patrol endpoint가 없는 실행 환경을 성공으로 가장하지 않는다. */
export function createUnconfiguredPatrolApiStatus(): PatrolApiStatusPort {
  return {
    endpoint: null,
    check: () => Promise.reject(
      new Error('Patrol API endpoint가 설정되지 않았습니다.'),
    ),
  };
}
