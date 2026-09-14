import { BrandingContext } from '@/shared/config';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { fillCollectionSetup } from '@/test/fill-collection-setup';

import { HumanoidCollectionDetailPage, CollectionWorkspacePage, NewHumanoidCollectionPage } from './FlywheelWorkspacePages';

function renderSetup(port: ReturnType<typeof createInMemoryFlywheel>) {
  return render(
    <BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'ROBOT Army TIGER+', logo: '/assets/army-tiger-logo.png' }}><MemoryRouter initialEntries={['/mlops/collection/new?q=분류&sort=name']}>
      <FlywheelContext.Provider value={port}>
        <Routes>
          <Route path="/mlops/collection" element={<CollectionWorkspacePage />}>
            <Route path="new" element={<NewHumanoidCollectionPage />} />
            <Route path=":sessionId" element={<HumanoidCollectionDetailPage />} />
          </Route>
        </Routes>
      </FlywheelContext.Provider>
    </MemoryRouter></BrandingContext.Provider>,
  );
}

describe('새 수집 설정의 입력과 복구', () => {
  it('장치 ID 입력 없이 작업 정보를 입력한다', () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      renderSetup(port);
      expect(screen.queryByText(/시뮬레이션|실제 환경|예시 작업/u)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /예시/u })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /작업 ID|장치 ID|카메라 ID/u })).not.toBeInTheDocument();
      for (const label of ['작업 지시']) {
        expect(screen.getByRole('textbox', { name: label })).toHaveValue('');
      }
    } finally {
      port.dispose();
    }
  });

  it('mock에서도 실제와 같은 연결 대기 세션을 생성하고 미연결 장치를 등록하지 않는다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    try {
      renderSetup(port);
      await fillCollectionSetup(user);
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByRole('region', { name: '수집 작업 컨트롤' });
      expect(screen.queryByLabelText('Quest 연결 코드')).not.toBeInTheDocument();
      expect(create).toHaveBeenCalledOnce();
      const input = create.mock.calls[0]![0];
      expect(input.taskId).toMatch(/^task-[a-f0-9]{32}$/u);
      expect(input.questDeviceId).toMatch(/^quest-[a-f0-9]{32}$/u);
      expect(input.profileId).toBe('quest-hand-collection-v1');
      expect([input.exoskeletonDeviceId, input.headCameraDeviceId, input.externalCameraDeviceId]).toEqual(['', '', '']);
      const session = (await port.listOperationalSessions()).find((item) => item.taskId === input.taskId)!;
      expect(session.humanDemonstration?.sourceBindings).toEqual([expect.objectContaining({ role: 'xr-hand-tracking', state: 'pending' })]);
      expect(session.streams.map((stream) => stream.id)).toEqual(['quest-hand-left', 'quest-hand-right']);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    } finally {
      port.dispose();
    }
  });

  it('Quest 전용 모드에서도 ID 입력 없이 자동 식별자로 생성한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession').mockRejectedValueOnce(new Error('offline'));
    try {
      renderSetup(Object.assign(port, { collectionMode: 'quest-hands' as const }));
      expect(screen.queryByRole('textbox', { name: /작업 ID|장치 ID|카메라 ID/u })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: '외부 카메라 사용' })).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: '작업 지시' }), '분류');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByRole('alert');
      expect(create).toHaveBeenCalledOnce();
      const input = create.mock.calls[0]![0];
      expect(input.taskId).toMatch(/^task-[a-f0-9]{32}$/u);
      expect(input.questDeviceId).toMatch(/^quest-[a-f0-9]{32}$/u);
      expect([input.exoskeletonDeviceId, input.headCameraDeviceId, input.externalCameraDeviceId]).toEqual(['', '', '']);
    } finally {
      port.dispose();
    }
  });

  it('공백뿐인 세션 이름을 거절하고 세션을 만들지 않는다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    try {
      renderSetup(port);
      await fillCollectionSetup(user);
      const name = screen.getByRole('textbox', { name: '세션 이름' });
      await user.clear(name);
      await user.type(name, '   ');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      expect(name).toHaveAccessibleDescription('세션 이름을 입력하세요.');
      expect(name).toHaveFocus();
      expect(create).not.toHaveBeenCalled();
    } finally {
      port.dispose();
    }
  });

  it('생성 후 조회 실패에서는 중복 생성을 막고 같은 세션을 재조회한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    vi.spyOn(port, 'getSession').mockRejectedValueOnce(new Error('connection lost'));
    try {
      renderSetup(port);
      await fillCollectionSetup(user);
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByRole('button', { name: '다시 시도' });
      expect(screen.queryByRole('button', { name: '세션 생성' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      await screen.findByRole('region', { name: '수집 작업 컨트롤' });
      expect(screen.queryByLabelText('Quest 연결 코드')).not.toBeInTheDocument();
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
    } finally {
      port.dispose();
    }
  });

  it('취소하면 필터를 유지한 목록으로 돌아가 새 수집에 포커스를 복원한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    try {
      renderSetup(port);
      await screen.findByRole('dialog', { name: '새 데이터 수집' });
      await user.click(screen.getByRole('button', { name: '취소' }));
      const trigger = await screen.findByRole('link', { name: '새 수집' });
      expect(trigger).toHaveAttribute('href', '/mlops/collection/new?q=%EB%B6%84%EB%A5%98&sort=name');
      await waitFor(() => expect(trigger).toHaveFocus());
      expect(create).not.toHaveBeenCalled();
      await user.click(trigger);
      await screen.findByRole('dialog', { name: '새 데이터 수집' });
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    } finally {
      port.dispose();
    }
  });

  it('생성 실패 시 입력을 유지하고 재시도할 수 있다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession').mockRejectedValueOnce(new Error('생성 연결 실패'));
    try {
      renderSetup(port);
      await fillCollectionSetup(user);
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('세션을 생성하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.');
      expect(screen.queryByText('생성 연결 실패')).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: '작업 지시' })).toHaveValue('과일을 종류에 맞는 트레이에 분류하세요.');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByRole('region', { name: '수집 작업 컨트롤' });
      expect(screen.queryByLabelText('Quest 연결 코드')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'Quest 연결' })).not.toBeInTheDocument();
      expect(create).toHaveBeenCalledTimes(2);
      expect(create.mock.calls[0]?.[0]).toEqual(create.mock.calls[1]?.[0]);
    } finally {
      port.dispose();
    }
  });
});
