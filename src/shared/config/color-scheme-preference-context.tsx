/* eslint-disable react-refresh/only-export-components -- This context module intentionally exports its provider and paired hook. */
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export type ColorSchemePreference = 'light' | 'dark' | 'system';

const colorSchemePreferenceStorageKey =
  'robot-army-tiger.color-scheme.v1';

interface ColorSchemePreferenceContextValue {
  readonly preference: ColorSchemePreference;
  readonly selectPreference: (preference: string) => void;
}

const ColorSchemePreferenceContext =
  createContext<ColorSchemePreferenceContextValue | null>(null);

function isColorSchemePreference(
  value: string | null,
): value is ColorSchemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function readStoredPreference(): ColorSchemePreference {
  try {
    const storedPreference = window.localStorage.getItem(
      colorSchemePreferenceStorageKey,
    );
    return isColorSchemePreference(storedPreference)
      ? storedPreference
      : 'system';
  } catch {
    return 'system';
  }
}

function storePreference(preference: ColorSchemePreference): void {
  try {
    window.localStorage.setItem(
      colorSchemePreferenceStorageKey,
      preference,
    );
  } catch {
    // 저장소를 사용할 수 없어도 현재 세션의 색상 모드 변경은 유지한다.
  }
}

function applyPreference(preference: ColorSchemePreference): void {
  if (preference === 'system') {
    document.documentElement.removeAttribute('data-color-scheme');
    return;
  }
  document.documentElement.dataset.colorScheme = preference;
}

export function ColorSchemePreferenceProvider({
  children,
}: PropsWithChildren) {
  const [preference, setPreference] = useState(readStoredPreference);

  useLayoutEffect(() => {
    applyPreference(preference);
  }, [preference]);

  const selectPreference = useCallback((nextPreference: string) => {
    if (!isColorSchemePreference(nextPreference)) return;
    setPreference(nextPreference);
    storePreference(nextPreference);
  }, []);

  const value = useMemo<ColorSchemePreferenceContextValue>(() => ({
    preference,
    selectPreference,
  }), [preference, selectPreference]);

  return (
    <ColorSchemePreferenceContext.Provider value={value}>
      {children}
    </ColorSchemePreferenceContext.Provider>
  );
}

export function useColorSchemePreference():
ColorSchemePreferenceContextValue {
  const preference = useContext(ColorSchemePreferenceContext);
  if (preference === null) {
    throw new Error('ColorSchemePreferenceProvider가 구성되지 않았습니다.');
  }
  return preference;
}
