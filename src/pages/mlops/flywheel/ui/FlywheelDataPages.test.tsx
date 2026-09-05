import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';

import { CatalogDetailPage, FlywheelDatasetDetailPage, NewFlywheelDatasetPage } from './FlywheelDataPages';

function renderPage(port: ReturnType<typeof createInMemoryFlywheel>, path: string) {
  return render(
    <FlywheelContext.Provider value={port}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mlops/datasets/new" element={<NewFlywheelDatasetPage />} />
          <Route path="/mlops/datasets/:datasetVersionId" element={<p>데이터셋 생성 완료</p>} />
          <Route path="/mlops/catalog/:collectionId" element={<CatalogDetailPage />} />
        </Routes>
      </MemoryRouter>
    </FlywheelContext.Provider>,
  );
}

describe('데이터셋 구성', () => {
  afterEach(() => vi.restoreAllMocks());

  it('직접 방문하면 임의 데이터를 선택하지 않고 사용자가 고른 저장 데이터만 생성한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      const create = vi.spyOn(port, 'createDataset');
      renderPage(port, '/mlops/datasets/new?kind=unknown');
      const episode = await screen.findByRole('checkbox', { name: 'Pick and place · 01' });
      expect(episode).not.toBeChecked();
      expect(screen.getByRole('button', { name: '초안 생성' })).toBeDisabled();
      expect(screen.queryByText('QC 정책 · 통과')).not.toBeInTheDocument();
      await user.type(screen.getByRole('textbox', { name: '이름' }), '선택한 수집 데이터');
      await user.click(episode);
      await user.click(screen.getByRole('button', { name: '초안 생성' }));

      expect(await screen.findByText('데이터셋 생성 완료')).toBeVisible();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        name: '선택한 수집 데이터', kind: 'humanoid-episode',
        unitRefs: [{ kind: 'episode', episodeId: 'episode-fw-001' }],
      }));
    } finally { port.dispose(); }
  });

  it('중복된 링크 선택은 한 번만 포함하고 없는 참조는 명시적으로 제외해야 생성한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      const create = vi.spyOn(port, 'createDataset');
      renderPage(port, '/mlops/datasets/new?episode=episode-fw-001&episode=episode-fw-001&episode=missing');
      expect(await screen.findByRole('alert')).toHaveTextContent('요청한 데이터 1개');
      await user.type(screen.getByRole('textbox', { name: '이름' }), '복구한 선택');
      expect(screen.getByRole('button', { name: '초안 생성' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: '사용할 수 없는 항목 제외' }));
      await user.click(screen.getByRole('button', { name: '초안 생성' }));
      await screen.findByText('데이터셋 생성 완료');
      expect(create.mock.calls[0]?.[0].unitRefs).toEqual([{ kind: 'episode', episodeId: 'episode-fw-001' }]);
    } finally { port.dispose(); }
  });

  it('저장 데이터 조회 오류는 선택을 유지한 채 재시도하고 생성 실패 시 입력을 보존한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      vi.spyOn(port, 'listEpisodes').mockRejectedValueOnce(new Error('network unavailable'));
      const create = vi.spyOn(port, 'createDataset').mockRejectedValueOnce(new Error('network unavailable'));
      renderPage(port, '/mlops/datasets/new?episode=episode-fw-001');
      await user.type(screen.getByRole('textbox', { name: '이름' }), '입력 보존');
      await user.click(await screen.findByRole('button', { name: '데이터 다시 불러오기' }));
      expect(await screen.findByRole('checkbox', { name: 'Pick and place · 01' })).toBeChecked();
      await user.click(screen.getByRole('button', { name: '초안 생성' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('데이터셋을 생성하지 못했습니다.');
      expect(screen.getByRole('textbox', { name: '이름' })).toHaveValue('입력 보존');
      await user.click(screen.getByRole('button', { name: '초안 생성' }));
      await screen.findByText('데이터셋 생성 완료');
      expect(create).toHaveBeenCalledTimes(2);
    } finally { port.dispose(); }
  });

  it('카탈로그 에피소드 조회 실패를 빈 목록으로 숨기지 않고 개별 재시도로 복구한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      vi.spyOn(port, 'listEpisodes').mockRejectedValueOnce(new Error('network unavailable'));
      renderPage(port, '/mlops/catalog/capture-h-001');
      expect(await screen.findByRole('heading', { name: 'Desktop sorting batch' })).toBeVisible();
      expect(await screen.findByRole('alert')).toHaveTextContent('에피소드를 불러오지 못했습니다.');
      expect(screen.queryByRole('table', { name: '카탈로그 에피소드 선택' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '에피소드 다시 불러오기' }));
      expect(await screen.findByRole('table', { name: '카탈로그 에피소드 선택' })).toBeVisible();
      expect(screen.getByRole('button', { name: '에피소드 JSON 내보내기' })).toBeEnabled();
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    } finally { port.dispose(); }
  });

  it('릴리스된 데이터셋의 복사 버튼은 동일한 원본 참조로 새 초안을 생성한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      const original = await port.getDataset('dataset-h-v3');
      const create = vi.spyOn(port, 'createDataset');
      render(
        <FlywheelContext.Provider value={port}>
          <MemoryRouter initialEntries={['/mlops/datasets/dataset-h-v3']}>
            <Routes><Route path="/mlops/datasets/:datasetVersionId" element={<FlywheelDatasetDetailPage />} /></Routes>
          </MemoryRouter>
        </FlywheelContext.Provider>,
      );
      await user.click(await screen.findByRole('button', { name: '복사해서 새 데이터셋 만들기' }));
      expect(await screen.findByRole('heading', { name: 'Sorting Generalist 복사본 v1' })).toBeVisible();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sorting Generalist 복사본', unitRefs: original?.unitRefs }));
      expect(screen.queryByText('72 / 28')).not.toBeInTheDocument();
      expect(screen.getByText('보고된 검증 오류가 없습니다.')).toBeVisible();
    } finally { port.dispose(); }
  });
});
