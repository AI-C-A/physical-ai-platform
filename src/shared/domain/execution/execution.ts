export type ExecutionEnvironment = 'physical' | 'simulation';
export type DeliveryMode = 'live' | 'replay';
export type ControlMode = 'autonomous' | 'teleop' | 'manual' | 'mixed';
export type DataOrigin = 'captured' | 'synthetic' | 'derived';

export interface ExecutionSource {
  readonly environment: ExecutionEnvironment;
  readonly deliveryMode: DeliveryMode;
}

export interface ExecutionProvenance extends ExecutionSource {
  readonly controlMode: ControlMode;
  readonly dataOrigin: DataOrigin;
}
