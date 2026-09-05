import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';

import { FlywheelExplorerPage, FlywheelOverviewPage } from './FlywheelAnalyticsPages';

function CurrentLocation() {
  const location = useLocation();
  return <output data-testid="location" hidden>{location.search}</output>;
}

describe('데이터 탐색', () => {
  it('유형 필터가 비면 전체 기록으로 복구하고 다른 검색 조건은 유지한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      vi.spyOn(port, 'getLineage').mockResolvedValue({
        nodes: [{ id: 'dataset-one', type: 'dataset', label: '검증한 데이터셋', detailPath: '/mlops/datasets/dataset-one', status: 'draft' }],
        edges: [],
      });
      render(
        <MemoryRouter initialEntries={['/bigdata/explorer?type=model&siteId=site-lab']}>
          <FlywheelContext.Provider value={port}><FlywheelExplorerPage /><CurrentLocation /></FlywheelContext.Provider>
        </MemoryRouter>,
      );
      expect(await screen.findByText('선택한 유형의 기록이 없습니다.')).toHaveAttribute('role', 'status');
      await user.click(screen.getByRole('button', { name: '전체 기록 보기' }));
      expect(await screen.findByRole('link', { name: '검증한 데이터셋' })).toHaveAttribute('href', '/mlops/datasets/dataset-one');
      expect(screen.getByTestId('location')).toHaveTextContent('?siteId=site-lab');
    } finally { port.dispose(); }
  });
});

describe('FlywheelOverviewPage', () => {
  it('목록 순서와 관계없이 가장 최근 생성한 실행의 이름과 상세 링크를 표시한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const [run] = await port.listTrainingRuns();
      if (run === undefined) throw new Error('training fixture missing');
      vi.spyOn(port, 'listTrainingRuns').mockResolvedValue([
        { ...run, id: 'older', name: '이전 학습', createdAtMs: 100, status: 'failed' },
        { ...run, id: 'newer', name: '최근 학습', createdAtMs: 200, status: 'succeeded' },
      ]);
      render(
        <MemoryRouter>
          <FlywheelContext.Provider value={port}><FlywheelOverviewPage /></FlywheelContext.Provider>
        </MemoryRouter>,
      );
      expect(await screen.findByRole('link', { name: '최근 학습' }))
        .toHaveAttribute('href', '/mlops/training/newer');
      expect(screen.queryByRole('link', { name: '이전 학습' })).not.toBeInTheDocument();
      expect(screen.getByText('학습 완료')).toBeVisible();
    } finally {
      port.dispose();
    }
  });

  it('학습 조회 실패는 다른 지표를 유지하고 개별 재시도로 복구한다', async () => {
    const user = userEvent.setup();
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      vi.spyOn(port, 'listTrainingRuns').mockRejectedValueOnce(new Error('unavailable'));
      render(
        <MemoryRouter>
          <FlywheelContext.Provider value={port}><FlywheelOverviewPage /></FlywheelContext.Provider>
        </MemoryRouter>,
      );
      const retry = await screen.findByRole('button', { name: '학습 다시 불러오기' });
      expect(screen.getByRole('heading', { name: '수집 데이터' })).toBeVisible();
      expect(await screen.findByRole('link', { name: 'Sorting regression suite' })).toBeVisible();
      await user.click(retry);
      expect(await screen.findByRole('link', { name: 'π0 sorting finetune' })).toBeVisible();
      expect(screen.queryByRole('button', { name: '학습 다시 불러오기' })).not.toBeInTheDocument();
    } finally {
      port.dispose();
    }
  });
});
