import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useFlywheelQuery } from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { LineageGraph } from "@/shared/ui/lineage-graph";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { Select } from "@/shared/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";

import {
  loadDeployments,
  loadEvaluations,
  loadFailures,
  loadLineage,
  loadOverview,
  loadTraining,
} from "./flywheel-loaders";
import {
  AsyncState,
  DefinitionGrid,
  DetailLink,
  JsonExportButton,
  StatusBadge,
} from "./flywheel-page-shared";
import { formatDateTime } from "./flywheel-page-utils";

const recordTypeLabels: Readonly<Record<string, string>> = {
  all: '전체', capture: '수집', episode: '에피소드', drive: '주행', intervention: '개입',
  dataset: '데이터셋', training: '학습', model: '모델', evaluation: '평가', deployment: '배포', inference: '추론',
};

export function FlywheelOverviewPage() {
  const overview = useFlywheelQuery(loadOverview);
  const training = useFlywheelQuery(loadTraining);
  const evaluations = useFlywheelQuery(loadEvaluations);
  const deployments = useFlywheelQuery(loadDeployments);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Physical AI 플라이휠"
        description="수집 데이터와 주행 운영 지표, 최근 학습·평가·배포를 확인합니다."
      />
      <AsyncState query={overview}>
        {(data) => (
          <>
            <section aria-label="수집 및 주행 지표" className="grid gap-6 lg:grid-cols-2">
              <MetricGroup title="수집 데이터" items={[
                { label: '유효 데이터율', value: `${data.validDataPercent.toFixed(1)}%` },
                { label: '에피소드', value: `${String(data.episodeCount)}개` },
                { label: '릴리스 데이터셋', value: `${String(data.releasedDatasetCount)}개` },
              ]} />
              <MetricGroup title="주행 운영" items={[
                { label: '작업 성공률', value: `${data.taskSuccessPercent.toFixed(1)}%` },
                { label: '자율 비율', value: `${data.autonomyPercent.toFixed(1)}%` },
                { label: 'km당 개입', value: `${data.interventionsPerKm.toFixed(2)}회` },
                { label: '주행 시간', value: `${data.driveHours.toFixed(1)}시간` },
              ]} />
            </section>
            <Panel title="최근 학습·평가·배포" description={`활성 배포 ${String(data.activeDeploymentCount)}개`}>
              <div className="divide-y divide-border">
                <StatusRow label="학습" query={training} detailPath="/mlops/training" />
                <StatusRow label="평가" query={evaluations} detailPath="/mlops/evaluations" />
                <StatusRow label="배포" query={deployments} detailPath="/mlops/deployments" />
              </div>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

function MetricGroup({ title, items }: {
  readonly title: string;
  readonly items: readonly { readonly label: string; readonly value: string }[];
}) {
  return (
    <Panel title={title}>
      <dl className="divide-y divide-border">
        {items.map((item, index) => (
          <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0" key={item.label}>
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className={`${index === 0 ? 'text-3xl' : 'text-lg'} font-semibold tabular-nums`}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function FlywheelExplorerPage() {
  const query = useFlywheelQuery(loadLineage);
  const [params, setParams] = useSearchParams();
  const requestedType = params.get('type') ?? 'all';
  const type = Object.hasOwn(recordTypeLabels, requestedType) ? requestedType : 'all';
  const recordTypes = [
    "all",
    "capture",
    "episode",
    "drive",
    "intervention",
    "dataset",
    "training",
    "model",
    "evaluation",
    "deployment",
    "inference",
  ];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 탐색"
        description="수집부터 배포까지 기록을 유형별로 찾고 상세 내용을 확인하세요."
      />
      <Panel>
        <Select
          label="레코드 유형"
          value={type}
          options={recordTypes.map((value) => ({
            label: recordTypeLabels[value] ?? value,
            value,
          }))}
          onValueChange={(value) => {
            const next = new URLSearchParams(params);
            if (value === 'all') next.delete('type');
            else next.set('type', value);
            setParams(next);
          }}
        />
      </Panel>
      <AsyncState query={query}>
        {(graph) => {
          const nodes = graph.nodes.filter(
            (node) => type === "all" || node.type === type,
          );
          return (
            <Panel title={`기록 ${String(nodes.length)}개`}>
              <JsonExportButton
                fileName="flywheel-records.json"
                label="탐색 결과 JSON 내보내기"
                records={nodes}
              />
              {nodes.length === 0 ? (
                <div className="mt-4 grid justify-items-start gap-3">
                  <p className="text-sm text-muted" role="status">선택한 유형의 기록이 없습니다.</p>
                  <Button onClick={() => { const next = new URLSearchParams(params); next.delete('type'); setParams(next); }} variant="secondary">전체 기록 보기</Button>
                </div>
              ) : <Table aria-label="플라이휠 레코드 목록">
                <TableHeader>
                  <TableRow>
                    <TableHead>레코드</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>연결</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nodes.map((node) => (
                    <TableRow key={node.id}>
                      <TableCell>
                        <DetailLink to={node.detailPath}>
                          {node.label}
                        </DetailLink>
                        <span className="mt-1 block text-xs text-muted">
                          {node.id}
                        </span>
                      </TableCell>
                      <TableCell>{recordTypeLabels[node.type] ?? node.type}</TableCell>
                      <TableCell>
                        <StatusBadge status={node.status} />
                      </TableCell>
                      <TableCell>
                        {String(
                          graph.edges.filter(
                            (edge) =>
                              edge.sourceId === node.id ||
                              edge.targetId === node.id,
                          ).length,
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>}
            </Panel>
          );
        }}
      </AsyncState>
    </div>
  );
}

function StatusRow({
  label,
  query,
  detailPath,
}: {
  readonly label: string;
  readonly detailPath: string;
  readonly query: {
    readonly status: string;
    readonly data?: readonly { readonly id: string; readonly name: string; readonly status: string; readonly createdAtMs: number }[];
    readonly retry: () => void;
  };
}) {
  const latest = query.status === 'ready'
    ? query.data?.reduce<(NonNullable<typeof query.data>)[number] | undefined>(
      (current, item) => current === undefined || item.createdAtMs > current.createdAtMs ? item : current,
      undefined,
    )
    : undefined;
  return (
    <div className="grid gap-2 py-4 first:pt-0 last:pb-0 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <strong>{label}</strong>
      {latest === undefined ? (
        <p className="text-sm text-muted" role="status">
          {query.status === 'loading' ? '불러오는 중' : query.status === 'error' ? '최근 기록을 불러오지 못했습니다.' : '아직 실행 기록이 없습니다.'}
        </p>
      ) : (
        <div className="min-w-0">
          <DetailLink to={`${detailPath}/${latest.id}`}>{latest.name}</DetailLink>
          <p className="mt-1 text-xs text-muted">생성 {formatDateTime(latest.createdAtMs)}</p>
        </div>
      )}
      <div className="justify-self-start sm:justify-self-end">
        {query.status === 'error' ? <Button onClick={query.retry} variant="secondary">{label} 다시 불러오기</Button> : latest === undefined ? null : (
          <StatusBadge status={latest.status} {...(label === '배포' && latest.status === 'active' ? { label: '운영 중' } : {})} />
        )}
      </div>
    </div>
  );
}

export function FailuresPage() {
  const query = useFlywheelQuery(loadFailures);
  const navigate = useNavigate();
  return (
    <div className="grid gap-6">
      <PageHeader
        title="실패 및 데이터 공백"
        description="실패와 개입 사례를 살펴보고 보완할 작업과 권장 재수집량을 확인하세요."
      />
      <AsyncState query={query}>
        {(items) => (
          <div className="grid gap-4 lg:grid-cols-2">
            {items.map((cluster) => (
              <Panel
                key={cluster.id}
                title={cluster.title}
                description={cluster.cause}
              >
                <div className="grid gap-4">
                  <DefinitionGrid
                    items={[
                      { label: "빈도", value: `${String(cluster.count)}건` },
                      {
                        label: "심각도",
                        value: (
                          <Badge
                            tone={
                              cluster.severity === "high"
                                ? "negative"
                                : "warning"
                            }
                          >
                            {{ high: '높음', medium: '보통', low: '낮음' }[cluster.severity]}
                          </Badge>
                        ),
                      },
                      { label: '로봇 유형', value: { humanoid: '휴머노이드', quadruped: '사족보행', mobile: '이동형' }[cluster.affectedRobotType] },
                      {
                        label: "권장 재수집",
                        value: `${String(cluster.recommendedCollectionCount)}개 단위`,
                      },
                    ]}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        void navigate(
                          cluster.affectedRobotType === "humanoid"
                            ? `/mlops/capture/humanoid?gap=${cluster.id}`
                            : `/mlops/capture/mobility?gap=${cluster.id}`,
                        );
                      }}
                    >
                      재수집 시작
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void navigate(
                          `/mlops/datasets/new?kind=${cluster.affectedRobotType === "humanoid" ? "humanoid-episode" : "intervention-window"}&gap=${cluster.id}`,
                        );
                      }}
                    >
                      데이터셋 구성
                    </Button>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </AsyncState>
    </div>
  );
}

export function LineagePage() {
  const query = useFlywheelQuery(loadLineage);
  const [selectedType, setSelectedType] = useState("all");
  return (
    <div className="grid gap-6">
      <PageHeader
        title="전체 계보"
        description="수집부터 추론까지 노드와 참조를 탐색합니다."
      />
      <AsyncState query={query}>
        {(graph) => (
          <>
            <Panel className="min-w-0 overflow-hidden" title="계보 요약" description="유형별로 최대 2개의 기록을 표시합니다. 전체 기록은 데이터 탐색에서 확인하세요.">
              <LineageGraph
                nodes={
                  selectedType === "all"
                    ? graph.nodes
                    : graph.nodes.filter((node) => node.type === selectedType)
                }
              />
            </Panel>
            <Panel title="그래프 요약">
              <DefinitionGrid
                items={[
                  { label: '기록', value: `${String(graph.nodes.length)}개` },
                  { label: '참조 관계', value: `${String(graph.edges.length)}개` },
                  { label: '데이터 유형', value: `${String(new Set(graph.nodes.map((node) => node.type)).size)}종` },
                ]}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "all",
                  "capture",
                  "dataset",
                  "model",
                  "deployment",
                  "inference",
                ].map((type) => (
                  <Button
                    aria-pressed={selectedType === type}
                    key={type}
                    variant={selectedType === type ? "primary" : "secondary"}
                    onClick={() => setSelectedType(type)}
                  >
                    {recordTypeLabels[type] ?? type}
                  </Button>
                ))}
              </div>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}
