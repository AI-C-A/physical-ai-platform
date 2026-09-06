import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createCollectionVisuals } from '../api/in-memory-collection-visuals';
import { CollectionPerceptionViewer } from './CollectionPerceptionViewer';

describe('CollectionPerceptionViewer', () => {
  it.each(['offline', 'stale', 'idle'] as const)('원본이 %s이면 남아 있는 파생 영상을 숨긴다', (streamState) => {
    const result = createCollectionVisuals(1, 'rbp-head-rgb').headPerception;
    const { rerender } = render(<CollectionPerceptionViewer result={result} streamState={streamState} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' })).toHaveAttribute('data-stream-state', streamState);
    rerender(<CollectionPerceptionViewer result={result} streamState="live" />);
    expect(screen.getByAltText('Head RGB 상대 깊이')).toBeVisible();
  });
  it('결과가 없으면 원본 영상을 추론 결과처럼 보여주지 않는다', () => {
    render(<CollectionPerceptionViewer result={null} />);
    expect(screen.getByText('결과 대기')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' })).toHaveAttribute('data-media-panel');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('상대 깊이와 마스크를 별도로 표시하고 이미지 실패 후 다시 시도한다', async () => {
    const user = userEvent.setup();
    render(<CollectionPerceptionViewer result={createCollectionVisuals(1, 'rbp-head-rgb').headPerception} />);
    expect(screen.getByAltText('Head RGB 상대 깊이')).toBeVisible();
    for (const image of screen.getAllByRole('img')) {
      expect(image).toHaveClass('size-full', 'object-contain');
      expect(image.parentElement).toHaveClass('size-full');
    }
    fireEvent.error(screen.getByAltText('Head RGB 세그멘테이션 마스크'));
    expect(screen.getByText('불러오기 실패')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }));
    expect(screen.getByAltText('Head RGB 세그멘테이션 마스크')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Head RGB Depth와 세그멘테이션' }).querySelector('[data-media-panel-footer]')).toBeNull();
  });
});
