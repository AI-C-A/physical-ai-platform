import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createInMemoryFlywheel, FlywheelContext } from '@/entities/flywheel';
import { createInMemoryRobotCatalog, RobotCatalogContext } from '@/entities/robot';

import { NewDeploymentPage, NewEvaluationPage, NewTrainingPage } from './FlywheelModelPages';

const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn(), writable: true }));
afterAll(() => {
  if (scrollIntoViewDescriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoViewDescriptor);
});

function renderEvaluation(port: ReturnType<typeof createInMemoryFlywheel>) {
  render(
    <FlywheelContext.Provider value={port}>
      <MemoryRouter initialEntries={['/mlops/evaluations/new']}>
        <Routes>
          <Route path="/mlops/evaluations/new" element={<NewEvaluationPage />} />
          <Route path="/mlops/evaluations/:id" element={<p>평가 생성 완료</p>} />
        </Routes>
      </MemoryRouter>
    </FlywheelContext.Provider>,
  );
}

describe('평가 실행 구성', () => {
  afterEach(() => vi.restoreAllMocks());

  it('조회 실패를 안전하게 표시하고 모델을 다시 불러온 뒤 실제 입력값으로 평가한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    try {
      vi.spyOn(port, 'listModelVersions').mockRejectedValueOnce(new Error('network unavailable'));
      const create = vi.spyOn(port, 'createEvaluationRun');
      renderEvaluation(port);
      expect(await screen.findByRole('alert')).toHaveTextContent('모델 목록을 불러오지 못했습니다.');
      expect(screen.getByRole('button', { name: '평가 실행' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: '모델 다시 불러오기' }));
      await user.type(screen.getByRole('textbox', { name: '시나리오' }), '야간 분류 평가');
      await user.clear(screen.getByRole('spinbutton', { name: '반복 횟수' }));
      await user.type(screen.getByRole('spinbutton', { name: '반복 횟수' }), '12');
      screen.getByRole('combobox', { name: '환경' }).focus();
      await user.keyboard('{ArrowDown}');
      await user.click(screen.getByRole('option', { name: '기록 재생' }));
      await user.click(screen.getByRole('button', { name: '평가 실행' }));

      expect(await screen.findByText('평가 생성 완료')).toBeVisible();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        scenario: '야간 분류 평가', repetitions: 12, environment: 'replay', robotType: 'humanoid',
      }));
    } finally { port.dispose(); }
  });

  it('모델이 없으면 실행하지 않는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      vi.spyOn(port, 'listModelVersions').mockResolvedValue([]);
      const create = vi.spyOn(port, 'createEvaluationRun');
      renderEvaluation(port);
      expect(await screen.findByRole('status')).toHaveTextContent('평가할 수 있는 모델이 없습니다.');
      expect(screen.getByRole('button', { name: '평가 실행' })).toBeDisabled();
      expect(create).not.toHaveBeenCalled();
    } finally { port.dispose(); }
  });
});

describe('학습과 배포 설정', () => {
  afterEach(() => vi.restoreAllMocks());

  it('학습은 실제 자원과 데이터셋 선택을 검증하고 숫자 입력을 유지하며 중복 실행을 막는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const user = userEvent.setup();
    let rejectCreate: ((error: Error) => void) | undefined;
    try {
      vi.spyOn(port, 'listComputeResources').mockResolvedValue([
        { id: 'gpu-test', displayName: '검증 GPU', modelName: 'Test GPU', memoryUsedMb: 0, memoryTotalMb: 100, utilizationPercent: 0, status: 'idle' },
      ]);
      const create = vi.spyOn(port, 'createTrainingRun').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCreate = reject; }));
      render(
        <FlywheelContext.Provider value={port}>
          <MemoryRouter initialEntries={['/mlops/training/new']}>
            <Routes>
              <Route path="/mlops/training/new" element={<NewTrainingPage />} />
              <Route path="/mlops/training/:id" element={<p>학습 생성 완료</p>} />
            </Routes>
          </MemoryRouter>
        </FlywheelContext.Provider>,
      );
      expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
      await user.click(await screen.findByRole('button', { name: /검증 GPU/u }));
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.click(screen.getByRole('button', { name: /ACT/u }));
      await user.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
      await user.click(await screen.findByRole('button', { name: /Sorting Generalist/u }));
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.clear(screen.getByRole('spinbutton', { name: '배치 크기' }));
      expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
      await user.type(screen.getByRole('spinbutton', { name: '배치 크기' }), '16');
      await user.clear(screen.getByRole('spinbutton', { name: '학습 단계 수' }));
      await user.type(screen.getByRole('spinbutton', { name: '학습 단계 수' }), '240');
      await user.clear(screen.getByRole('spinbutton', { name: '학습률' }));
      await user.type(screen.getByRole('spinbutton', { name: '학습률' }), '0.002');
      expect(screen.queryByRole('spinbutton', { name: 'save_interval' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.dblClick(screen.getByRole('button', { name: '학습 실행 생성' }));
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        computeResourceIds: ['gpu-test'], datasetVersionId: 'dataset-h-v3', modelFamily: 'act', batchSize: 16, steps: 240, learningRate: 0.002,
      }));
      await act(async () => { rejectCreate?.(new Error('service unavailable')); await Promise.resolve(); });
      expect(await screen.findByRole('alert')).toHaveTextContent('학습을 시작하지 못했습니다.');
      await user.click(screen.getByRole('button', { name: '이전' }));
      expect(screen.getByRole('spinbutton', { name: '배치 크기' })).toHaveValue(16);
      await user.click(screen.getByRole('button', { name: '다음' }));
      await user.click(screen.getByRole('button', { name: '학습 실행 생성' }));
      expect(await screen.findByText('학습 생성 완료')).toBeVisible();
    } finally { port.dispose(); }
  });

  it('배포 대상 조회를 재시도하고 실제 로봇·런타임·제어 주기·비율로 한 번만 제출한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    const robotPort = createInMemoryRobotCatalog([]);
    const user = userEvent.setup();
    let rejectCreate: ((error: Error) => void) | undefined;
    try {
      vi.spyOn(robotPort, 'listRobots')
        .mockRejectedValueOnce(new Error('catalog unavailable'))
        .mockResolvedValue([{ id: 'robot-verified', displayName: '검증 로봇', robotType: 'humanoid', name: null, serialNumber: null, integrationProfileId: 'test' }]);
      const create = vi.spyOn(port, 'createDeployment').mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCreate = reject; }));
      render(
        <RobotCatalogContext.Provider value={robotPort}>
          <FlywheelContext.Provider value={port}>
            <MemoryRouter initialEntries={['/mlops/deployments/new']}>
              <Routes>
                <Route path="/mlops/deployments/new" element={<NewDeploymentPage />} />
                <Route path="/mlops/deployments/:id" element={<p>배포 생성 완료</p>} />
              </Routes>
            </MemoryRouter>
          </FlywheelContext.Provider>
        </RobotCatalogContext.Provider>,
      );
      await user.click(await screen.findByRole('button', { name: '배포 대상 다시 불러오기' }));
      await waitFor(() => expect(screen.getByRole('combobox', { name: '대상 로봇' })).toHaveTextContent('검증 로봇'));
      screen.getByRole('combobox', { name: '런타임' }).focus();
      await user.keyboard('{ArrowDown}');
      await user.click(screen.getByRole('option', { name: 'ONNX Runtime' }));
      await user.clear(screen.getByRole('spinbutton', { name: '제어 주기 (Hz)' }));
      await user.type(screen.getByRole('spinbutton', { name: '제어 주기 (Hz)' }), '60');
      await user.clear(screen.getByRole('spinbutton', { name: '배포 비율 (%)' }));
      await user.type(screen.getByRole('spinbutton', { name: '배포 비율 (%)' }), '101');
      expect(screen.getByRole('button', { name: '배포 시작' })).toBeDisabled();
      await user.clear(screen.getByRole('spinbutton', { name: '배포 비율 (%)' }));
      await user.type(screen.getByRole('spinbutton', { name: '배포 비율 (%)' }), '40');
      expect(screen.queryByRole('spinbutton', { name: '복구 지연 시간 (ms)' })).not.toBeInTheDocument();
      await user.dblClick(screen.getByRole('button', { name: '배포 시작' }));
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ robotIds: ['robot-verified'], runtime: 'ONNX Runtime', controlFrequencyHz: 60, rolloutPercent: 40 }));
      await act(async () => { rejectCreate?.(new Error('service unavailable')); await Promise.resolve(); });
      expect(await screen.findByRole('alert')).toHaveTextContent('배포를 시작하지 못했습니다.');
      expect(screen.getByRole('spinbutton', { name: '제어 주기 (Hz)' })).toHaveValue(60);
      expect(screen.getByRole('combobox', { name: '런타임' })).toHaveTextContent('ONNX Runtime');
      await user.click(screen.getByRole('button', { name: '배포 시작' }));
      expect(await screen.findByText('배포 생성 완료')).toBeVisible();
    } finally { port.dispose(); }
  });
});
