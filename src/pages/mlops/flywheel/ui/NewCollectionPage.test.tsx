import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { DataEnvironmentContext } from '@/shared/config';

import { NewHumanoidCollectionPage } from './FlywheelWorkspacePages';

function renderSetup(port: ReturnType<typeof createInMemoryFlywheel>) {
  return render(
    <MemoryRouter>
      <FlywheelContext.Provider value={port}>
        <DataEnvironmentContext.Provider value="simulation">
          <NewHumanoidCollectionPage />
        </DataEnvironmentContext.Provider>
      </FlywheelContext.Provider>
    </MemoryRouter>,
  );
}

describe('새 수집 설정의 입력과 복구', () => {
  it('중복 장치를 입력하면 첫 오류로 포커스를 이동하고 올바른 입력으로 수정할 수 있다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const create = vi.spyOn(port, 'createHumanDemonstrationSession');
    try {
      renderSetup(port);
      await user.click(screen.getByRole('button', { name: '시뮬레이션 예시 불러오기' }));
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
      await user.click(screen.getByRole('button', { name: '시뮬레이션 예시 불러오기' }));
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
      await user.click(screen.getByRole('button', { name: '시뮬레이션 예시 불러오기' }));
      await user.click(screen.getByRole('button', { name: '세션 생성' }));
      await screen.findByText('세션을 만들었지만 연결 정보를 불러오지 못했습니다. 다시 조회하세요.');
      expect(screen.getByRole('button', { name: '세션 생성' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      await screen.findByLabelText('Quest pairing code');
      await waitFor(() => expect(create).toHaveBeenCalledOnce());
    } finally {
      port.dispose();
    }
  });
});
