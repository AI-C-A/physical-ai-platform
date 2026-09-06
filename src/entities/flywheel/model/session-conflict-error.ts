export class SessionConflictError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super('다른 세션에서 수집 장치를 사용 중입니다.');
    this.name = 'SessionConflictError';
    this.sessionId = sessionId;
  }
}
