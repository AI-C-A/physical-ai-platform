import type { InterventionRequest } from './intervention';

export interface InterventionQueuePort {
  listActiveRequests(): Promise<readonly InterventionRequest[]>;
  getRequest(interventionId: string): Promise<InterventionRequest | null>;
  accept(interventionId: string): Promise<InterventionRequest>;
  startTeleoperation(interventionId: string): Promise<InterventionRequest>;
  resolve(interventionId: string): Promise<InterventionRequest>;
  transfer(interventionId: string): Promise<InterventionRequest>;
  emergencyStop(interventionId: string): Promise<InterventionRequest>;
  subscribe(listener: () => void): () => void;
}
