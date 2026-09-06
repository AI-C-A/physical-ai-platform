import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type DataUnitKind,
  type ReviewStatus,
} from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog } from "@/shared/ui/dialog";
import { Icon } from "@/shared/ui/icon";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { Select } from "@/shared/ui/select";
import { StatTile } from "@/shared/ui/stat-tile";
import {
  Table,
  TableSection,
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
  loadCatalogCollections,
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
import { getStatusLabel } from "./flywheel-status";
import { DatasetDraftForm } from './DatasetDraftForm';
import { createCatalogExportRecord, createEpisodeExportRecord } from './flywheel-export-records';

function actionFailureMessage(): string {
  return "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}

const kindOptions = [
  { label: "휴머노이드 에피소드", value: "humanoid-episode" },
  { label: "주행 구간", value: "drive-window" },
  { label: "개입 구간", value: "intervention-window" },
];

function DeleteCatalogCollectionButton({
  collectionId,
  collectionName,
  onDeleted,
}: {
  readonly collectionId: string;
  readonly collectionName: string;
  readonly onDeleted?: () => void;
}) {
  const port = useFlywheelPort();
  const [open, setOpen] = useState(false);
  const deletedRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeCollection = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      await port.deleteCatalogCollection(collectionId);
      deletedRef.current = true;
      setOpen(false);
    } catch {
      setError(actionFailureMessage());
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      actions={(
        <Button
          isLoading={pending}
          onClick={() => void removeCollection()}
          variant="danger"
        >
          카탈로그 삭제
        </Button>
      )}
      description="카탈로그에서 수집 결과를 제거합니다. 기존 데이터셋이 참조하는 에피소드는 보존됩니다."
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setError(null);
      }}
      open={open}
      cancelDisabled={pending}
      onAfterClose={() => {
        if (!deletedRef.current) return;
        deletedRef.current = false;
        onDeleted?.();
      }}
      title={`${collectionName} 카탈로그를 삭제하시겠습니까?`}
      trigger={<Button disabled={pending} variant="ghost"><Icon name="trash" />삭제</Button>}
    >
      {error === null ? null : <p className="text-sm text-negative" role="alert">{error}</p>}
    </Dialog>
  );
}

export function CatalogPage() {
  const query = useFlywheelQuery(loadCatalogCollections);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 카탈로그"
        description="수집 결과를 열어 데이터셋에 사용할 에피소드를 선택하세요."
      />
      <AsyncState query={query} emptyMessage="카탈로그에 등록된 수집 결과가 없습니다.">
        {(collections) => (
          <div className="grid gap-4">
            <div className="justify-self-end">
              <JsonExportButton fileName="catalog-collections.json" label="카탈로그 JSON 내보내기" records={collections.map(createCatalogExportRecord)} />
            </div>
            <Table aria-label="휴머노이드 데이터 카탈로그">
              <TableHeader>
                <TableRow>
                  <TableHead>수집 이름</TableHead>
                  <TableHead>로봇</TableHead>
                  <TableHead>작업 ID</TableHead>
                  <TableHead>완료 시각</TableHead>
                  <TableHead>에피소드</TableHead>
                  <TableHead>품질</TableHead>
                  <TableHead><span className="sr-only">관리</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collections.map((collection) => (
                  <TableRow key={collection.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/catalog/${collection.id}`}>
                        {collection.name}
                      </DetailLink>
                    </TableCell>
                    <TableCell>{collection.robotId ?? collection.participantId ?? '미지정'}</TableCell>
                    <TableCell>{collection.taskId}</TableCell>
                    <TableCell>{formatDateTime(collection.completedAtMs)}</TableCell>
                    <TableCell>{String(collection.episodeIds.length)}</TableCell>
                    <TableCell><StatusBadge status={collection.qualityStatus} /></TableCell>
                    <TableCell>
                      <DeleteCatalogCollectionButton
                        collectionId={collection.id}
                        collectionName={collection.name}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AsyncState>
    </div>
  );
}

export function CatalogDetailPage() {
  const { collectionId = '' } = useParams();
  const navigate = useNavigate();
  const loadCollection = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) => port.getCatalogCollection(collectionId),
    [collectionId],
  );
  const collectionQuery = useFlywheelQuery(loadCollection);
  const episodesQuery = useFlywheelQuery(loadEpisodes);
  const [selected, setSelected] = useState<readonly string[]>([]);

  return (
    <AsyncState query={collectionQuery} emptyMessage="카탈로그 수집 결과를 찾을 수 없습니다.">
      {(collection) => {
        const episodes = episodesQuery.status === 'ready'
          ? collection.episodeIds
            .map((id) => episodesQuery.data.find((episode) => episode.id === id))
            .filter((episode) => episode !== undefined)
          : [];
        const selectedEpisodes = selected.filter((id) => episodes.some((episode) => episode.id === id));
        return (
          <div className="grid min-w-0 gap-[var(--layout-section-gap)]">
            <PageHeader
              title={collection.name}
              description={collection.instruction}
              actions={(
                <div className="flex items-center gap-[var(--layout-toolbar-gap)]">
                  <StatusBadge status={collection.qualityStatus} />
                  <DeleteCatalogCollectionButton
                    collectionId={collection.id}
                    collectionName={collection.name}
                    onDeleted={() => void navigate('/mlops/catalog')}
                  />
                </div>
              )}
            />
            <DefinitionGrid items={[
              { label: '수집 ID', value: collection.id },
              { label: '수집 대상', value: collection.robotId ?? collection.participantId ?? '미지정' },
              { label: '작업 ID', value: collection.taskId },
              { label: '완료 시각', value: formatDateTime(collection.completedAtMs) },
            ]} />
            <section aria-labelledby="catalog-episodes-heading" className="grid min-w-0 gap-[var(--layout-toolbar-gap)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--layout-toolbar-gap)]">
                <div>
                  <h2 className="text-base font-bold text-foreground" id="catalog-episodes-heading">
                    에피소드 <span className="ml-1 font-normal text-muted">{String(collection.episodeIds.length)}개</span>
                  </h2>
                  {episodesQuery.status === 'ready' && episodes.length > 0 ? (
                    <p aria-live="polite" className="mt-1 text-sm text-muted">
                      {selectedEpisodes.length === 0
                        ? '데이터셋에 포함할 에피소드를 선택하세요.'
                        : `${String(selectedEpisodes.length)}개 선택됨`}
                    </p>
                  ) : null}
                </div>
                {episodesQuery.status === 'ready' && episodes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-[var(--layout-toolbar-gap)]">
                    <JsonExportButton fileName={`${collection.id}-episodes.json`} label="에피소드 JSON 내보내기" records={episodes.map(createEpisodeExportRecord)} />
                    <Button
                      aria-label={`선택한 에피소드 ${String(selectedEpisodes.length)}개로 데이터셋 구성`}
                      disabled={selectedEpisodes.length === 0}
                      onClick={() => {
                        const params = new URLSearchParams({ kind: 'humanoid-episode' });
                        selectedEpisodes.forEach((episodeId) => params.append('episode', episodeId));
                        void navigate(`/mlops/datasets/new?${params.toString()}`);
                      }}
                    >
                      데이터셋 구성
                    </Button>
                  </div>
                ) : null}
              </div>
              {episodesQuery.status === 'loading' ? (
                <p className="text-sm text-muted" role="status">에피소드를 불러오는 중입니다.</p>
              ) : episodesQuery.status === 'error' ? (
                <div className="grid justify-items-start gap-3">
                  <p className="text-sm text-negative" role="alert">수집 정보는 불러왔지만 에피소드를 불러오지 못했습니다.</p>
                  <Button onClick={episodesQuery.retry} variant="secondary">에피소드 다시 불러오기</Button>
                </div>
              ) : episodes.length === 0 ? (
                <p className="text-sm text-muted" role="status">이 수집에 저장된 에피소드가 없습니다.</p>
              ) : (
                  <Table aria-label="카탈로그 에피소드 선택">
                    <colgroup>
                      <col className="w-14" />
                      <col />
                      <col className="w-20 sm:w-24" />
                      <col className="w-24 sm:w-32" />
                    </colgroup>
                    <TableHeader>
                      <TableRow>
                        <TableHead><span className="sr-only">선택</span></TableHead>
                        <TableHead>에피소드</TableHead>
                        <TableHead>길이</TableHead>
                        <TableHead>품질</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {episodes.map((episode, index) => (
                        <TableRow key={episode.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.includes(episode.id)}
                              label={<span className="sr-only">{episode.name} 선택</span>}
                              onCheckedChange={(checked) => setSelected((current) => (
                                checked
                                  ? [...current, episode.id]
                                  : current.filter((id) => id !== episode.id)
                              ))}
                            />
                          </TableCell>
                          <TableCell className="h-[var(--layout-data-row-height)] min-w-24 break-words px-4 py-2 text-foreground">
                            <DetailLink to={`/mlops/episodes/${episode.id}`}>
                              {episode.name || `Episode ${String(index + 1).padStart(2, '0')}`}
                            </DetailLink>
                          </TableCell>
                          <TableCell>
                            {episode.endedAtMs === null ? '미완료' : `${String(Math.round((episode.endedAtMs - episode.startedAtMs) / 1_000))}초`}
                          </TableCell>
                          <TableCell><StatusBadge status={episode.qualityStatus} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              )}
            </section>
          </div>
        );
      }}
    </AsyncState>
  );
}

export function LegacyCatalogPage() {
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
          robot: item.robotId ?? item.humanDemonstration?.participantId ?? '미지정',
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
        <TableSection title={`${String(rows.length)}개 레코드`}>
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
        </TableSection>
      )}
    </div>
  );
}

export function AnnotationsPage() {
  const port = useFlywheelPort();
  const query = useFlywheelQuery(loadAnnotations);
  const [name, setName] = useState("새 검수 작업");
  const [assignee, setAssignee] = useState("collector1");
  const [reviewer, setReviewer] = useState("auditor1");
  const [kind, setKind] = useState<DataUnitKind>("humanoid-episode");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 검수"
        description="담당자를 지정하고 에피소드와 주행 구간의 검수 진행률을 확인하세요."
      />
      <Panel title="검수 작업 만들기">
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
                description: "작업 결과와 구간을 검수합니다.",
              })
              .then(() => setMessage("검수 작업을 만들었습니다."))
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
              검수 작업 만들기
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
          <Table aria-label="검수 작업 목록">
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
                    {kindOptions.find((option) => option.value === item.dataKind)?.label ?? item.dataKind}
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
        <p>검수 작업을 찾을 수 없습니다.</p>
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
        <Panel title="검수 작업 공간">
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
              label="작업 설명 및 검수 의견"
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
                  setMessage("설명과 검수 상태를 저장했습니다."),
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
                (value) => ({ label: getStatusLabel(value), value }),
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
          <div className="grid min-w-0 gap-[var(--layout-toolbar-gap)]">
            <div className="justify-self-end">
              <JsonExportButton
                fileName="dataset-versions.json"
                label="Dataset JSON 내보내기"
                records={items}
              />
            </div>
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
          </div>
        )}
      </AsyncState>
    </div>
  );
}

export function NewFlywheelDatasetPage() {
  return <DatasetDraftForm />;
}

export function FlywheelDatasetDetailPage() {
  const { datasetVersionId = "" } = useParams();
  const port = useFlywheelPort();
  const navigate = useNavigate();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getDataset(datasetVersionId),
    [datasetVersionId],
  );
  const query = useFlywheelQuery(load);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="데이터셋 버전을 찾을 수 없습니다."
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
                      isLoading={pending}
                      onClick={() => {
                        setPending(true);
                        setMessage(null);
                        void port
                          .releaseDataset(dataset.id)
                          .then(() =>
                            setMessage('데이터셋을 릴리스했습니다.'),
                          )
                          .catch(() =>
                            setMessage(actionFailureMessage()),
                          )
                          .finally(() => setPending(false));
                      }}
                    >
                      릴리스
                    </Button>
                  ) : (
                    <Button isLoading={pending} variant="secondary" onClick={() => {
                      setPending(true);
                      setMessage(null);
                      void port.createDataset({
                        projectId: dataset.projectId, name: `${dataset.name} 복사본`, description: dataset.description,
                        kind: dataset.kind, tags: dataset.tags, unitRefs: dataset.unitRefs,
                      })
                        .then((copy) => navigate(`/mlops/datasets/${copy.id}`))
                        .catch(() => setMessage('데이터셋을 복사하지 못했습니다. 원본 데이터의 저장 상태를 확인한 뒤 다시 시도하세요.'))
                        .finally(() => setPending(false));
                    }}>복사해서 새 데이터셋 만들기</Button>
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
              <Panel title="데이터셋 정보">
                <DefinitionGrid
                  items={[
                    { label: '데이터 유형', value: kindOptions.find((option) => option.value === dataset.kind)?.label ?? dataset.kind },
                    { label: '생성 시각', value: formatDateTime(dataset.createdAtMs) },
                    { label: '수정 시각', value: formatDateTime(dataset.updatedAtMs) },
                    { label: '태그', value: dataset.tags.join(', ') || '없음' },
                  ]}
                />
              </Panel>
              <Panel title="검증">
                <div className="grid gap-2">
                  {dataset.validation.length === 0 ? (
                    <p className="text-sm text-muted">보고된 검증 오류가 없습니다.</p>
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
              <ActionLink to="/bigdata/lineage">전체 계보 열기</ActionLink>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}
