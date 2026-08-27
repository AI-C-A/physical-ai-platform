// @vitest-environment node

import { describe, expect, it } from 'vitest';

import browserConfig from '../playwright.config';
import soakConfig from '../playwright.soak.config';

const expectedProjectMatrix = [
  { channel: 'chrome', name: 'chrome-1440', viewport: { height: 900, width: 1440 } },
  { channel: 'chrome', name: 'chrome-768', viewport: { height: 900, width: 768 } },
  { channel: 'chrome', name: 'chrome-1024', viewport: { height: 900, width: 1024 } },
  { channel: 'msedge', name: 'edge-1440', viewport: { height: 900, width: 1440 } },
  { channel: 'msedge', name: 'edge-768', viewport: { height: 900, width: 768 } },
  { channel: 'msedge', name: 'edge-1024', viewport: { height: 900, width: 1024 } },
] as const;

describe('Playwright 최종 검증 구성', () => {
  it('Chrome과 Edge에서 768·1024·1440 viewport를 모두 유지한다', () => {
    const projectMatrix = browserConfig.projects?.map((project) => ({
      channel: project.use?.channel,
      name: project.name,
      viewport: project.use?.viewport,
    }));

    expect(projectMatrix).toEqual(expectedProjectMatrix);
  });

  it('로컬 실행에서도 test.only를 거부한다', () => {
    expect(browserConfig.forbidOnly).toBe(true);
  });

  it('모든 조합에서 공식 경로·업무 흐름과 viewport별 Shell을 실행한다', () => {
    for (const project of browserConfig.projects ?? []) {
      expect(project.testMatch).toContain('**/routes.spec.ts');
      expect(project.testMatch).toContain('**/startup.spec.ts');
      expect(project.testMatch).toContain('**/workflows.spec.ts');
      expect(project.testMatch).toContain(
        project.use?.viewport?.width === 768
          ? '**/shell-compact.spec.ts'
          : '**/shell-desktop.spec.ts',
      );
      expect(project.testMatch).not.toContain(
        '**/telemetry-video-soak.spec.ts',
      );
    }
  });

  it('브라우저 회귀와 soak의 결과·HTML 보고서를 서로 다른 위치에 보존한다', () => {
    expect(browserConfig.outputDir).toBe('test-results/browser');
    expect(browserConfig.reporter).toContainEqual([
      'html',
      { open: 'never', outputFolder: 'playwright-report/browser' },
    ]);
    expect(soakConfig.outputDir).toBe('test-results/soak');
    expect(soakConfig.reporter).toContainEqual([
      'html',
      { open: 'never', outputFolder: 'playwright-report/soak' },
    ]);
    expect(
      soakConfig.projects?.find((project) => project.name === 'chrome-1440')
        ?.testMatch,
    ).toEqual(['**/telemetry-video-soak.spec.ts']);
    expect(
      soakConfig.projects?.find((project) => project.name === 'chrome-1440')
        ?.use,
    ).toMatchObject({
      channel: 'chrome',
      viewport: { height: 900, width: 1440 },
    });
  });
});
