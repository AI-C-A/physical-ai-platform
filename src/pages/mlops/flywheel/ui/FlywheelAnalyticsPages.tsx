import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useFlywheelQuery } from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Chart } from "@/shared/ui/chart";
import { LineageGraph } from "@/shared/ui/lineage-graph";
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

export function FlywheelOverviewPage() {
  const overview = useFlywheelQuery(loadOverview);
  const training = useFlywheelQuery(loadTraining);
  const evaluations = useFlywheelQuery(loadEvaluations);
  const deployments = useFlywheelQuery(loadDeployments);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Physical AI 플라이휠"
        description="수집부터 추론까지 데이터와 모델의 순환 상태를 한 화면에서 확인합니다."
      />
      <AsyncState query={overview}>
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                emphasis="primary"
                label="에피소드"
                value={String(data.episodeCount)}
              />
              <StatTile
                label="주행 시간"
                value={data.driveHours.toFixed(1)}
              />
              <StatTile
                label="유효 데이터율"
                value={`${data.validDataPercent.toFixed(1)}%`}
              />
              <StatTile
                label="작업 성공률"
                value={`${data.taskSuccessPercent.toFixed(1)}%`}
              />
              <StatTile
                label="자율 비율"
                value={`${data.autonomyPercent.toFixed(1)}%`}
              />
              <StatTile
                label="km당 개입"
                value={data.interventionsPerKm.toFixed(2)}
              />
              <StatTile
                label="릴리스 Dataset"
                value={String(data.releasedDatasetCount)}
              />
              <StatTile
                label="활성 Deployment"
                value={String(data.activeDeploymentCount)}
              />
            </div>
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,0.7fr)]">
              <Panel title="플라이휠 상태">
                <Chart
                  kind="bar"
                  data={[
                    { label: "Valid data", value: data.validDataPercent },
                    { label: "Task success", value: data.taskSuccessPercent },
                    { label: "Autonomy", value: data.autonomyPercent },
                  ]}
                  accessibleSummary={`유효 데이터 ${data.validDataPercent.toFixed(1)}%, Task 성공 ${data.taskSuccessPercent.toFixed(1)}%, 자율 비율 ${data.autonomyPercent.toFixed(1)}%`}
                />
              </Panel>
              <Panel title="파이프라인 상태">
                <div className="grid gap-3">
                  <StatusRow label="학습" query={training} />
                  <StatusRow label="평가" query={evaluations} />
                  <StatusRow label="배포" query={deployments} />
                </div>
              </Panel>
            </section>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function FlywheelExplorerPage() {
  const query = useFlywheelQuery(loadLineage);
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? "all";
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
        title="BigData 탐색기"
        description="전체 플라이휠 Record를 같은 유형 필터와 상세 링크로 탐색합니다."
      />
      <Panel>
        <Select
          label="레코드 유형"
          value={type}
          options={recordTypes.map((value) => ({
            label: value === "all" ? "전체 Record" : value,
            value,
          }))}
          onValueChange={(value) =>
            setParams(value === "all" ? {} : { type: value })
          }
        />
      </Panel>
      <AsyncState query={query}>
        {(graph) => {
          const nodes = graph.nodes.filter(
            (node) => type === "all" || node.type === type,
          );
          return (
            <Panel title={`${String(nodes.length)} records`}>
              <JsonExportButton
                fileName="flywheel-records.json"
                label="탐색 결과 JSON 내보내기"
                records={nodes}
              />
              <Table aria-label="플라이휠 레코드 목록">
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
                      <TableCell>{node.type}</TableCell>
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
              </Table>
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
}: {
  readonly label: string;
  readonly query: {
    readonly status: string;
    readonly data?: readonly { readonly status: string }[];
  };
}) {
  const value =
    query.status === "ready"
      ? (query.data?.[0]?.status ?? "empty")
      : query.status;
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--design-radius-control)] bg-layer-base p-3">
      <strong>{label}</strong>
      <StatusBadge status={value ?? "empty"} />
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
        description="실패·Intervention 클러스터에서 취약 Task와 환경, 권장 재수집량을 도출합니다."
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
                            {cluster.severity}
                          </Badge>
                        ),
                      },
                      { label: "로봇 유형", value: cluster.affectedRobotType },
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
                      필터로 재수집
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void navigate(
                          `/mlops/datasets/new?kind=${cluster.affectedRobotType === "humanoid" ? "humanoid-episode" : "intervention-window"}&gap=${cluster.id}`,
                        );
                      }}
                    >
                      Dataset 구성
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
            <Panel className="min-w-0 overflow-hidden" title="계보 그래프">
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
                  { label: "Nodes", value: String(graph.nodes.length) },
                  { label: "Edges", value: String(graph.edges.length) },
                  { label: "Start", value: "Capture Session" },
                  { label: "End", value: "Inference / Failure" },
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
                    key={type}
                    variant={selectedType === type ? "primary" : "secondary"}
                    onClick={() => setSelectedType(type)}
                  >
                    {type}
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
