import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { fillCollectionSetup } from '@/test/fill-collection-setup';

import { CollectionConnectionPage, CollectionWorkspacePage, NewHumanoidCollectionPage } from './FlywheelWorkspacePages';

function renderSetup(port: ReturnType<typeof createInMemoryFlywheel>) {
  return render(
    <MemoryRouter initialEntries={['/mlops/collection/new?q=분류&sort=name']}>
      <FlywheelContext.Provider value={port}>
        <Routes>
          <Route path="/mlops/collection" element={<CollectionWorkspacePage />}>
            <Route path="new" element={<NewHumanoidCollectionPage />} />
            <Route path=":sessionId/setup" element={<CollectionConnectionPage />} />
          </Route>
        </Routes>
      </FlywheelContext.Provider>
    </MemoryRouter>,
  );
}

describe('새 수집 설정의 입력과 복구', () => {
  it('환경 안내와 예시 입력 없이 작업과 장치 ID를 직접 입력한다', () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      renderSetup(port);
      expect(screen.queryByText(/시뮬레이션|실제 환경|예시 작업/u)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /예시/u })).not.toBeInTheDocument();
      for (const label of ['작업 ID', '작업 지시', '외골격 장치 ID', 'Quest 손 추적 장치 ID', 'RBP 헤드 카메라 ID', '외부 카메라 ID · 선택']) {
        expect(screen.getByRole('textbox', { name: label })).toHaveValue('');
      }
    } finally {
      port.dispose();
    }
  });

  it('중복 장치를 입력하면 첫 오류로 포커스를 이동하고 올바른 입력으로 수정할 수 있다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    try {
      renderSetup(port);
      await fillCollectionSetup(user);
      const quest = screen.getByRole('textbox', { name: 'Quest 손 추적 장치 ID' });
      await user.clear(quest);
      await user.type(quest, ' rbp-headcam-001 ');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      expect(create).not.toHaveBeenCalled();
      expect(quest).toHaveFocus();
      expect(quest).toHaveAccessibleDescription('장치마다 서로 다른 ID를 입력하세요.');
      await user.clear(quest);
      await user.type(quest, ' quest-test ');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByLabelText('Quest pairing code');
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0]?.[0].questDeviceId).toBe('quest-test');
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
      await screen.findByText('세션 연결 정보를 불러오지 못했습니다. 다시 조회하세요.');
      expect(screen.queryByRole('button', { name: '세션 생성' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      await screen.findByLabelText('Quest pairing code');
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
      expect(screen.getByRole('textbox', { name: '작업 ID' })).toHaveValue('task-sort-fruit');
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByLabelText('Quest pairing code');
      expect(screen.getByRole('dialog', { name: 'Quest 연결' })).toBeInTheDocument();
      expect(create).toHaveBeenCalledTimes(2);
    } finally {
      port.dispose();
    }
  });
});
