import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext, type InterventionEvent } from '@/entities/flywheel';

import { DriveDetailPage, InterventionDetailPage } from './FlywheelCapturePages';
import { getDriveTimelineMarkers, getInterventionTimelineMarkers } from './drive-record-presentation';

const ports: ReturnType<typeof createInMemoryFlywheel>[] = [];
const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterAll(() => {
  if (scrollIntoView === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
});

async function fixture() {
  const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
  ports.push(port);
  const drive = await port.getDriveSession('drive-001');
  const item = await port.getIntervention('intervention-001');
  const session = await port.getSession('capture-m-001');
  if (drive === null || item === null || session === null) throw new Error('주행 검수 fixture가 없습니다.');
  return { port, drive, item, session };
}

function renderDetail(port: ReturnType<typeof createInMemoryFlywheel>, path = '/mlops/interventions/intervention-001') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FlywheelContext.Provider value={port}>
        <Routes>
          <Route path="/mlops/drives/:driveSessionId" element={<DriveDetailPage />} />
          <Route path="/mlops/interventions/:interventionId" element={<InterventionDetailPage />} />
        </Routes>
        <Link to="/mlops/interventions/second">다른 개입</Link>
      </FlywheelContext.Provider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  ports.splice(0).forEach((port) => port.dispose());
  vi.restoreAllMocks();
});

describe('주행·개입의 기록 표시', () => {
  it('개입 위치는 실제 시각으로 계산하고 진행 중 주행에 종료 이벤트를 만들지 않는다', async () => {
    const { drive, item } = await fixture();
    const markers = getDriveTimelineMarkers({ ...drive, startedAtMs: 1_000, endedAtMs: null, durationMs: 10_000 }, [{ ...item, startMs: 8_000 }]);
    expect(markers.find((marker) => marker.id === item.id)?.offsetPercent).toBe(70);
    expect(markers.some((marker) => marker.label === '주행 종료')).toBe(false);
  });

  it('제어 복귀는 수신 시각에 표시하고 미확정 종료·복귀는 생성하지 않는다', async () => {
    const { item } = await fixture();
    const markers = getInterventionTimelineMarkers({ ...item, startMs: 1_000, controlReturnedAtMs: 3_000, endMs: 6_000 });
    expect(markers.find((marker) => marker.id === 'control-returned')?.offsetPercent).toBe(40);
    expect(getInterventionTimelineMarkers({ ...item, controlReturnedAtMs: null, endMs: null }).map((marker) => marker.label)).toEqual(['기록 시작']);
  });

  it.each(['physical', 'simulation'] as const)('%s 주행에 연결된 영상이 없으면 대기 상태와 개입 링크를 표시한다', async (environment) => {
    const { port, session } = await fixture();
    vi.spyOn(port, 'getSession').mockResolvedValue({ ...session, provenance: { ...session.provenance, environment } });
    const { container } = renderDetail(port, '/mlops/drives/drive-001');
    expect(await screen.findByText('경로 좌표가 연결되지 않아 지도 궤적을 표시할 수 없습니다.')).toBeVisible();
    expect(screen.getByText('이 주행의 녹화 영상이 연결되지 않았습니다.')).toBeVisible();
    expect(container.querySelector('video')).toBeNull();
    expect(screen.queryByText(/37\.402|실내외 전환/u)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'intervention-001' })).toHaveAttribute('href', '/mlops/interventions/intervention-001');
  });

  it('개입 일부 조회 실패가 주행 정보를 숨기지 않고 다시 확인할 수 있게 한다', async () => {
    const { port } = await fixture();
    vi.spyOn(port, 'getIntervention').mockRejectedValueOnce(new Error('unavailable'));
    const user = userEvent.setup();
    renderDetail(port, '/mlops/drives/drive-001');
    expect(await screen.findByText('연결된 개입 1건을 불러오지 못했습니다.')).toBeVisible();
    expect(screen.getByRole('heading', { name: '주행 · route-a' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '개입 기록 다시 확인' }));
    expect(await screen.findByRole('link', { name: 'intervention-001' })).toBeVisible();
  });
});

describe('개입 검토 저장', () => {
  it('미확인·보통 선택과 빈 메모를 그대로 저장하고 실제 시간 경계를 유지한다', async () => {
    const { port, item } = await fixture();
    const original = { ...item, severity: 'high' as const, note: '기존 메모' };
    vi.spyOn(port, 'getIntervention').mockResolvedValue(original);
    const update = vi.spyOn(port, 'updateIntervention').mockImplementation((_id, input) => Promise.resolve({ ...original, ...input, status: 'reviewed' }));
    const user = userEvent.setup();
    const { container } = renderDetail(port);
    expect(await screen.findByRole('combobox', { name: '심각도' })).toHaveTextContent('높음');
    expect(container.querySelector('video')).toBeNull();
    screen.getByRole('combobox', { name: '원인' }).focus();
    await user.keyboard('{Enter}{End}{Enter}');
    screen.getByRole('combobox', { name: '심각도' }).focus();
    await user.keyboard('{Enter}{ArrowUp}{Enter}');
    await user.clear(screen.getByRole('textbox', { name: '검토 메모' }));
    await user.click(screen.getByRole('button', { name: '검토 저장' }));
    expect(await screen.findByText('검토 내용을 저장했습니다.')).toBeVisible();
    expect(update).toHaveBeenCalledWith(item.id, { startMs: item.startMs, endMs: item.endMs, reason: 'unknown', severity: 'medium', outcome: item.outcome, note: '' });
  });

  it('저장 중 중복 제출을 차단하고 실패하면 입력을 보존한다', async () => {
    const { port } = await fixture();
    let rejectSave: (error: Error) => void = () => undefined;
    const update = vi.spyOn(port, 'updateIntervention').mockImplementation(() => new Promise<InterventionEvent>((_complete, reject) => { rejectSave = reject; }));
    const user = userEvent.setup();
    renderDetail(port);
    const note = await screen.findByRole('textbox', { name: '검토 메모' });
    await user.clear(note);
    await user.type(note, '수정 중인 검토');
    const save = screen.getByRole('button', { name: '검토 저장' });
    await user.click(save);
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest('form') as HTMLFormElement);
    expect(update).toHaveBeenCalledTimes(1);
    await act(async () => { rejectSave(new Error('private backend detail')); await Promise.resolve(); });
    expect(await screen.findByRole('alert')).toHaveTextContent('검토 내용을 저장하지 못했습니다.');
    expect(note).toHaveValue('수정 중인 검토');
    expect(save).toBeEnabled();
    expect(screen.queryByText(/private backend/u)).not.toBeInTheDocument();
  });

  it('종료 시각이 없는 개입에는 임의 종료를 생성하지 않고 저장을 보류한다', async () => {
    const { port, item } = await fixture();
    vi.spyOn(port, 'getIntervention').mockResolvedValue({ ...item, endMs: null });
    const update = vi.spyOn(port, 'updateIntervention');
    const user = userEvent.setup();
    renderDetail(port);
    const note = await screen.findByRole('textbox', { name: '검토 메모' });
    await user.clear(note);
    await user.type(note, '종료 후 저장할 메모');
    const save = screen.getByRole('button', { name: '검토 저장' });
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest('form') as HTMLFormElement);
    expect(update).not.toHaveBeenCalled();
    expect(note).toHaveValue('종료 후 저장할 메모');
    expect(screen.queryByRole('link', { name: '개입 구간으로 데이터셋 만들기' })).not.toBeInTheDocument();
  });

  it('다른 개입으로 이동하면 이전 검토 초안을 섞지 않는다', async () => {
    const { port, item } = await fixture();
    let resolveSecond: (value: InterventionEvent) => void = () => undefined;
    const second = new Promise<InterventionEvent>((complete) => { resolveSecond = complete; });
    vi.spyOn(port, 'getIntervention').mockImplementation((id) => id === 'second' ? second : Promise.resolve(item));
    const user = userEvent.setup();
    renderDetail(port);
    const note = await screen.findByRole('textbox', { name: '검토 메모' });
    await user.clear(note);
    await user.type(note, '첫 번째 초안');
    await user.click(screen.getByRole('link', { name: '다른 개입' }));
    expect(screen.queryByRole('textbox', { name: '검토 메모' })).not.toBeInTheDocument();
    await act(async () => { resolveSecond({ ...item, id: 'second', note: '두 번째 개입 메모' }); await Promise.resolve(); });
    expect(await screen.findByDisplayValue('두 번째 개입 메모')).toBeVisible();
  });
});
