export type SensorCapability = 'rgb' | 'depth' | 'lidar' | 'imu';

/** Robot과 독립적으로 식별·교체되는 Sensor Device/Rig 모델이다. */
export interface SensorDeviceDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly modelName: string | null;
  readonly hardwareVersion: string | null;
  readonly softwareVersion: string | null;
  readonly capabilities: readonly SensorCapability[];
  readonly integrationProfileId: string;
}
