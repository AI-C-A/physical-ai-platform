/* eslint-disable react-refresh/only-export-components -- This context module intentionally exports its provider and paired hook. */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  defaultMapStyleId,
  getAvailableMapStyles,
  type MapStyleId,
  type MapStyleOption,
} from './map-style';

const mapStylePreferenceStorageKey = 'robot-army-tiger.map-style.v1';

interface MapStylePreferenceContextValue {
  readonly availableStyles: readonly MapStyleOption[];
  readonly selectedStyle: MapStyleOption;
  readonly selectMapStyle: (styleId: string) => void;
}

const MapStylePreferenceContext =
  createContext<MapStylePreferenceContextValue | null>(null);

function isAvailableStyleId(
  styleId: string | null,
  availableStyles: readonly MapStyleOption[],
): styleId is MapStyleId {
  return styleId !== null
    && availableStyles.some((style) => style.id === styleId);
}

function readStoredStyleId(
  availableStyles: readonly MapStyleOption[],
): string {
  try {
    const storedStyleId = window.localStorage.getItem(mapStylePreferenceStorageKey);
    return isAvailableStyleId(storedStyleId, availableStyles)
      ? storedStyleId
      : defaultMapStyleId;
  } catch {
    return defaultMapStyleId;
  }
}

function storeStyleId(styleId: string): void {
  try {
    window.localStorage.setItem(mapStylePreferenceStorageKey, styleId);
  } catch {
    // 저장소를 사용할 수 없어도 현재 세션의 스타일 변경은 유지한다.
  }
}

export function MapStylePreferenceProvider({ children }: PropsWithChildren) {
  const availableStyles = useMemo(() => getAvailableMapStyles(), []);
  const [selectedStyleId, setSelectedStyleId] = useState(
    () => readStoredStyleId(availableStyles),
  );
  const selectedStyle = availableStyles.find(
    (style) => style.id === selectedStyleId,
  ) ?? availableStyles[0];

  const selectMapStyle = useCallback((styleId: string) => {
    if (!isAvailableStyleId(styleId, availableStyles)) return;
    setSelectedStyleId(styleId);
    storeStyleId(styleId);
  }, [availableStyles]);

  const value = useMemo<MapStylePreferenceContextValue>(() => ({
    availableStyles,
    selectedStyle,
    selectMapStyle,
  }), [availableStyles, selectMapStyle, selectedStyle]);

  return (
    <MapStylePreferenceContext.Provider value={value}>
      {children}
    </MapStylePreferenceContext.Provider>
  );
}

export function useMapStylePreference(): MapStylePreferenceContextValue {
  const preference = useContext(MapStylePreferenceContext);
  if (preference === null) {
    throw new Error('MapStylePreferenceProvider가 구성되지 않았습니다.');
  }
  return preference;
}
