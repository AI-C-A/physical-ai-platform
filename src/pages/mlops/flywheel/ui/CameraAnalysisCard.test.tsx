import { createRef, StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCameraAnalysis } from '@/entities/collection-camera';
import { CameraAnalysisIssueContext, type CameraAnalysisIssue } from '../model/camera-analysis-issues';
import { CameraAnalysisCard } from './CameraAnalysisCard';

vi.mock('@/entities/collection-camera', () => ({ useCameraAnalysis: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it('분석 오류를 보고하고 복구, 정지, 영상 중단, 화면 이탈 시 제거한다', () => {
  const issues = new Map<string, CameraAnalysisIssue>();
  const report = (id: string, issue: CameraAnalysisIssue | null) => {
    if (issue === null) issues.delete(id);
    else issues.set(id, issue);
  };
  const failure = { status: 'error' as const, error: '분석 서버 연결을 확인하세요.', count: null, latencyMs: null };
  vi.mocked(useCameraAnalysis).mockReturnValue(failure);
  const videoRef = createRef<HTMLVideoElement>();
  const content = (playing: boolean) => (
    <StrictMode><CameraAnalysisIssueContext value={report}>
      <CameraAnalysisCard label="전신" role="full-body" videoRef={videoRef} playing={playing} />
    </CameraAnalysisIssueContext></StrictMode>
  );
  const view = render(content(true));
  expect([...issues.values()]).toEqual([{ title: '전신 · 4D Humans', message: failure.error }]);
  expect(screen.queryByText(failure.error)).not.toBeInTheDocument();
  vi.mocked(useCameraAnalysis).mockReturnValue({ status: 'ready', error: null, count: 1, latencyMs: 100 });
  view.rerender(content(true));
  expect(issues.size).toBe(0);
  vi.mocked(useCameraAnalysis).mockReturnValue(failure);
  view.rerender(content(true));
  expect(issues.size).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '전신 분석 정지' }));
  expect(issues.size).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: '전신 분석 시작' }));
  expect(issues.size).toBe(1);
  view.rerender(content(false));
  expect(issues.size).toBe(0);
  view.rerender(content(true));
  expect(issues.size).toBe(1);
  view.unmount();
  expect(issues.size).toBe(0);
});
