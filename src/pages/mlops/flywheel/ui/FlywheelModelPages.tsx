import { ChoiceCard } from '@/shared/ui/choice-card';
import { useCallback, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type ModelFamily,
  type ModelVersion,
  type EvaluationRun,
} from "@/entities/flywheel";
import { useRobotCatalog } from '@/entities/robot';
import { Button } from "@/shared/ui/button";
import { Chart } from "@/shared/ui/chart";
import { Input } from "@/shared/ui/input";
import { LogViewer } from "@/shared/ui/log-viewer";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { ResourceCard } from "@/shared/ui/resource-card";
import { Select } from "@/shared/ui/select";
import { StatTile } from "@/shared/ui/stat-tile";
import { Stepper } from "@/shared/ui/stepper";
import { SynchronizedPlayer } from "@/shared/ui/synchronized-player";
import {
  Table,
  TableSection,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Timeline } from "@/shared/ui/timeline";

import {
  loadCompute,
  loadDatasets,
  loadDeployments,
  loadEvaluations,
  loadInference,
  loadModels,
  loadTraining,
} from "./flywheel-loaders";
import {
  ActionLink,
  AsyncState,
  DefinitionGrid,
  DetailLink,
  StatusBadge,
} from "./flywheel-page-shared";
import { formatDateTime, VIDEO_SOURCE } from "./flywheel-page-utils";

function actionFailureMessage(): string {
  return "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}
const wizardSteps = [
  '컴퓨팅 자원',
  '모델',
  '데이터셋',
  '학습 설정',
  '검토',
].map((label) => ({ label }));

export function TrainingPage() {
  const query = useFlywheelQuery(loadTraining);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="학습 실행"
        description="Dataset 버전과 컴퓨팅 자원, 모델 설정으로 결정적인 학습 상태를 추적합니다."
        actions={
          <ActionLink to="/mlops/training/new">새 Training Run</ActionLink>
        }
      />
      <AsyncState query={query}>
        {(items) => (
          <Table aria-label="학습 실행 목록">
            <TableHeader>
              <TableRow>
                <TableHead>실행</TableHead>
                <TableHead>모델</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>단계</TableHead>
                <TableHead>생성 시각</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <DetailLink to={`/mlops/training/${run.id}`}>
                      {run.name}
                    </DetailLink>
                  </TableCell>
                  <TableCell>{run.modelFamily}</TableCell>
                  <TableCell>{run.datasetVersionId}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                  <TableCell>
                    {String(run.currentStep)} / {String(run.steps)}
                  </TableCell>
                  <TableCell>{formatDateTime(run.createdAtMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AsyncState>
    </div>
  );
}

export function NewTrainingPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const resources = useFlywheelQuery(loadCompute);
  const datasets = useFlywheelQuery(loadDatasets);
  const [step, setStep] = useState(0);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [modelFamily, setModelFamily] = useState<ModelFamily>("pi0");
  const [datasetId, setDatasetId] = useState('');
  const [batchSize, setBatchSize] = useState(8);
  const [steps, setSteps] = useState(10_000);
  const [learningRate, setLearningRate] = useState(0.000025);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const released = datasets.status === 'ready'
    ? datasets.data.filter((item) => item.status === 'released')
    : [];
  const selectedDataset = released.find((dataset) => dataset.id === datasetId);
  const resourcesValid = resources.status === 'ready' && resourceIds.length > 0
    && resourceIds.every((id) => resources.data.some((resource) => resource.id === id && resource.status !== 'busy'));
  const parametersValid = Number.isInteger(batchSize) && batchSize > 0
    && Number.isInteger(steps) && steps > 0 && Number.isFinite(learningRate) && learningRate > 0;
  const canCreate = resourcesValid && selectedDataset !== undefined && parametersValid;
  async function create(): Promise<void> {
    if (pendingRef.current || !canCreate || selectedDataset === undefined) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      const run = await port.createTrainingRun({
        projectId: selectedDataset.projectId,
        name: `${modelFamily} 학습 · ${new Date().toLocaleTimeString("ko-KR")}`,
        datasetVersionId: datasetId,
        modelFamily,
        computeResourceIds: resourceIds,
        batchSize,
        steps,
        learningRate,
      });
      void navigate(`/mlops/training/${run.id}`);
    } catch {
      setMessage('학습을 시작하지 못했습니다. 선택한 자원과 데이터셋 상태를 확인한 뒤 다시 시도하세요.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="학습 실행 생성"
        description="컴퓨팅 자원과 릴리스된 데이터셋을 선택해 새 학습을 시작하세요."
      />
      <Stepper activeIndex={step} items={wizardSteps} />
      <Panel title={wizardSteps[step]?.label ?? '검토'}>
        {step === 0 ? (
          <AsyncState query={resources}>
            {(items) => (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {items.map((resource) => (
                  <ResourceCard
                    key={resource.id}
                    label={resource.displayName}
                    modelName={resource.modelName}
                    memoryLabel={`${String(resource.memoryUsedMb)} / ${String(resource.memoryTotalMb)} MB`}
                    utilizationPercent={resource.utilizationPercent}
                    status={resource.status}
                    selected={resourceIds.includes(resource.id)}
                    onSelect={() =>
                      setResourceIds((current) =>
                        current.includes(resource.id)
                          ? current.filter((id) => id !== resource.id)
                          : [...current, resource.id],
                      )
                    }
                  />
                ))}
              </div>
            )}
          </AsyncState>
        ) : null}
        {step === 0 && resources.status === 'ready' && resourceIds.length > 0 && !resourcesValid ? (
          <div className="mt-4 grid justify-items-start gap-2">
            <p className="text-sm text-negative" role="alert">선택한 자원을 현재 사용할 수 없습니다. 사용 가능한 자원을 다시 선택하세요.</p>
            <Button onClick={() => setResourceIds([])} variant="secondary">자원 다시 선택</Button>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-4">
            {(["pi0", "pi05", "act", "custom"] as const).map((model) => (
              <ChoiceCard
                selected={modelFamily === model}
                className="min-h-36"
                key={model}
                onClick={() => setModelFamily(model)}
                title={model === 'pi05' ? 'π0.5' : model === 'pi0' ? 'π0' : model.toUpperCase()}
                description={model === 'act' ? '동작 시퀀스 학습' : model === 'custom' ? '사용자 정의 모델 계열' : '시각·언어·행동 모델'}
              />
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <AsyncState query={datasets} emptyMessage="릴리스된 데이터셋이 없습니다. 데이터셋을 구성하고 릴리스한 뒤 다시 확인하세요.">
            {() => released.length === 0 ? <p className="text-sm text-muted" role="status">릴리스된 데이터셋이 없습니다. 데이터셋을 릴리스한 뒤 다시 확인하세요.</p> : <div className="grid gap-3">
            {released.map((dataset) => (
              <ChoiceCard
                selected={datasetId === dataset.id}
                density="compact"
                key={dataset.id}
                onClick={() => setDatasetId(dataset.id)}
                title={dataset.name + ' v' + String(dataset.version)}
                description={'데이터 ' + String(dataset.unitRefs.length) + '개 · 릴리스됨'}
              />
            ))}
          </div>}
          </AsyncState>
        ) : null}
        {step === 3 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="배치 크기"
              min={1}
              step={1}
              type="number"
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value))}
            />
            <Input
              label="학습 단계 수"
              min={1}
              step={1}
              type="number"
              value={steps}
              onChange={(event) => setSteps(Number(event.target.value))}
            />
            <Input
              label="학습률"
              min={Number.MIN_VALUE}
              type="number"
              step="any"
              value={learningRate}
              onChange={(event) => setLearningRate(Number(event.target.value))}
            />
            <p className="text-sm text-muted md:col-span-2">새 실행으로 시작하며 체크포인트는 학습 서비스의 기본 정책에 따라 저장됩니다.</p>
          </div>
        ) : null}
        {step === 4 ? (
          <DefinitionGrid
            items={[
              { label: '컴퓨팅 자원', value: resourceIds.join(', ') },
              { label: '모델', value: modelFamily },
              { label: '데이터셋', value: selectedDataset?.name ?? '선택한 데이터셋을 다시 확인하세요.' },
              {
                label: '학습 설정',
                value: `배치 ${String(batchSize)} · ${String(steps)}단계 · 학습률 ${String(learningRate)}`,
              },
            ]}
          />
        ) : null}
        {message === null ? null : (
          <p className="mt-4 text-sm text-negative" role="alert">
            {message}
          </p>
        )}
        <div className="mt-6 flex justify-between gap-3">
          <Button
            disabled={step === 0 || pending}
            variant="secondary"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            이전
          </Button>
          {step < wizardSteps.length - 1 ? (
            <Button
              disabled={(step === 0 && !resourcesValid) || (step === 2 && selectedDataset === undefined) || (step === 3 && !parametersValid)}
              onClick={() =>
                setStep((value) => Math.min(wizardSteps.length - 1, value + 1))
              }
            >
              다음
            </Button>
          ) : (
            <Button disabled={!canCreate} isLoading={pending} onClick={() => void create()}>학습 실행 생성</Button>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function TrainingDetailPage() {
  const { trainingRunId = "" } = useParams();
  const port = useFlywheelPort();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getTrainingRun(trainingRunId),
    [trainingRunId],
  );
  const query = useFlywheelQuery(load);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="학습 실행을 찾을 수 없습니다.">
        {(run) => (
          <>
            <PageHeader
              title={run.name}
              eyebrow={`${run.modelFamily} · ${run.datasetVersionId}`}
              actions={
                <div className="flex gap-2">
                  <StatusBadge status={run.status} />
                  {run.status === "queued" || run.status === "running" ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void port
                          .cancelTrainingRun(run.id)
                          .then(() =>
                            setMessage("Training Run을 취소했습니다."),
                          )
                          .catch(() =>
                            setMessage(actionFailureMessage()),
                          )
                      }
                    >
                      취소
                    </Button>
                  ) : null}
                </div>
              }
            />
            {message === null ? null : (
              <Panel density="compact">
                <p role="status">{message}</p>
              </Panel>
            )}
            <div className="grid gap-4 md:grid-cols-4">
              <StatTile
                label="진행률"
                value={`${((run.currentStep / run.steps) * 100).toFixed(0)}%`}
              />
              <StatTile
                label="현재 단계"
                value={`${String(run.currentStep)} / ${String(run.steps)}`}
              />
              <StatTile
                label="최근 손실값"
                value={run.metrics.at(-1)?.loss.toFixed(3) ?? "—"}
              />
              <StatTile
                label="처리량"
                value={`${String(run.metrics.at(-1)?.throughput ?? 0)} samples/s`}
              />
            </div>
            <section className="grid gap-6 xl:grid-cols-2">
              <Panel title="손실값">
                <Chart
                  kind="line"
                  data={run.metrics.map((metric) => ({
                    label: String(metric.step),
                    value: metric.loss,
                  }))}
                  accessibleSummary={`현재 loss ${String(run.metrics.at(-1)?.loss ?? 0)}`}
                />
              </Panel>
              <Panel title="GPU / 설정">
                <DefinitionGrid
                  items={[
                    { label: "GPU", value: run.computeResourceIds.join(", ") },
                    { label: "Batch size", value: String(run.batchSize) },
                    { label: "Learning rate", value: String(run.learningRate) },
                    {
                      label: "Checkpoints",
                      value: run.checkpoints.join(", ") || "없음",
                    },
                  ]}
                />
              </Panel>
            </section>
            <Panel title="로그">
              <LogViewer lines={run.logs} />
            </Panel>
            {run.modelVersionId === null ? null : (
              <Panel title="생성된 Model Version">
                <ActionLink to={`/mlops/models/${run.modelVersionId}`}>
                  {run.modelVersionId} 열기
                </ActionLink>
              </Panel>
            )}
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function EvaluationsPage() {
  const query = useFlywheelQuery(loadEvaluations);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="평가 실행"
        description="모델 버전을 로봇 유형별 기준과 기준 모델로 검증합니다."
        actions={
          <ActionLink to="/mlops/evaluations/new">새 Evaluation</ActionLink>
        }
      />
      <AsyncState query={query}>
        {(items) => (
          <Table aria-label="평가 실행 목록">
            <TableHeader>
              <TableRow>
                <TableHead>실행</TableHead>
                <TableHead>모델</TableHead>
                <TableHead>로봇 / 환경</TableHead>
                <TableHead>점수</TableHead>
                <TableHead>통과 기준</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <DetailLink to={`/mlops/evaluations/${run.id}`}>
                      {run.name}
                    </DetailLink>
                  </TableCell>
                  <TableCell>{run.modelVersionId}</TableCell>
                  <TableCell>
                    {run.robotType} / {run.environment}
                  </TableCell>
                  <TableCell>{run.score?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell>{run.passThreshold.toFixed(1)}</TableCell>
                  <TableCell>
                    <StatusBadge status={run.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AsyncState>
    </div>
  );
}

export function NewEvaluationPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const models = useFlywheelQuery(loadModels);
  const [modelId, setModelId] = useState('');
  const [scenario, setScenario] = useState('');
  const [repetitions, setRepetitions] = useState(50);
  const [environment, setEnvironment] = useState<EvaluationRun['environment']>('simulation');
  const [threshold, setThreshold] = useState(80);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const availableModels = models.status === 'ready' ? models.data.filter((model) => model.stage !== 'archived') : [];
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const validParameters = scenario.trim().length > 0 && Number.isInteger(repetitions) && repetitions > 0
    && Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;

  async function create(): Promise<void> {
    if (pending || selectedModel === undefined || !validParameters) return;
    setMessage(null);
    setPending(true);
    try {
      const run = await port.createEvaluationRun({
        projectId: selectedModel.projectId,
        name: `${scenario.trim()} 평가`, modelVersionId: selectedModel.id,
        robotType: selectedModel.robotType, environment, scenario: scenario.trim(), repetitions, passThreshold: threshold,
      });
      await navigate(`/mlops/evaluations/${run.id}`);
    } catch {
      setMessage('평가를 시작하지 못했습니다. 입력한 설정을 확인하고 다시 시도하세요.');
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="평가 실행 생성"
        description="모델의 로봇 유형에 맞춰 시나리오와 반복 횟수, 평가 환경을 설정하세요."
      />
      <Panel>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Select
            label="모델 버전"
            disabled={pending || availableModels.length === 0}
            placeholder={models.status === 'loading' ? '모델을 불러오는 중' : '사용 가능한 모델 없음'}
            value={selectedModel?.id ?? ''}
            options={availableModels.map((model) => ({ label: `${model.name} v${String(model.version)}`, value: model.id }))}
            onValueChange={setModelId}
          />
          <DefinitionGrid items={[{ label: '로봇 유형', value: selectedModel === undefined ? '모델 선택 후 표시' : ({ humanoid: '휴머노이드', quadruped: '사족보행', mobile: '이동형' } as const)[selectedModel.robotType] }]} />
          {models.status === 'error' ? (
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-negative" role="alert">모델 목록을 불러오지 못했습니다.</p>
              <Button onClick={models.retry} variant="secondary">모델 다시 불러오기</Button>
            </div>
          ) : models.status === 'ready' && availableModels.length === 0 ? (
            <p className="md:col-span-2 text-sm text-muted" role="status">평가할 수 있는 모델이 없습니다. 학습을 완료하거나 모델 레지스트리를 확인하세요.</p>
          ) : null}
          <Input
            disabled={pending}
            label="시나리오"
            placeholder="평가할 작업과 조건"
            required
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          />
          <Input disabled={pending} label="반복 횟수" type="number" min={1} step={1} value={repetitions} onChange={(event) => setRepetitions(Number(event.target.value))} required />
          <Input
            disabled={pending}
            label="통과 기준 (%)"
            max={100}
            min={0}
            step={0.1}
            type="number"
            required
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <Select
            disabled={pending}
            label="환경"
            value={environment}
            options={[
              { label: "시뮬레이션", value: "simulation" },
              { label: "실물 로봇", value: "physical" },
              { label: "기록 재생", value: "replay" },
            ]}
            onValueChange={(value) => setEnvironment(value as EvaluationRun['environment'])}
          />
          {message === null ? null : (
            <p className="md:col-span-2 text-negative" role="alert">
              {message}
            </p>
          )}
          <Button className="md:col-span-2" disabled={selectedModel === undefined || !validParameters} isLoading={pending} type="submit">
            평가 실행
          </Button>
        </form>
      </Panel>
    </div>
  );
}

export function EvaluationDetailPage() {
  const { evaluationRunId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) =>
      port.getEvaluationRun(evaluationRunId),
    [evaluationRunId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="평가 실행을 찾을 수 없습니다."
      >
        {(run) => (
          <>
            <PageHeader
              title={run.name}
              eyebrow={`${run.robotType} · ${run.environment}`}
              actions={<StatusBadge status={run.status} />}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <StatTile
                label="점수"
                value={run.score?.toFixed(1) ?? "계산 중"}
              />
              <StatTile
                label="통과 기준"
                value={run.passThreshold.toFixed(1)}
              />
              <StatTile label="반복 횟수" value={String(run.repetitions)} />
            </div>
            <Panel title="평가 지표">
              <div className="grid gap-4 md:grid-cols-3">
                {run.metrics.map((metric) => (
                  <StatTile
                    key={metric.label}
                    label={metric.label}
                    value={`${String(metric.value)} ${metric.unit}`}
                  />
                ))}
              </div>
            </Panel>
            <Panel title="시나리오">
              <DefinitionGrid
                items={[
                  { label: "Model", value: run.modelVersionId },
                  {
                    label: "Baseline",
                    value: run.baselineModelVersionId ?? "없음",
                  },
                  { label: "Scenario", value: run.scenario },
                  { label: "Created", value: formatDateTime(run.createdAtMs) },
                ]}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function ModelsPage() {
  const query = useFlywheelQuery(loadModels);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="모델 레지스트리"
        description="Dataset·학습·평가 계보와 단계를 관리합니다."
      />
      <AsyncState query={query}>
        {(items) => (
          <Table aria-label="모델 버전 목록">
            <TableHeader>
              <TableRow>
                <TableHead>모델 버전</TableHead>
                <TableHead>계열</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>단계</TableHead>
                <TableHead>평가</TableHead>
                <TableHead>생성 시각</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <DetailLink to={`/mlops/models/${model.id}`}>
                      {model.name} v{String(model.version)}
                    </DetailLink>
                  </TableCell>
                  <TableCell>{model.modelFamily}</TableCell>
                  <TableCell>{model.robotType}</TableCell>
                  <TableCell>
                    <StatusBadge status={model.stage} />
                  </TableCell>
                  <TableCell>
                    {String(model.evaluationRunIds.length)} runs
                  </TableCell>
                  <TableCell>{formatDateTime(model.createdAtMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AsyncState>
    </div>
  );
}

export function ModelDetailPage() {
  const { modelVersionId = "" } = useParams();
  const port = useFlywheelPort();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getModelVersion(modelVersionId),
    [modelVersionId],
  );
  const query = useFlywheelQuery(load);
  const [message, setMessage] = useState<string | null>(null);
  async function stage(id: string, next: ModelVersion["stage"]): Promise<void> {
    try {
      await port.updateModelStage(id, next);
      setMessage(`Stage를 ${next}(으)로 변경했습니다.`);
    } catch {
      setMessage(actionFailureMessage());
    }
  }
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="모델 버전을 찾을 수 없습니다."
      >
        {(model) => (
          <>
            <PageHeader
              title={`${model.name} v${String(model.version)}`}
              eyebrow={`${model.modelFamily} · ${model.robotType}`}
              actions={<StatusBadge status={model.stage} />}
            />
            {message === null ? null : (
              <Panel density="compact">
                <p className="text-sm font-semibold" role="status">
                  {message}
                </p>
              </Panel>
            )}
            <Panel title="단계 관리">
              <div className="flex flex-wrap gap-2">
                {(
                  ["candidate", "staging", "production", "archived"] as const
                ).map((next) => (
                  <Button
                    key={next}
                    variant={model.stage === next ? "primary" : "secondary"}
                    onClick={() => void stage(model.id, next)}
                  >
                    {next}
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted">
                통과한 Evaluation이 없으면 Production 승격이 차단됩니다.
              </p>
            </Panel>
            <Panel title="계보">
              <DefinitionGrid
                items={[
                  {
                    label: "Dataset Version",
                    value: (
                      <DetailLink
                        to={`/mlops/datasets/${model.datasetVersionId}`}
                      >
                        {model.datasetVersionId}
                      </DetailLink>
                    ),
                  },
                  {
                    label: "Training Run",
                    value: (
                      <DetailLink to={`/mlops/training/${model.trainingRunId}`}>
                        {model.trainingRunId}
                      </DetailLink>
                    ),
                  },
                  {
                    label: "Evaluation Runs",
                    value: model.evaluationRunIds.join(", ") || "없음",
                  },
                  {
                    label: "Artifact",
                    value: `${(model.artifactSizeBytes / 1_000_000_000).toFixed(2)} GB`,
                  },
                ]}
              />
            </Panel>
            <div className="flex gap-2">
              <ActionLink to={`/mlops/evaluations/new?model=${model.id}`}>
                Evaluation 생성
              </ActionLink>
              {model.stage === "production" ? (
                <ActionLink to={`/mlops/deployments/new?model=${model.id}`}>
                  Deployment 생성
                </ActionLink>
              ) : null}
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function DeploymentsPage() {
  const query = useFlywheelQuery(loadDeployments);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="배포"
        description="운영 모델의 로봇 호환성과 단계적 배포, 복구 상태를 추적합니다."
        actions={
          <ActionLink to="/mlops/deployments/new">새 Deployment</ActionLink>
        }
      />
      <AsyncState query={query}>
        {(items) => (
          <Table aria-label="배포 목록">
            <TableHeader>
              <TableRow>
                <TableHead>배포</TableHead>
                <TableHead>모델</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>배포 비율</TableHead>
                <TableHead>지연 시간</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <DetailLink to={`/mlops/deployments/${item.id}`}>
                      {item.name}
                    </DetailLink>
                  </TableCell>
                  <TableCell>{item.modelVersionId}</TableCell>
                  <TableCell>{item.robotIds.join(", ")}</TableCell>
                  <TableCell>{String(item.rolloutPercent)}%</TableCell>
                  <TableCell>
                    {item.latencyMs === null
                      ? "—"
                      : `${String(item.latencyMs)} ms`}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AsyncState>
    </div>
  );
}

export function NewDeploymentPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const models = useFlywheelQuery(loadModels);
  const robots = useRobotCatalog();
  const production =
    models.status === "ready"
      ? models.data.filter((item) => item.stage === "production")
      : [];
  const [modelId, setModelId] = useState('');
  const [robotId, setRobotId] = useState('');
  const [runtime, setRuntime] = useState('TensorRT Edge');
  const [controlFrequencyHz, setControlFrequencyHz] = useState(20);
  const [rolloutPercent, setRolloutPercent] = useState(25);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedModel = production.find((model) => model.id === modelId) ?? production[0];
  const compatibleRobots = robots.robots.filter((robot) => selectedModel !== undefined && robot.robotType === selectedModel.robotType);
  const selectedRobot = compatibleRobots.find((robot) => robot.id === robotId) ?? compatibleRobots[0];
  const canCreate = selectedModel !== undefined && selectedRobot !== undefined
    && Number.isFinite(controlFrequencyHz) && controlFrequencyHz > 0
    && Number.isFinite(rolloutPercent) && rolloutPercent > 0 && rolloutPercent <= 100;

  async function create(): Promise<void> {
    if (pendingRef.current || !canCreate || selectedModel === undefined || selectedRobot === undefined) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    try {
      const deployment = await port.createDeployment({
        projectId: selectedModel.projectId, name: `${selectedModel.name} 배포`,
        modelVersionId: selectedModel.id, robotIds: [selectedRobot.id], runtime, controlFrequencyHz, rolloutPercent,
      });
      await navigate(`/mlops/deployments/${deployment.id}`);
    } catch {
      setMessage('배포를 시작하지 못했습니다. 모델과 대상 로봇 상태를 확인한 뒤 다시 시도하세요.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="배포 생성"
        description="운영 모델과 같은 유형의 로봇을 선택하고 실행 환경과 배포 비율을 설정하세요."
      />
      <Panel>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Select
            disabled={pending || production.length === 0}
            label="운영 모델"
            placeholder={models.status === 'loading' ? '모델을 불러오는 중' : '운영 모델 없음'}
            value={selectedModel?.id ?? ''}
            options={production.map((model) => ({
              label: `${model.name} v${String(model.version)}`,
              value: model.id,
            }))}
            onValueChange={(value) => { setModelId(value); setRobotId(''); }}
          />
          <Select
            disabled={pending || compatibleRobots.length === 0}
            label="대상 로봇"
            placeholder={robots.status === 'loading' ? '로봇을 불러오는 중' : '같은 유형의 로봇 없음'}
            value={selectedRobot?.id ?? ''}
            options={compatibleRobots.map((robot) => ({ label: robot.displayName, value: robot.id }))}
            onValueChange={setRobotId}
          />
          <Select
            disabled={pending}
            label="런타임"
            value={runtime}
            options={[
              { label: 'TensorRT Edge', value: 'TensorRT Edge' },
              { label: 'ONNX Runtime', value: 'ONNX Runtime' },
            ]}
            onValueChange={setRuntime}
          />
          <Input
            disabled={pending}
            label="제어 주기 (Hz)"
            min={Number.MIN_VALUE}
            step="any"
            required
            type="number"
            value={controlFrequencyHz}
            onChange={(event) => setControlFrequencyHz(Number(event.target.value))}
          />
          <Input disabled={pending} label="배포 비율 (%)" type="number" min={Number.MIN_VALUE} max={100} step="any" value={rolloutPercent} onChange={(event) => setRolloutPercent(Number(event.target.value))} required />
          {models.status === 'error' || robots.status === 'error' ? (
            <div className="md:col-span-2 grid justify-items-start gap-3">
              <p className="text-sm text-negative" role="alert">배포 대상 정보를 불러오지 못했습니다.</p>
              <Button variant="secondary" onClick={() => { if (models.status === 'error') models.retry(); if (robots.status === 'error') robots.retry(); }}>배포 대상 다시 불러오기</Button>
            </div>
          ) : models.status === 'ready' && robots.status === 'ready' && (selectedModel === undefined || selectedRobot === undefined) ? (
            <p className="md:col-span-2 text-sm text-muted" role="status">{selectedModel === undefined ? '운영 단계의 모델이 없습니다. 모델 레지스트리에서 운영 모델을 지정하세요.' : '모델과 같은 유형의 로봇이 없습니다. 로봇 등록 정보와 유형을 확인하세요.'}</p>
          ) : null}
          {message === null ? null : (
            <p className="md:col-span-2 text-negative" role="alert">
              {message}
            </p>
          )}
          <Button className="md:col-span-2" disabled={!canCreate} isLoading={pending} type="submit">
            배포 시작
          </Button>
        </form>
      </Panel>
    </div>
  );
}

export function DeploymentDetailPage() {
  const { deploymentId = "" } = useParams();
  const port = useFlywheelPort();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getDeployment(deploymentId),
    [deploymentId],
  );
  const query = useFlywheelQuery(load);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="배포를 찾을 수 없습니다.">
        {(item) => (
          <>
            <PageHeader
              title={item.name}
              eyebrow={item.runtime}
              actions={
                <div className="flex gap-2">
                  <StatusBadge status={item.status} />
                  {item.status === "active" || item.status === "partial" ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void port
                          .rollbackDeployment(item.id)
                          .then(() => setMessage("Rollback을 시작했습니다."))
                          .catch(() =>
                            setMessage(actionFailureMessage()),
                          )
                      }
                    >
                      Rollback
                    </Button>
                  ) : null}
                </div>
              }
            />
            {message === null ? null : (
              <Panel density="compact">
                <p role="status">{message}</p>
              </Panel>
            )}
            <div className="grid gap-4 md:grid-cols-4">
              <StatTile
                label="배포 비율"
                value={`${String(item.rolloutPercent)}%`}
              />
              <StatTile
                label="지연 시간"
                value={
                  item.latencyMs === null
                    ? "측정 중"
                    : `${String(item.latencyMs)} ms`
                }
              />
              <StatTile
                label="동작 주기 (Hz)"
                value={item.actionRateHz?.toFixed(1) ?? "—"}
              />
              <StatTile label="대상" value={String(item.robotIds.length)} />
            </div>
            <Panel title="배포 단계">
              <Timeline
                durationLabel={item.status}
                markers={[
                  {
                    id: "validate",
                    label: "Compatibility",
                    offsetPercent: 15,
                    tone: "positive",
                  },
                  {
                    id: "transfer",
                    label: "Artifact transfer",
                    offsetPercent: 44,
                    tone: item.status === "deploying" ? "info" : "positive",
                  },
                  {
                    id: "activate",
                    label: "Runtime activate",
                    offsetPercent: 72,
                    tone: item.status === "active" ? "positive" : "info",
                  },
                  {
                    id: "verify",
                    label: "Canary inference",
                    offsetPercent: 95,
                    tone: item.status === "failed" ? "negative" : "positive",
                  },
                ]}
              />
            </Panel>
            <Panel title="모델 / 로봇">
              <DefinitionGrid
                items={[
                  {
                    label: "Model",
                    value: (
                      <DetailLink to={`/mlops/models/${item.modelVersionId}`}>
                        {item.modelVersionId}
                      </DetailLink>
                    ),
                  },
                  { label: "Robots", value: item.robotIds.join(", ") },
                  {
                    label: "Control frequency",
                    value: `${String(item.controlFrequencyHz)} Hz`,
                  },
                  { label: "Created", value: formatDateTime(item.createdAtMs) },
                ]}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function InferencePage() {
  const query = useFlywheelQuery(loadInference);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="추론 세션"
        description="모델·배포·로봇·작업·결과·개입을 조회합니다."
      />
      <AsyncState query={query}>
        {(items) => (
          <Table aria-label="추론 세션 목록">
            <TableHeader>
              <TableRow>
                <TableHead>추론</TableHead>
                <TableHead>모델 / 배포</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>결과</TableHead>
                <TableHead>지연 시간</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <DetailLink to={`/mlops/inference/${item.id}`}>
                      {item.task}
                    </DetailLink>
                    <span className="mt-1 block text-xs text-muted">
                      {item.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.modelVersionId}
                    <br />
                    <span className="text-xs text-muted">
                      {item.deploymentId}
                    </span>
                  </TableCell>
                  <TableCell>{item.robotId}</TableCell>
                  <TableCell>
                    <StatusBadge status={item.outcome ?? "pending"} />
                  </TableCell>
                  <TableCell>{String(item.averageLatencyMs)} ms</TableCell>
                  <TableCell>
                    <StatusBadge status={item.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </AsyncState>
    </div>
  );
}

export function InferenceDetailPage() {
  const { inferenceSessionId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) =>
      port.getInferenceSession(inferenceSessionId),
    [inferenceSessionId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="추론 세션을 찾을 수 없습니다."
      >
        {(item) => (
          <>
            <PageHeader
              title={item.task}
              eyebrow={`${item.modelVersionId} · ${item.robotId}`}
              actions={<StatusBadge status={item.outcome ?? item.status} />}
            />
            <Panel title="영상 / 상태 / 프롬프트">
              <SynchronizedPlayer
                sources={[
                  { id: "vision", label: "Vision input", src: VIDEO_SOURCE },
                  {
                    id: "response",
                    label: "Robot response",
                    src: VIDEO_SOURCE,
                  },
                ]}
              />
            </Panel>
            <div className="grid gap-4 md:grid-cols-3">
              <StatTile
                label="평균 지연 시간"
                value={`${String(item.averageLatencyMs)} ms`}
              />
              <StatTile
                label="동작 주기"
                value={`${String(item.actionRateHz)} Hz`}
              />
              <StatTile label="단계 수" value={String(item.steps.length)} />
            </div>
            <TableSection title="예측 동작 / 로봇 응답">
              <Table aria-label="추론 단계 목록">
                <TableHeader>
                  <TableRow>
                    <TableHead>시각</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>예측 동작</TableHead>
                    <TableHead>신뢰도</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.steps.map((step) => (
                    <TableRow key={`${item.id}-${String(step.timestampMs)}`}>
                      <TableCell>{formatDateTime(step.timestampMs)}</TableCell>
                      <TableCell>{step.prompt}</TableCell>
                      <TableCell>{step.action}</TableCell>
                      <TableCell>
                        {(step.confidence * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableSection>
            <Panel title="실패 / 개입">
              <p className="text-sm text-muted">
                {item.interventionId === null
                  ? "실패 또는 Intervention이 감지되지 않았습니다."
                  : `연결된 Intervention: ${item.interventionId}`}
              </p>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}
