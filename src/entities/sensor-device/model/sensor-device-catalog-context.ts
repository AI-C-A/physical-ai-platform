import { createContext, useContext } from 'react';

import type { SensorDeviceCatalogPort } from './sensor-device-catalog';

export const SensorDeviceCatalogContext =
  createContext<SensorDeviceCatalogPort | null>(null);

export function useSensorDeviceCatalogPort(): SensorDeviceCatalogPort {
  const port = useContext(SensorDeviceCatalogContext);

  if (port === null) {
    throw new Error('SensorDeviceCatalogPort가 구성되지 않았습니다.');
  }

  return port;
}
