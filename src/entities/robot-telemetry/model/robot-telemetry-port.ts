import type {
  RobotTelemetryEvent,
  TelemetryChannel,
  TelemetryConnectionState,
} from './robot-telemetry';
import type { ExecutionSource } from '@/shared/domain';

export interface TelemetryChannelDescriptor {
  readonly channel: TelemetryChannel;
  readonly displayName: string;
  readonly expectedRateHz: number | null;
  readonly staleAfterMs: number | null;
}

export interface TelemetrySubscription {
  readonly robotIds: readonly string[];
  readonly channels: readonly TelemetryChannel[];
  readonly maxDeliveryHz?: number;
}

/** 하나의 연결에서 여러 Robot과 channel을 구독하는 교체 가능한 Telemetry Port다. */
export interface RobotTelemetryPort {
  getChannelDescriptors(robotId: string): Promise<readonly TelemetryChannelDescriptor[]>;
  getExecutionSource(): Promise<ExecutionSource>;
  connect(): Promise<void>;
  subscribe(
    subscription: TelemetrySubscription,
    listener: (event: RobotTelemetryEvent) => void,
  ): () => void;
  subscribeConnection(
    listener: (state: TelemetryConnectionState) => void,
  ): () => void;
  disconnect(): void;
}
