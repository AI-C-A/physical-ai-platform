import type { SensorDeviceCatalogPort } from '../model/sensor-device-catalog';
import type { SensorDeviceDescriptor } from '../model/sensor-device';

export function createInMemorySensorDeviceCatalog(
  sensorDevices: readonly SensorDeviceDescriptor[],
): SensorDeviceCatalogPort {
  return {
    listSensorDevices: () => Promise.resolve(sensorDevices),
    getSensorDevice: (sensorDeviceId) =>
      Promise.resolve(
        sensorDevices.find((device) => device.id === sensorDeviceId) ?? null,
      ),
  };
}
