import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type DataUnitKind,
  type DatasetUnitRef,
  type ReviewStatus,
} from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { Select } from "@/shared/ui/select";
import { StatTile } from "@/shared/ui/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { Tabs } from "@/shared/ui/tabs";
import { Textarea } from "@/shared/ui/textarea";
import { Timeline } from "@/shared/ui/timeline";

import {
  loadAnnotations,
  loadDatasets,
  loadDrives,
  loadEpisodes,
  loadInterventions,
  loadQuality,
} from "./flywheel-loaders";
import {
  ActionLink,
  AsyncState,
  DefinitionGrid,
  DetailLink,
  JsonExportButton,
  StatusBadge,
} from "./flywheel-page-shared";
import { formatDateTime } from "./flywheel-page-utils";

function actionFailureMessage(): string {
  return "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}

const kindOptions = [
  { label: "Humanoid Episode", value: "humanoid-episode" },
  { label: "Drive Window", value: "drive-window" },
  { label: "Intervention Window", value: "intervention-window" },
];

export function CatalogPage() {
  const episodes = useFlywheelQuery(loadEpisodes);
  const drives = useFlywheelQuery(loadDrives);
  const interventions = useFlywheelQuery(loadInterventions);
  const [params, setParams] = useSearchParams();
  const tab = params.get("type") ?? "all";
  const search = params.get("search") ?? "";
  const rows = useMemo(() => {
    const result: {
      id: string;
      type: string;
      name: string;
      robot: string;
      quality: string;
      annotation: string;
      path: string;
    }[] = [];
    if (episodes.status === "ready")
      episodes.data.forEach((item) =>
        result.push({
          id: item.id,
          type: "episode",
          name: item.name,
          robot: item.robotId,
          quality: item.qualityStatus,
          annotation: item.annotationStatus,
          path: `/mlops/episodes/${item.id}`,
        }),
      );
    if (drives.status === "ready")
      drives.data.forEach((item) =>
        result.push({
          id: item.id,
          type: "drive",
          name: item.routeId,
          robot: item.robotId,
          quality: item.qualityStatus,
          annotation: "—",
          path: `/mlops/drives/${item.id}`,
        }),
      );
    if (interventions.status === "ready")
      interventions.data.forEach((item) =>
        result.push({
          id: item.id,
          type: "intervention",
          name: item.reason,
          robot: item.robotId,
          quality: item.qualityStatus,
          annotation: item.status,
          path: `/mlops/interventions/${item.id}`,
        }),
      );
    return result.filter(
      (item) =>
        (tab === "all" || item.type === tab) &&
        `${item.id} ${item.name} ${item.robot}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  }, [drives, episodes, interventions, search, tab]);
  const loading =
    episodes.status === "loading" ||
    drives.status === "loading" ||
    interventions.status === "loading";
  const firstError =
    episodes.status === "error"
      ? episodes
      : drives.status === "error"
        ? drives
        : interventions.status === "error"
          ? interventions
          : null;
  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 카탈로그"
        description="Episode, Drive, Intervention을 같은 조회 조건으로 검색하고 후속 작업에 연결합니다."
      />
      <Panel title="고급 필터">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Input
            label="검색"
            value={search}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value === "") {
                next.delete("search");
              } else {
                next.set("search", event.target.value);
              }
              setParams(next);
            }}
            placeholder="ID, 작업, 로봇"
          />
          <Select
            label="로봇"
            value="all"
            options={[
              { label: "전체 로봇", value: "all" },
              { label: "robot-001", value: "robot-001" },
              { label: "robot-002", value: "robot-002" },
            ]}
            onValueChange={() => undefined}
          />
          <Select
            label="사이트"
            value="all"
            options={[
              { label: "전체 사이트", value: "all" },
              { label: "Lab", value: "lab" },
              { label: "Pangyo", value: "pangyo" },
            ]}
            onValueChange={() => undefined}
          />
          <Select
            label="QC"
            value="all"
            options={[
              { label: "전체 QC", value: "all" },
              { label: "통과", value: "passed" },
              { label: "실패", value: "failed" },
            ]}
            onValueChange={() => undefined}
          />
          <Input label="ROS 토픽" placeholder="/camera/head" />
          <Input label="최소 Hz" type="number" placeholder="30" />
        </div>
      </Panel>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === "all") {
            next.delete("type");
          } else {
            next.set("type", value);
          }
          setParams(next);
        }}
        items={["all", "episode", "drive", "intervention"].map((value) => ({
          label:
            value === "all" ? "전체" : value[0]!.toUpperCase() + value.slice(1),
          value,
          content: null,
        }))}
      />
      {loading ? (
        <Panel>
          <p className="text-sm text-muted">데이터를 불러오는 중입니다…</p>
        </Panel>
      ) : firstError !== null ? (
        <Panel>
          <p className="text-negative">데이터를 불러오지 못했습니다.</p>
          <Button className="mt-3" onClick={firstError.retry}>
            다시 시도
          </Button>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">조건에 맞는 데이터가 없습니다.</p>
        </Panel>
      ) : (
        <Panel title={`${String(rows.length)}개 레코드`}>
          <Table aria-label="카탈로그 레코드 목록">
            <TableHeader>
              <TableRow>
                <TableHead>레코드</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>로봇</TableHead>
                <TableHead>QC</TableHead>
                <TableHead>Annotation 상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <DetailLink to={row.path}>{row.name}</DetailLink>
                    <span className="mt-1 block text-xs text-muted">
                      {row.id}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge>{row.type}</Badge>
                  </TableCell>
                  <TableCell>{row.robot}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.quality} />
                  </TableCell>
                  <TableCell>{row.annotation}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}

export function AnnotationsPage() {
  const port = useFlywheelPort();
  const query = useFlywheelQuery(loadAnnotations);
  const [name, setName] = useState("New annotation task");
  const [assignee, setAssignee] = useState("collector1");
  const [reviewer, setReviewer] = useState("auditor1");
  const [kind, setKind] = useState<DataUnitKind>("humanoid-episode");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Annotation 작업"
        description="대상 Query, Schema, 담당자 이름, 검수 진행률을 관리합니다."
      />
      <Panel title="Annotation 작업 생성">
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            void port
              .createAnnotationTask({
                projectId: "project-tiger",
                name,
                dataKind: kind,
                schemaName: "VLA Task v2",
                assignee,
                reviewer,
                totalItems: 48,
                description: "Task 결과와 구간을 검수합니다.",
              })
              .then(() => setMessage("Annotation Task를 생성했습니다."))
              .catch(() => setMessage(actionFailureMessage()));
          }}
        >
          <Input
            label="작업 이름"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <Select
            label="데이터 유형"
            value={kind}
            options={kindOptions}
            onValueChange={(value) => setKind(value as DataUnitKind)}
          />
          <Input
            label="담당자"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          />
          <Input
            label="검수자"
            value={reviewer}
            onChange={(event) => setReviewer(event.target.value)}
          />
          <div className="flex items-end">
            <Button className="w-full" type="submit">
              Task 생성
            </Button>
          </div>
          {message === null ? null : (
            <p
              className="md:col-span-2 xl:col-span-5 text-sm font-semibold"
              role="status"
            >
              {message}
            </p>
          )}
        </form>
      </Panel>
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <Table aria-label="Annotation 작업 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>작업</TableHead>
                  <TableHead>유형 / 스키마</TableHead>
                  <TableHead>담당 / 검수</TableHead>
                  <TableHead>진행률</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/annotations/${item.id}`}>
                        {item.name}
                      </DetailLink>
                    </TableCell>
                    <TableCell>
                      {item.dataKind}
                      <br />
                      <span className="text-xs text-muted">
                        {item.schemaName}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.assignee} / {item.reviewer}
                    </TableCell>
                    <TableCell>
                      {String(item.completedItems)} / {String(item.totalItems)}
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

export function AnnotationWorkspacePage() {
  const { taskId = "" } = useParams();
  const port = useFlywheelPort();
  const query = useFlywheelQuery(loadAnnotations);
  const task =
    query.status === "ready"
      ? (query.data.find((item) => item.id === taskId) ?? null)
      : null;
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("in-progress");
  const [message, setMessage] = useState<string | null>(null);
  if (query.status !== "ready")
    return <AsyncState query={query}>{() => null}</AsyncState>;
  if (task === null)
    return (
      <Panel>
        <p>Annotation 작업을 찾을 수 없습니다.</p>
      </Panel>
    );
  return (
    <div className="grid gap-6">
      <PageHeader
        title={task.name}
        eyebrow={task.schemaName}
        actions={<StatusBadge status={task.status} />}
      />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_24rem]">
        <Panel title="Annotation 작업 공간">
          <div className="grid gap-5">
            <div className="aspect-video overflow-hidden rounded-[var(--design-radius-surface)] bg-black">
              <video
                className="h-full w-full object-cover"
                controls
                muted
                poster="/assets/interventions/ambiguous-grasp-target.png"
                preload="none"
                src="/assets/low-altitude-first-person-pov.mp4"
              />
            </div>
            <Timeline
              durationLabel="42초"
              markers={[
                {
                  id: "subtask-1",
                  label: "Locate object",
                  offsetPercent: 12,
                  tone: "info",
                },
                {
                  id: "subtask-2",
                  label: "Grasp",
                  offsetPercent: 42,
                  tone: "positive",
                },
                {
                  id: "subtask-3",
                  label: "Place / Failure",
                  offsetPercent: 78,
                  tone: "negative",
                },
              ]}
            />
            <Textarea
              label="자연어 설명 / Review 의견"
              value={description || task.description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </Panel>
        <Panel title="검수 메타데이터">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void port
                .updateAnnotationTask(task.id, {
                  description: description || task.description,
                  status,
                  completedItems:
                    status === "approved"
                      ? task.totalItems
                      : Math.min(task.totalItems, task.completedItems + 1),
                })
                .then(() =>
                  setMessage("Annotation과 검수 상태를 저장했습니다."),
                )
                .catch(() => setMessage(actionFailureMessage()));
            }}
          >
            <DefinitionGrid
              items={[
                { label: "대상", value: `${String(task.totalItems)} items` },
                {
                  label: "완료",
                  value: `${String(task.completedItems)} items`,
                },
                { label: "담당자", value: task.assignee },
                { label: "검수자", value: task.reviewer },
              ]}
            />
            <Select
              label="검수 상태"
              value={status}
              options={["in-progress", "review", "approved", "rejected"].map(
                (value) => ({ label: value, value }),
              )}
              onValueChange={(value) => setStatus(value as ReviewStatus)}
            />
            <Button type="submit">저장</Button>
            {message === null ? null : (
              <p className="text-sm font-semibold" role="status">
                {message}
              </p>
            )}
          </form>
        </Panel>
      </section>
    </div>
  );
}

export function QualityPage() {
  const port = useFlywheelPort();
  const query = useFlywheelQuery(loadQuality);
  const [kind, setKind] = useState<DataUnitKind>("humanoid-episode");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="품질 관리"
        description="필수 스트림, 주기, drift, frame drop, 길이와 Annotation completeness 규칙을 실행합니다."
      />
      <Panel title="QC 규칙 세트">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Select
            label="데이터 유형"
            value={kind}
            options={kindOptions}
            onValueChange={(value) => setKind(value as DataUnitKind)}
          />
          <Input label="필수 Stream" value="vision,state,action" readOnly />
          <Input label="최소 Hz" type="number" defaultValue="30" />
          <Input label="최대 Drift (ms)" type="number" defaultValue="50" />
          <Input label="프레임 누락률 (%)" type="number" defaultValue="3" />
          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() =>
                void port
                  .runQualityCheck(kind)
                  .then(() => setMessage("QC 검사를 완료했습니다."))
                  .catch(() => setMessage(actionFailureMessage()))
              }
            >
              검사 실행
            </Button>
          </div>
        </div>
        {message === null ? null : (
          <p className="mt-3 text-sm font-semibold" role="status">
            {message}
          </p>
        )}
      </Panel>
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <Table aria-label="품질 검사 실행 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>실행</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>통과</TableHead>
                  <TableHead>실패</TableHead>
                  <TableHead>격리</TableHead>
                  <TableHead>상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/quality/${item.id}`}>
                        {item.name}
                      </DetailLink>
                    </TableCell>
                    <TableCell>{item.dataKind}</TableCell>
                    <TableCell>{String(item.passedItems)}</TableCell>
                    <TableCell>{String(item.failedItems)}</TableCell>
                    <TableCell>{String(item.quarantinedItems)}</TableCell>
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

export function QualityDetailPage() {
  const { qualityRunId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) =>
      port.getQualityRun(qualityRunId),
    [qualityRunId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="품질 검사 실행을 찾을 수 없습니다.">
        {(run) => (
          <>
            <PageHeader
              title={run.name}
              eyebrow={run.ruleSetId}
              actions={<StatusBadge status={run.status} />}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <StatTile label="통과" value={String(run.passedItems)} />
              <StatTile label="실패" value={String(run.failedItems)} />
              <StatTile
                label="격리"
                value={String(run.quarantinedItems)}
              />
            </div>
            <Panel title="실패 항목">
              <div className="grid gap-2">
                {run.issues.length === 0 ? (
                  <p className="text-sm text-muted">발견된 문제가 없습니다.</p>
                ) : (
                  run.issues.map((issue) => (
                    <div
                      className="rounded-[var(--design-radius-control)] border border-status-negative-foreground/20 bg-status-negative-background p-3 text-sm"
                      key={issue}
                    >
                      {issue}
                    </div>
                  ))
                )}
              </div>
            </Panel>
            <Panel title="승인 정책">
              <p className="text-sm text-muted">
                QC 통과 또는 명시적으로 승인된 단위만 Dataset Release에
                포함됩니다.
              </p>
              <div className="mt-4 flex gap-2">
                <Button>결과 승인</Button>
                <Button variant="secondary">격리 유지</Button>
              </div>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function FlywheelDatasetsPage() {
  const query = useFlywheelQuery(loadDatasets);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Dataset 버전"
        description="Dataset은 Episode, Drive Window, Intervention Window 중 하나의 단위만 포함합니다."
        actions={
          <ActionLink to="/mlops/datasets/new">새 Dataset Version</ActionLink>
        }
      />
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <JsonExportButton
              fileName="dataset-versions.json"
              label="Dataset JSON 내보내기"
              records={items}
            />
            <Table aria-label="Dataset 버전 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>단위</TableHead>
                  <TableHead>분할</TableHead>
                  <TableHead>수정 시각</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/datasets/${item.id}`}>
                        {item.name} v{String(item.version)}
                      </DetailLink>
                      <span className="mt-1 block text-xs text-muted">
                        {item.tags.join(", ")}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge>{item.kind}</Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>{String(item.unitRefs.length)}</TableCell>
                    <TableCell>
                      {item.split.train}/{item.split.validation}/
                      {item.split.test}
                    </TableCell>
                    <TableCell>{formatDateTime(item.updatedAtMs)}</TableCell>
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

export function NewFlywheelDatasetPage() {
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialKind =
    (params.get("kind") as DataUnitKind | null) ?? "humanoid-episode";
  const [kind, setKind] = useState<DataUnitKind>(initialKind);
  const [name, setName] = useState("Flywheel dataset");
  const [description, setDescription] = useState(
    "QC 통과 데이터로 구성한 학습 Dataset Version",
  );
  const [message, setMessage] = useState<string | null>(null);
  async function create(): Promise<void> {
    const unitRefs: DatasetUnitRef[] =
      kind === "humanoid-episode"
        ? [
            {
              kind: "episode",
              episodeId: params.get("episode") ?? "episode-fw-001",
            },
          ]
        : kind === "drive-window"
          ? [
              {
                kind: "drive-window",
                driveSessionId: params.get("drive") ?? "drive-001",
                startMs: 0,
                endMs: 60_000,
              },
            ]
          : [
              {
                kind: "intervention-window",
                interventionId:
                  params.get("intervention") ?? "intervention-001",
                preMs: 10_000,
                postMs: 20_000,
              },
            ];
    try {
      const created = await port.createDataset({
        projectId: "project-tiger",
        name,
        description,
        kind,
        tags: [kind, "flywheel"],
        unitRefs,
      });
      void navigate(`/mlops/datasets/${created.id}`);
    } catch {
      setMessage(actionFailureMessage());
    }
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="새 Dataset Version"
        description="유형을 먼저 고정하면 다른 단위 유형을 혼합할 수 없습니다."
      />
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Panel title="Dataset 구성">
          <div className="grid gap-4">
            <Select
              label="Dataset 유형"
              value={kind}
              options={kindOptions}
              onValueChange={(value) => setKind(value as DataUnitKind)}
            />
            <Input
              label="이름"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Textarea
              label="설명"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <DefinitionGrid
              items={[
                { label: "선택 가능 단위", value: kind },
                { label: "QC 기준", value: "passed / approved" },
                { label: "Split", value: "80 / 10 / 10" },
                {
                  label: "예상 용량",
                  value: kind === "humanoid-episode" ? "1.62 GB" : "720 MB",
                },
              ]}
            />
            <Panel layer="base" title="선택 Query">
              <p className="text-sm text-muted">
                Robot=all · Site=all · QC=passed · Annotation=approved
              </p>
            </Panel>
            {message === null ? null : (
              <p className="text-sm text-negative" role="alert">
                {message}
              </p>
            )}
            <Button onClick={() => void create()}>초안 생성</Button>
          </div>
        </Panel>
        <Panel title="검증 미리보기">
          <div className="grid gap-3">
            <Badge tone="positive">유형 호환성 · 통과</Badge>
            <Badge tone="positive">QC 정책 · 통과</Badge>
            <Badge tone="info">중복 검사 · 0건</Badge>
            <Badge tone="info">로봇 호환성 · TIGER 계열</Badge>
          </div>
        </Panel>
      </section>
    </div>
  );
}

export function FlywheelDatasetDetailPage() {
  const { datasetVersionId = "" } = useParams();
  const port = useFlywheelPort();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getDataset(datasetVersionId),
    [datasetVersionId],
  );
  const query = useFlywheelQuery(load);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="Dataset 버전을 찾을 수 없습니다."
      >
        {(dataset) => (
          <>
            <PageHeader
              title={`${dataset.name} v${String(dataset.version)}`}
              eyebrow={dataset.kind}
              actions={
                <div className="flex gap-2">
                  <StatusBadge status={dataset.status} />
                  {dataset.status !== "released" ? (
                    <Button
                      onClick={() =>
                        void port
                          .releaseDataset(dataset.id)
                          .then(() =>
                            setMessage("Dataset Version을 Release했습니다."),
                          )
                          .catch(() =>
                            setMessage(actionFailureMessage()),
                          )
                      }
                    >
                      Release
                    </Button>
                  ) : (
                    <Button variant="secondary">새 Version으로 복제</Button>
                  )}
                </div>
              }
            />
            {message === null ? null : (
              <Panel density="compact">
                <p role="status" className="text-sm font-semibold">
                  {message}
                </p>
              </Panel>
            )}
            <div className="grid gap-4 md:grid-cols-4">
              <StatTile label="단위" value={String(dataset.unitRefs.length)} />
              <StatTile
                label="학습"
                value={`${String(dataset.split.train)}%`}
              />
              <StatTile
                label="검증"
                value={`${String(dataset.split.validation)}%`}
              />
              <StatTile label="테스트" value={`${String(dataset.split.test)}%`} />
            </div>
            <Panel title="단위 참조">
              <div className="grid gap-2">
                {dataset.unitRefs.map((ref, index) => (
                  <div
                    className="rounded-[var(--design-radius-control)] bg-layer-base p-3 text-sm"
                    key={`${ref.kind}-${String(index)}`}
                  >
                    {ref.kind === "episode"
                      ? ref.episodeId
                      : ref.kind === "drive-window"
                        ? `${ref.driveSessionId} · ${String(ref.startMs)}–${String(ref.endMs)}ms`
                        : `${ref.interventionId} · -${String(ref.preMs)}ms / +${String(ref.postMs)}ms`}
                  </div>
                ))}
              </div>
            </Panel>
            <section className="grid gap-6 lg:grid-cols-2">
              <Panel title="분포와 균형">
                <DefinitionGrid
                  items={[
                    { label: "Success / Failure", value: "72 / 28" },
                    { label: "Sites", value: "2" },
                    { label: "Robots", value: "2" },
                    { label: "Duplicate", value: "0" },
                  ]}
                />
              </Panel>
              <Panel title="검증">
                <div className="grid gap-2">
                  {dataset.validation.length === 0 ? (
                    <Badge tone="positive">모든 검증을 통과했습니다</Badge>
                  ) : (
                    dataset.validation.map((issue) => (
                      <Badge tone="negative" key={issue}>
                        {issue}
                      </Badge>
                    ))
                  )}
                </div>
              </Panel>
            </section>
            <Panel title="계보">
              <p className="text-sm text-muted">
                Collection → {dataset.kind} → Dataset {dataset.id}
              </p>
              <ActionLink to="/bigdata/lineage">전체 Lineage 열기</ActionLink>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}
