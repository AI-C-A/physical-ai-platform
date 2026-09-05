import { createContext } from 'react';

import type { RouteMorphContextValue } from './route-morph-types';

export const RouteMorphContext = createContext<RouteMorphContextValue | null>(
  null,
);
