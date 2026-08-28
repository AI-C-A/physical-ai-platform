import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { monitoringSites } from '@/entities/site';

import { SitesPage } from './SitesPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <SitesPage />
    </MemoryRouter>,
  );
}

describe('SitesPage', () => {
  it('등록 사이트를 고유 ID와 지도 설정이 포함된 표로 표시한다', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: '사이트 관리' })).toBeInTheDocument();
    expect(screen.getByText(`등록 사이트 ${monitoringSites.length}개`).tagName).toBe('P');

    const table = screen.getByRole('table', { name: '사이트 목록' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(monitoringSites.length + 1);
    expect(within(table).getByText('pangyo-outdoor-zone')).toBeInTheDocument();
    expect(within(table).getByText('실외').tagName).toBe('TD');
    expect(within(table).getByText('37.39472, 127.11153')).toBeInTheDocument();
    expect(within(table).getByText('pangyo-army-ax-hub')).toBeInTheDocument();
    expect(within(table).getByText('실내').tagName).toBe('TD');
    expect(within(table).getByText('/assets/sites/pangyo-v1.glb')).toBeInTheDocument();
  });

  it('각 사이트 ID가 반영된 모니터링 링크를 제공한다', () => {
    renderPage();

    expect(screen.getByRole('link', {
      name: '판교 모니터링 열기',
    })).toHaveAttribute(
      'href',
      '/control/monitoring?siteId=pangyo-outdoor-zone',
    );
    expect(screen.getByRole('link', {
      name: '판교 육군 AX 거점 모니터링 열기',
    })).toHaveAttribute(
      'href',
      '/control/monitoring?siteId=pangyo-army-ax-hub',
    );
  });

  it('사이트 ID가 서로 중복되지 않는다', () => {
    const siteIds = monitoringSites.map((site) => site.id);
    expect(new Set(siteIds).size).toBe(siteIds.length);
  });
});
