type PatrolApiStatusFailureReason = 'timeout' | 'unavailable';

/** 제품 화면이 통신 계층의 원문 오류 대신 안정된 실패 원인만 소비하게 한다. */
export class PatrolApiStatusCheckError extends Error {
  readonly reason: PatrolApiStatusFailureReason;

  constructor(reason: PatrolApiStatusFailureReason, options?: ErrorOptions) {
    super(
      reason === 'timeout'
        ? 'Patrol API 상태 확인 시간이 초과되었습니다.'
        : 'Patrol API 상태를 확인하지 못했습니다.',
      options,
    );
    this.name = 'PatrolApiStatusCheckError';
    this.reason = reason;
  }
}

export interface PatrolApiStatusPort {
  readonly endpoint: string | null;
  check(signal?: AbortSignal): Promise<void>;
}
