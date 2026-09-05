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
  {
    id: 'quest2-001',
    displayName: 'Quest Hand Collector 01',
    modelName: 'Quest 2',
    hardwareVersion: null,
    softwareVersion: 'webxr-hand-input-v1',
    capabilities: ['left-hand-pose', 'right-hand-pose'],
    integrationProfileId: 'quest-webxr-hand-pose-v1',
    deviceRole: 'sensor',
  },
  {
    id: 'rbp-headcam-001',
    displayName: 'RBP Head Camera 01',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: null,
    capabilities: ['rgb'],
    integrationProfileId: 'rbp-head-rgb-pending-v1',
    deviceRole: 'sensor',
  },
  {
    id: 'exoskeleton-001',
    displayName: 'Exoskeleton 01',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: null,
    capabilities: ['joint-state', 'actuation-control'],
    integrationProfileId: 'exoskeleton-state-v1',
    deviceRole: 'wearable-exoskeleton',
  },
  {
    id: 'external-camera-001',
    displayName: 'External Scene Camera 01',
    modelName: null,
    hardwareVersion: null,
    softwareVersion: null,
    capabilities: ['rgb'],
    integrationProfileId: 'external-rgb-pending-v1',
    deviceRole: 'sensor',
  },
];

export function createInMemorySensorDeviceCatalogWithData() {
  return createInMemorySensorDeviceCatalog(sensorDevices);
}
