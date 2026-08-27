import type { SensorDeviceDescriptor } from '../model/sensor-device';
import { createInMemorySensorDeviceCatalog } from './in-memory-sensor-device-catalog';

const sensorDevices: readonly SensorDeviceDescriptor[] = [
  {
    id: 'sensor-rig-001',
    displayName: '다중 센서 Rig 01',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: 'platform-1',
    capabilities: ['rgb', 'depth', 'lidar', 'imu'],
    integrationProfileId: 'multisensor-rig-v1',
  },
  {
    id: 'sensor-rig-002',
    displayName: 'Vision Rig 02',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: 'platform-1',
    capabilities: ['rgb', 'depth', 'imu'],
    integrationProfileId: 'vision-rig-v1',
  },
  {
    id: 'sensor-rig-003',
    displayName: 'Navigation Rig 03',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: 'platform-1',
    capabilities: ['lidar', 'imu'],
    integrationProfileId: 'navigation-rig-v1',
  },
  {
    id: 'sensor-rig-004',
    displayName: 'Camera Device 04',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: 'platform-1',
    capabilities: ['rgb'],
    integrationProfileId: 'camera-device-v1',
  },
];

export function createInMemorySensorDeviceCatalogWithData() {
  return createInMemorySensorDeviceCatalog(sensorDevices);
}
