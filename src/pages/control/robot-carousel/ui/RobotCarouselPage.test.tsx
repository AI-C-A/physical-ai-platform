import { cleanup, fireEvent, render as renderWithContext, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';

import type * as RobotModule from '@/entities/robot';

import { defaultRouteMorphConfig } from '@/shared/ui/route-morph';
import { BrandingContext } from '@/shared/config';

import { RobotCarouselPage } from './RobotCarouselPage';

function render(ui: ReactNode) {
  return renderWithContext(ui, {
    wrapper: ({ children }) => <BrandingContext.Provider value={{ productName: 'ROBOT Army TIGER+', shortName: 'TIGER+', logo: null }}>{children}</BrandingContext.Provider>,
  });
}

const mocks = vi.hoisted(() => ({ create: vi.fn(), select: vi.fn(), dispose: vi.fn(), pick: vi.fn(), present: vi.fn(), orbit: vi.fn() }));
vi.mock('@/entities/robot', async (importOriginal) => {
  const { RobotCompanyAvatar } = await importOriginal<typeof RobotModule>();
  const robots = [
    { id: 'a', displayName: '사족보행', serialNumber: 'A', modelId: 'rbq10' },
    { id: 'b', displayName: '양팔형', serialNumber: 'B', modelId: 'openarm' },
  ];
  return {
    RobotCompanyAvatar,
    useRobotCatalog: () => ({ status: 'ready', robots }),
    useRobotOperationalStatus: () => ({ status: 'ready', data: null }),
    useRobotOperationalStatuses: () => ({ status: 'ready', data: {}, streamIssuesByRobotId: {} }),
    RobotInfoOverview: () => <p>운영 정보</p>,
    createCarouselScene: () => { mocks.create(); return mocks; },
  };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function setup(path = '/control/monitoring/carousel') {
  return render(<MemoryRouter initialEntries={[path]}><RobotCarouselPage /></MemoryRouter>);
}
describe('robot carousel selection', () => {
  it('restores URL selection and wraps from the last robot to the first', () => {
    setup('/control/monitoring/carousel?robotId=b&siteId=test');
    expect(screen.getByRole('heading', { name: '양팔형' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '다음 로봇' }));
    expect(screen.getByRole('heading', { name: '사족보행' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '영상 관제' }).getAttribute('href')).toContain('/a?');
    expect(screen.getByRole('link', { name: '영상 관제' }).getAttribute('href')).toContain('siteId=test');
    expect(mocks.select).toHaveBeenLastCalledWith(0);
  });
  it('supports keyboard selection and disposes the shared scene on unmount', () => {
    const view = setup();
    fireEvent.keyDown(screen.getByRole('region', { name: '3D 로봇 선택' }), { key: 'ArrowLeft' });
    expect(screen.getByRole('heading', { name: '양팔형' })).toBeTruthy();
    view.unmount();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
  it('keeps the same scene alive across expansion and return', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const preview = document.createElement('div');
    document.body.append(preview);
    const view = render(<MemoryRouter initialEntries={['/control/monitoring?robotId=b']}><RobotCarouselPage immersive={false} preview={preview} /></MemoryRouter>);
    expect(mocks.present).toHaveBeenLastCalledWith(false, true, expect.any(Function));
    const host = view.container.querySelector<HTMLDivElement>('.robot-carousel-canvas')!;
    const stage = screen.getByRole('region', { name: '3D 로봇 선택' });
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(1076, 36, 328, 208));
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1440, 900));
    const animate = vi.fn(() => ({ cancel: vi.fn() }));
    Object.defineProperty(host, 'animate', { value: animate });
    view.rerender(<MemoryRouter><RobotCarouselPage immersive preview={preview} /></MemoryRouter>);
    expect(animate).toHaveBeenLastCalledWith([
      { left: '1076px', top: '36px', width: '328px', height: '208px' },
      { left: '0px', top: '0px', width: '1440px', height: '900px' },
    ], expect.objectContaining({ duration: defaultRouteMorphConfig.durationMs, easing: defaultRouteMorphConfig.easing }));
    expect(mocks.present).toHaveBeenLastCalledWith(true, false, expect.any(Function));
    view.rerender(<MemoryRouter><RobotCarouselPage immersive={false} preview={preview} /></MemoryRouter>);
    expect(mocks.present).toHaveBeenLastCalledWith(false, false, expect.any(Function));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).not.toHaveBeenCalled();
    view.unmount();
    preview.remove();
  });
  it('returns to the map with the current robot and site on Escape', () => {
    function Location() { return <output data-testid="location">{useLocation().pathname + useLocation().search}</output>; }
    render(<MemoryRouter initialEntries={['/control/monitoring/carousel?siteId=test&robotId=b']}><RobotCarouselPage /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '다음 로봇' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('location')).toHaveTextContent('/control/monitoring?siteId=test&robotId=a');
  });
  it('falls back to the first robot for an unknown URL selection', () => {
    setup('/control/monitoring/carousel?robotId=missing');
    expect(screen.getByRole('heading', { name: '사족보행' })).toBeTruthy();
    expect(mocks.select).toHaveBeenLastCalledWith(0);
  });
});
