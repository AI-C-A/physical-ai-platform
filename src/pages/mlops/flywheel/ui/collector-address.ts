import { cameraCollectorOrigin } from '@/entities/collection-camera';

export function collectorAddress(path: string): string {
  return new URL(path, cameraCollectorOrigin()).href;
}
