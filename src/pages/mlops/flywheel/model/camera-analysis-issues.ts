import { createContext } from 'react';

export interface CameraAnalysisIssue {
  readonly title: string;
  readonly message: string;
}

export const CameraAnalysisIssueContext = createContext<
  ((id: string, issue: CameraAnalysisIssue | null) => void) | null
>(null);
