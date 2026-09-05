import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';

import { PatrolRobotCatalogAdapter } from '../api/patrol-robot-adapters';
import { RobotCatalogContext } from './robot-catalog-context';
import { useRobotCatalog } from './use-robot-catalog';

describe('로봇 목록 연동 오류', () => {
  it.each([
    ['ROBOT_ACCESS_DENIED', '등록된 로봇을 조회할 권한이 없습니다. 관리자에게 로봇 접근 권한을 확인해 주세요.'],
    ['INTEGRATION_CONFIGURATION_ERROR', '로봇 연동 인증에 실패했습니다. 관리자에게 연동 인증 설정을 확인해 주세요.'],
    ['UNKNOWN', '로봇 목록을 불러오지 못했습니다.'],
  ])('%s의 안전한 안내를 유지하고 재시도로 회복한다', async (code, message) => {
    let denied = true;
    const port = new PatrolRobotCatalogAdapter({
      endpoint: '/api/integrations/patrol',
      fetcher: () => Promise.resolve(denied
        ? Response.json({ code, message: '노출하면 안 되는 원문' }, { status: 502 })
        : Response.json({ items: [{ id: 'robot-01', serialNumber: null, name: null,
          displayName: '로봇 01', integrationProfileId: 'patrol-rest-v1' }] })),
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <RobotCatalogContext.Provider value={port}>{children}</RobotCatalogContext.Provider>
    );
    const { result } = renderHook(useRobotCatalog, { wrapper });
    await waitFor(() => expect(result.current).toMatchObject({ status: 'error', message }));
    denied = false;
    act(() => result.current.retry());
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', robots: [{ id: 'robot-01' }] }));
  });
});
