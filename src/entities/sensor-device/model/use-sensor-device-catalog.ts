import { useCallback, useMemo } from 'react';

import { useAsyncQuery } from '@/shared/lib/async-query';

import type { SensorDeviceDescriptor } from './sensor-device';
import { useSensorDeviceCatalogPort } from './sensor-device-catalog-context';

type SensorDeviceCatalogLoadState =
  | {
      readonly status: 'loading';
      readonly sensorDevices: readonly [];
      readonly retry: () => void;
    }
  | {
      readonly status: 'ready';
      readonly sensorDevices: readonly SensorDeviceDescriptor[];
      readonly retry: () => void;
    }
  | {
      readonly status: 'error';
      readonly sensorDevices: readonly [];
      readonly message: string;
      readonly retry: () => void;
    };

export function useSensorDeviceCatalog(): SensorDeviceCatalogLoadState {
  const port = useSensorDeviceCatalogPort();
  const load = useCallback(() => port.listSensorDevices(), [port]);
  const result = useAsyncQuery(load);

  return useMemo(() => {
    if (result.status === 'ready') {
      return {
        status: 'ready',
        sensorDevices: result.data,
        retry: result.retry,
      };
    }
    if (result.status === 'error') {
      return {
        status: 'error',
        sensorDevices: [],
        message: result.message,
        retry: result.retry,
      };
    }
    return {
      status: 'loading',
      sensorDevices: [],
      retry: result.retry,
    };
  }, [result]);
}
