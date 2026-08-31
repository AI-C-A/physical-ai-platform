import type { InterventionQueuePort } from '../model/intervention-queue';

const unavailableMessage = '이 실행 환경에서는 지원하지 않는 작업입니다.';
const noOpUnsubscribe = (): void => undefined;
const rejectUnavailable = () => Promise.reject(new Error(unavailableMessage));

export function createUnavailableInterventionQueue(): InterventionQueuePort {
  return {
    listActiveRequests: () => Promise.resolve([]),
    getRequest: () => Promise.resolve(null),
    accept: rejectUnavailable,
    startTeleoperation: rejectUnavailable,
    resolve: rejectUnavailable,
    transfer: rejectUnavailable,
    emergencyStop: rejectUnavailable,
    subscribe: () => noOpUnsubscribe,
  };
}
