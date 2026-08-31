import { createStore, type StoreApi } from 'zustand/vanilla';

import type {
  InterventionRequest,
  InterventionStatus,
} from '../model/intervention';
import type { InterventionQueuePort } from '../model/intervention-queue';

interface InterventionQueueState {
  readonly requests: readonly InterventionRequest[];
}

const terminalStatuses = new Set<InterventionStatus>(['resolved', 'transferred']);
const allowedTransitions: Readonly<Record<InterventionStatus, readonly InterventionStatus[]>> = {
  waiting: ['accepted'],
  accepted: ['teleop', 'resolved', 'transferred', 'emergency-stop'],
  teleop: ['resolved', 'transferred', 'emergency-stop'],
  'emergency-stop': ['resolved', 'transferred'],
  resolved: [],
  transferred: [],
};

function compareActiveRequests(
  left: InterventionRequest,
  right: InterventionRequest,
): number {
  const getAttentionRank = (request: InterventionRequest): number => {
    if (request.status === 'waiting' && request.priority === 'critical') return 0;
    if (request.status !== 'waiting') return 1;
    return 2;
  };
  const attentionOrder = getAttentionRank(left) - getAttentionRank(right);
  if (attentionOrder !== 0) return attentionOrder;
  const leftPriority = left.priority === 'critical' ? 0 : 1;
  const rightPriority = right.priority === 'critical' ? 0 : 1;
  if (leftPriority !== rightPriority) return leftPriority - rightPriority;
  const ageOrder = left.requestedAtMs - right.requestedAtMs;
  return ageOrder === 0 ? left.id.localeCompare(right.id) : ageOrder;
}

export class InMemoryInterventionQueue implements InterventionQueuePort {
  readonly #store: StoreApi<InterventionQueueState>;

  constructor(initialRequests: readonly InterventionRequest[]) {
    this.#store = createStore(() => ({ requests: initialRequests }));
  }

  listActiveRequests(): Promise<readonly InterventionRequest[]> {
    return Promise.resolve(
      this.#requests()
        .filter((request) => !terminalStatuses.has(request.status))
        .sort(compareActiveRequests),
    );
  }

  getRequest(interventionId: string): Promise<InterventionRequest | null> {
    return Promise.resolve(this.#findRequest(interventionId));
  }

  accept(interventionId: string): Promise<InterventionRequest> {
    return this.#transition(interventionId, 'accepted');
  }

  startTeleoperation(interventionId: string): Promise<InterventionRequest> {
    return this.#transition(interventionId, 'teleop');
  }

  resolve(interventionId: string): Promise<InterventionRequest> {
    return this.#transition(interventionId, 'resolved');
  }

  transfer(interventionId: string): Promise<InterventionRequest> {
    return this.#transition(interventionId, 'transferred');
  }

  emergencyStop(interventionId: string): Promise<InterventionRequest> {
    return this.#transition(interventionId, 'emergency-stop');
  }

  subscribe(listener: () => void): () => void {
    return this.#store.subscribe(listener);
  }

  #requests(): InterventionRequest[] {
    return [...this.#store.getState().requests];
  }

  #findRequest(interventionId: string): InterventionRequest | null {
    return this.#store.getState().requests.find(
      (request) => request.id === interventionId,
    ) ?? null;
  }

  async #transition(
    interventionId: string,
    nextStatus: InterventionStatus,
  ): Promise<InterventionRequest> {
    const current = this.#findRequest(interventionId);
    if (current === null) {
      throw new Error(`개입 요청을 찾을 수 없습니다: ${interventionId}`);
    }
    if (!allowedTransitions[current.status].includes(nextStatus)) {
      throw new Error(
        `허용되지 않은 개입 상태 전이입니다: ${current.status} → ${nextStatus}`,
      );
    }
    const updated = { ...current, status: nextStatus };
    this.#store.setState((state) => ({
      requests: state.requests.map((request) =>
        request.id === interventionId ? updated : request),
    }));
    return Promise.resolve(updated);
  }
}
