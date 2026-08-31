import { useSyncExternalStore } from 'react';

const cameraSegmentationSyncStorageKey =
  'robot-army-tiger.camera-segmentation-sync';

const listeners = new Set<() => void>();
let fallbackValue = false;

function readCameraSegmentationSync(): boolean {
  try {
    return window.localStorage.getItem(cameraSegmentationSyncStorageKey) === 'true';
  } catch {
    return fallbackValue;
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function handleStorageChange(event: StorageEvent): void {
  if (event.key === cameraSegmentationSyncStorageKey) notifyListeners();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', handleStorageChange);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('storage', handleStorageChange);
    }
  };
}

export function setCameraSegmentationSync(enabled: boolean): void {
  fallbackValue = enabled;
  try {
    window.localStorage.setItem(
      cameraSegmentationSyncStorageKey,
      String(enabled),
    );
  } catch {
    // 저장소를 사용할 수 없어도 현재 실행 중인 화면에는 설정을 반영한다.
  }
  notifyListeners();
}

export function useCameraSegmentationSync(): boolean {
  return useSyncExternalStore(subscribe, readCameraSegmentationSync, () => false);
}
