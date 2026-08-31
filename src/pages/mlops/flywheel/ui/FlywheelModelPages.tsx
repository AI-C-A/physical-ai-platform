import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type ModelFamily,
  type ModelVersion,
  type RobotType,
} from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
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
  "Compute",
  "Model",
  "Dataset Version",
  "Hyperparameters",
  "Resume",
  "Review",
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
          <Panel>
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
          </Panel>
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
  const [resourceIds, setResourceIds] = useState<string[]>(["gpu-0"]);
  const [modelFamily, setModelFamily] = useState<ModelFamily>("pi0");
  const [datasetId, setDatasetId] = useState("dataset-h-v3");
  const [batchSize, setBatchSize] = useState(8);
  const [steps, setSteps] = useState(10_000);
  const [learningRate, setLearningRate] = useState(0.000025);
  const [message, setMessage] = useState<string | null>(null);
  async function create(): Promise<void> {
    try {
      const run = await port.createTrainingRun({
        projectId: "project-tiger",
        name: `${modelFamily} finetune · ${new Date().toLocaleTimeString("ko-KR")}`,
        datasetVersionId: datasetId,
        modelFamily,
        computeResourceIds: resourceIds,
        batchSize,
        steps,
        learningRate,
      });
      void navigate(`/mlops/training/${run.id}`);
    } catch {
      setMessage(actionFailureMessage());
    }
  }
  const released =
    datasets.status === "ready"
      ? datasets.data.filter((item) => item.status === "released")
      : [];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="학습 실행 생성"
        description="컴퓨팅 자원 → 모델 → Dataset 버전 → 하이퍼파라미터 → 재개 → 검토 순서로 설정합니다."
      />
      <Stepper activeIndex={step} items={wizardSteps} />
      <Panel title={wizardSteps[step]?.label ?? "Review"}>
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
        {step === 1 ? (
          <div className="grid gap-3 md:grid-cols-4">
            {(["pi0", "pi05", "act", "custom"] as const).map((model) => (
              <button
                aria-pressed={modelFamily === model}
                className={
                  modelFamily === model
                    ? "min-h-36 rounded-[var(--design-radius-surface)] bg-action-secondary-active ring-2 ring-focus p-5 text-left"
                    : "min-h-36 rounded-[var(--design-radius-surface)] bg-layer-base p-5 text-left"
                }
                key={model}
                onClick={() => setModelFamily(model)}
                type="button"
              >
                <strong className="text-xl">
                  {model === "pi05"
                    ? "π0.5"
                    : model === "pi0"
                      ? "π0"
                      : model.toUpperCase()}
                </strong>
                <p className="mt-3 text-sm text-muted">
                  {model === "act"
                    ? "고정밀 Action Chunking"
                    : model === "custom"
                      ? "Custom image와 startup parameters"
                      : "General-purpose VLA policy"}
                </p>
              </button>
            ))}
          </div>
        ) : null}
        {step === 2 ? (
          <div className="grid gap-3">
            {released.map((dataset) => (
              <button
                className={
                  datasetId === dataset.id
                    ? "rounded-[var(--design-radius-control)] bg-action-secondary-active ring-2 ring-focus p-4 text-left"
                    : "rounded-[var(--design-radius-control)] bg-layer-base p-4 text-left"
                }
                key={dataset.id}
                onClick={() => setDatasetId(dataset.id)}
                type="button"
              >
                <strong>
                  {dataset.name} v{String(dataset.version)}
                </strong>
                <p className="mt-1 text-sm text-muted">
                  {dataset.kind} · {String(dataset.unitRefs.length)} units ·
                  Released
                </p>
              </button>
            ))}
          </div>
        ) : null}
        {step === 3 ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="batch_size"
              type="number"
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value))}
            />
            <Input
              label="steps"
              type="number"
              value={steps}
              onChange={(event) => setSteps(Number(event.target.value))}
            />
            <Input
              label="learning_rate"
              type="number"
              step="0.000001"
              value={learningRate}
              onChange={(event) => setLearningRate(Number(event.target.value))}
            />
            <Input label="save_interval" type="number" defaultValue="5000" />
          </div>
        ) : null}
        {step === 4 ? (
          <div className="grid gap-4">
            <Select
              label="기존 Training Run"
              value="none"
              options={[
                { label: "새로 시작", value: "none" },
                { label: "training-001", value: "training-001" },
              ]}
              onValueChange={() => undefined}
            />
            <Select
              label="Checkpoint"
              value="none"
              options={[
                { label: "선택 안 함", value: "none" },
                { label: "checkpoint-5000", value: "checkpoint-5000" },
              ]}
              onValueChange={() => undefined}
            />
          </div>
        ) : null}
        {step === 5 ? (
          <DefinitionGrid
            items={[
              { label: "Compute", value: resourceIds.join(", ") },
              { label: "Model", value: modelFamily },
              { label: "Dataset", value: datasetId },
              {
                label: "Hyperparameters",
                value: `batch ${String(batchSize)} · ${String(steps)} steps · lr ${String(learningRate)}`,
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
            disabled={step === 0}
            variant="secondary"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
          >
            이전
          </Button>
          {step < wizardSteps.length - 1 ? (
            <Button
              disabled={step === 0 && resourceIds.length === 0}
              onClick={() =>
                setStep((value) => Math.min(wizardSteps.length - 1, value + 1))
              }
            >
              다음
            </Button>
          ) : (
            <Button onClick={() => void create()}>학습 실행 생성</Button>
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
          <Panel>
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
          </Panel>
        )}
      </AsyncState>
    </div>
  );
}

export function NewEvaluationPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const models = useFlywheelQuery(loadModels);
  const [modelId, setModelId] = useState("model-pi0-v3");
  const [robotType, setRobotType] = useState<RobotType>("humanoid");
  const [scenario, setScenario] = useState("Mixed lighting regression");
  const [threshold, setThreshold] = useState(80);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="평가 실행 생성"
        description="휴머노이드와 Mobility에 맞는 지표와 통과 기준을 적용합니다."
      />
      <Panel>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void port
              .createEvaluationRun({
                projectId: "project-tiger",
                name: `${scenario} evaluation`,
                modelVersionId: modelId,
                robotType,
                environment: "simulation",
                scenario,
                repetitions: 50,
                passThreshold: threshold,
              })
              .then((run) => navigate(`/mlops/evaluations/${run.id}`))
              .catch(() => setMessage(actionFailureMessage()));
          }}
        >
          <Select
            label="모델 버전"
            value={modelId}
            options={
              models.status === "ready"
                ? models.data.map((model) => ({
                    label: `${model.name} v${String(model.version)}`,
                    value: model.id,
                  }))
                : [{ label: "Model 없음", value: "" }]
            }
            onValueChange={setModelId}
          />
          <Select
            label="로봇 유형"
            value={robotType}
            options={["humanoid", "quadruped", "mobile"].map((value) => ({
              label: value,
              value,
            }))}
            onValueChange={(value) => setRobotType(value as RobotType)}
          />
          <Input
            label="시나리오"
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          />
          <Input label="반복 횟수" type="number" defaultValue="50" />
          <Input
            label="통과 기준 (%)"
            type="number"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <Select
            label="환경"
            value="simulation"
            options={[
              { label: "Simulation", value: "simulation" },
              { label: "Physical", value: "physical" },
              { label: "Replay", value: "replay" },
            ]}
            onValueChange={() => undefined}
          />
          {message === null ? null : (
            <p className="md:col-span-2 text-negative" role="alert">
              {message}
            </p>
          )}
          <Button className="md:col-span-2" type="submit">
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
          <Panel>
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
          </Panel>
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
          <Panel>
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
          </Panel>
        )}
      </AsyncState>
    </div>
  );
}

export function NewDeploymentPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const models = useFlywheelQuery(loadModels);
  const production =
    models.status === "ready"
      ? models.data.filter((item) => item.stage === "production")
      : [];
  const [modelId, setModelId] = useState("model-pi0-v3");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="배포 생성"
        description="호환성 검증 후 Production Model을 단계적으로 rollout합니다."
      />
      <Panel>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void port
              .createDeployment({
                projectId: "project-tiger",
                name: "TIGER canary deployment",
                modelVersionId: modelId,
                robotIds: ["robot-001"],
                runtime: "TensorRT Edge",
                controlFrequencyHz: 20,
                rolloutPercent: 25,
              })
              .then((item) => navigate(`/mlops/deployments/${item.id}`))
              .catch(() => setMessage(actionFailureMessage()));
          }}
        >
          <Select
            label="운영 모델"
            value={modelId}
            options={production.map((model) => ({
              label: `${model.name} v${String(model.version)}`,
              value: model.id,
            }))}
            onValueChange={setModelId}
          />
          <Select
            label="대상 로봇"
            value="robot-001"
            options={[{ label: "robot-001 · compatible", value: "robot-001" }]}
            onValueChange={() => undefined}
          />
          <Select
            label="Runtime"
            value="tensorrt"
            options={[
              { label: "TensorRT Edge", value: "tensorrt" },
              { label: "ONNX Runtime", value: "onnx" },
            ]}
            onValueChange={() => undefined}
          />
          <Input
            label="제어 주기 (Hz)"
            type="number"
            defaultValue="20"
          />
          <Input label="배포 비율 (%)" type="number" defaultValue="25" />
          <Input
            label="복구 지연 시간 (ms)"
            type="number"
            defaultValue="80"
          />
          <Panel className="md:col-span-2" layer="base" title="호환성">
            <div className="flex flex-wrap gap-2">
              <Badge tone="positive">로봇 유형 호환</Badge>
              <Badge tone="positive">Runtime 사용 가능</Badge>
              <Badge tone="positive">평가 통과</Badge>
            </div>
          </Panel>
          {message === null ? null : (
            <p className="md:col-span-2 text-negative" role="alert">
              {message}
            </p>
          )}
          <Button className="md:col-span-2" type="submit">
            Deployment 시작
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
          <Panel>
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
          </Panel>
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
            <Panel title="예측 동작 / 로봇 응답">
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
            </Panel>
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
