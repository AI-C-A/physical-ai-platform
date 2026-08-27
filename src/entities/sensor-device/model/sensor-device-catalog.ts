import type { SensorDeviceDescriptor } from './sensor-device';

export interface SensorDeviceCatalogPort {
  listSensorDevices(): Promise<readonly SensorDeviceDescriptor[]>;
  getSensorDevice(
    sensorDeviceId: string,
  ): Promise<SensorDeviceDescriptor | null>;
}
