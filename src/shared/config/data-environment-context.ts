import { createContext, useContext } from 'react';

export type DataEnvironment = 'simulation' | 'connected';

export const DataEnvironmentContext = createContext<DataEnvironment | null>(null);

export function useDataEnvironment(): DataEnvironment | null {
  return useContext(DataEnvironmentContext);
}
