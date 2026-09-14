import { createContext } from 'react';

export const RobotSceneContext = createContext<{
  setPreview: (element: HTMLDivElement | null) => void;
} | null>(null);
