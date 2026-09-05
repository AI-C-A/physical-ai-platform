import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { downloadTextFile } from '@/shared/lib/record-export';

import { CollectionWorkspacePage } from './FlywheelWorkspacePages';

vi.mock('@/shared/lib/record-export', () => ({ downloadTextFile: vi.fn() }));

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn(), writable: true });
});

afterAll(() => {
  if (scrollIntoViewDescriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
});

describe('CollectionWorkspacePage 필터', () => {
  it('URL의 검색·상태·정렬 조건과 동일한 세션을 순서대로 내보낸다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const input = {
        instruction: '분류 작업', projectId: 'project-tiger', robotId: 'robot-003',
        sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'sort-task',
      };
      const second = await port.createHumanoidSession({ ...input, name: '분류 B' });
      const first = await port.createHumanoidSession({ ...input, name: '분류 A' });
      await port.createHumanoidSession({ ...input, name: '다른 작업' });
      await port.validateSession(second.id);
      await port.validateSession(first.id);
      render(
        <MemoryRouter initialEntries={['/mlops/collection?q=분류&state=episode-ready&sort=name']}>
          <FlywheelContext.Provider value={port}><CollectionWorkspacePage /></FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('link', { name: '분류 A' });
      expect(screen.queryByRole('link', { name: '다른 작업' })).not.toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: '세션 정렬' })).toHaveTextContent('세션 이름순');
      await user.click(screen.getByRole('button', { name: '수집 세션 JSON 내보내기' }));
      const call = vi.mocked(downloadTextFile).mock.lastCall;
      expect(call?.[0]).toBe('collection-sessions.json');
      const exported = JSON.parse(call?.[1] ?? '[]') as { id: string }[];
      expect(exported.map((row) => row.id)).toEqual([first.id, second.id]);
      expect(screen.getByText('현재 표시된 세션 2개의 기록 정보를 내보냈습니다.')).toBeVisible();
    } finally {
      port.dispose();
    }
  });
  it('빈 목록에서 하나의 새 수집 링크와 저장된 데이터 경로를 제공한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      render(
        <MemoryRouter>
          <FlywheelContext.Provider value={port}>
            <CollectionWorkspacePage />
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('heading', { name: '진행 중인 수집이 없습니다' });
      expect(screen.getAllByRole('link', { name: '새 수집' })).toHaveLength(1);
      expect(screen.getByRole('link', { name: '새 수집' })).toHaveAttribute('href', '/mlops/collection/new');
      expect(screen.getByRole('link', { name: '저장한 데이터 보기' })).toHaveAttribute('href', '/mlops/catalog');
    } finally {
      port.dispose();
    }
  });

  it('녹화 준비 완료 세션을 검색하고 일치하지 않는 검색을 초기화한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const input = {
        instruction: 'Sort objects', projectId: 'project-tiger', robotId: 'robot-003',
        sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
      };
      const ready = await port.createHumanoidSession({ ...input, name: '녹화 준비 세션' });
      await port.validateSession(ready.id);
      await port.createHumanoidSession({ ...input, name: '설정 중인 세션' });
      render(
        <MemoryRouter>
          <FlywheelContext.Provider value={port}>
            <CollectionWorkspacePage />
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      await screen.findByRole('link', { name: ready.name });
      screen.getByRole('combobox', { name: '상태 필터' }).focus();
      await user.keyboard('{ArrowDown}');
      await user.click(screen.getByRole('option', { name: '녹화 준비 완료' }));
      expect(screen.getByRole('link', { name: ready.name })).toBeVisible();
      expect(screen.queryByRole('link', { name: '설정 중인 세션' })).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: '수집 검색' }), '존재하지 않는 작업');
      expect(screen.getByRole('heading', { name: '조건에 맞는 결과가 없습니다' })).toBeVisible();
      expect(screen.getByText(/‘존재하지 않는 작업’ 검색 결과가 없습니다/u)).toBeVisible();
      await user.click(screen.getByRole('button', { name: '검색·필터 초기화' }));
      expect(screen.getByRole('textbox', { name: '수집 검색' })).toHaveValue('');
      expect(screen.getByRole('combobox', { name: '상태 필터' })).toHaveTextContent('전체 상태');
      expect(screen.getByRole('link', { name: ready.name })).toBeVisible();
      expect(screen.getByRole('link', { name: '설정 중인 세션' })).toBeVisible();
    } finally {
      port.dispose();
    }
  });

  it('운영 요약을 키보드로 선택하면 상태 필터와 목록이 함께 바뀐다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const input = {
        instruction: 'Sort objects', projectId: 'project-tiger', robotId: 'robot-003',
        sensorDeviceId: 'sensor-rig-001', siteId: 'site-lab', taskId: 'task-sort',
      };
      const active = await port.createHumanoidSession({ ...input, name: '진행 중인 녹화' });
      await port.validateSession(active.id);
      await port.startSession(active.id);
      await port.startEpisode(active.id);
      await port.createHumanoidSession({ ...input, name: '다음 작업 준비' });
      render(
        <MemoryRouter>
          <FlywheelContext.Provider value={port}>
            <CollectionWorkspacePage />
          </FlywheelContext.Provider>
        </MemoryRouter>,
      );
      const summary = await screen.findByRole('region', { name: '수집 운영 요약' });
      const recording = within(summary).getByRole('button', { name: '녹화 중 1개' });
      recording.focus();
      await user.keyboard('{Enter}');
      expect(recording).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('combobox', { name: '상태 필터' })).toHaveTextContent('녹화 중');
      expect(screen.getByRole('link', { name: active.name })).toBeVisible();
      expect(screen.queryByRole('link', { name: '다음 작업 준비' })).not.toBeInTheDocument();
      await user.click(within(summary).getByRole('button', { name: '전체 세션 2개' }));
      expect(screen.getByRole('link', { name: '다음 작업 준비' })).toBeVisible();
      expect(recording).toHaveAttribute('aria-pressed', 'false');
    } finally {
      port.dispose();
    }
  });
});
