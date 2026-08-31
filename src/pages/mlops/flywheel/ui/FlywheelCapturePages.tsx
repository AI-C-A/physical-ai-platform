import { useCallback, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  useFlywheelPort,
  useFlywheelQuery,
  type FlywheelCaptureSession,
  type InterventionEvent,
} from "@/entities/flywheel";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { PageHeader } from "@/shared/ui/page-header";
import { Panel } from "@/shared/ui/panel";
import { Select } from "@/shared/ui/select";
import { StatTile } from "@/shared/ui/stat-tile";
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
  loadDrives,
  loadEpisodes,
  loadInterventions,
  loadSessions,
} from "./flywheel-loaders";
import {
  ActionLink,
  AsyncState,
  DefinitionGrid,
  DetailLink,
  JsonExportButton,
  StatusBadge,
} from "./flywheel-page-shared";
import {
  formatDateTime,
  formatDuration,
  VIDEO_SOURCE,
} from "./flywheel-page-utils";

const sources = [
  {
    id: "head",
    label: "Head RGB · 29.8 FPS",
    poster: "/assets/interventions/ambiguous-grasp-target.png",
    src: VIDEO_SOURCE,
  },
  {
    id: "left",
    label: "Left Hand · 29.7 FPS",
    poster: "/assets/interventions/person-in-work-zone.png",
    src: VIDEO_SOURCE,
  },
  {
    id: "right",
    label: "Right Hand · 29.9 FPS",
    poster: "/assets/interventions/path-blocked.png",
    src: VIDEO_SOURCE,
  },
];

function actionFailureMessage(): string {
  return "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}

export function CaptureHubPage() {
  const sessions = useFlywheelQuery(loadSessions);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="데이터 수집"
        description="로봇 유형에 맞는 수집 방식을 선택하고 진행 중인 세션을 이어서 운영합니다."
      />
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="휴머노이드 · Episode 수집"
          description="하나의 세션에서 Task Episode를 연속으로 기록하고 Vision·State·Action을 동기화합니다."
        >
          <div className="grid gap-4">
            <DefinitionGrid
              items={[
                { label: "수집 단위", value: "Episode" },
                { label: "핵심 스트림", value: "Vision / State / Action" },
              ]}
            />
            <ActionLink to="/mlops/capture/humanoid">
              Episode 수집 구성
            </ActionLink>
          </div>
        </Panel>
        <Panel
          title="사족·모바일 · 연속 주행"
          description="주행을 Chunk로 연속 기록하고 Autonomous→Teleop 전환을 자동으로 Intervention으로 만듭니다."
        >
          <div className="grid gap-4">
            <DefinitionGrid
              items={[
                { label: "수집 단위", value: "Drive / Window" },
                { label: "핵심 이벤트", value: "Human Intervention" },
              ]}
            />
            <ActionLink to="/mlops/capture/mobility">주행 수집 구성</ActionLink>
          </div>
        </Panel>
      </section>
      <Panel title="최근 수집과 진행 상태">
        <AsyncState
          query={sessions}
          emptyMessage="아직 생성된 수집 세션이 없습니다."
        >
          {(items) => (
            <div className="grid gap-3 lg:grid-cols-3">
              {items.slice(0, 3).map((session) => (
                <article
                  className="rounded-[var(--design-radius-surface)] bg-layer-base p-4"
                  key={session.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong>{session.name}</strong>
                    <StatusBadge status={session.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {session.kind === "humanoid"
                      ? `${String(session.episodeIds.length)} Episodes`
                      : session.routeId}
                  </p>
                  <Link
                    className="mt-4 inline-block text-sm font-semibold underline"
                    to={`/mlops/sessions/${session.id}`}
                  >
                    세션 열기
                  </Link>
                </article>
              ))}
            </div>
          )}
        </AsyncState>
      </Panel>
    </div>
  );
}

export function HumanoidCapturePage() {
  const port = useFlywheelPort();
  const sessions = useFlywheelQuery(loadSessions);
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("Fruit sorting batch");
  const [task, setTask] = useState("task-sort-fruit");
  const [instruction, setInstruction] = useState(
    "Sort the fruit into the matching trays",
  );
  const [episodeName, setEpisodeName] = useState("Pick and place");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const humanoidSessions =
    sessions.status === "ready"
      ? sessions.data.filter((item) => item.kind === "humanoid")
      : [];
  const session =
    humanoidSessions.find((item) => item.id === sessionId) ??
    humanoidSessions.find((item) => item.status !== "completed") ??
    null;

  async function run(
    action: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    setPending(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage(actionFailureMessage());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="휴머노이드 Episode 수집"
        description="검증 → 세션 시작 → 에피소드 반복 기록 → 세션 종료 순서로 운영합니다."
        actions={<ActionLink to="/mlops/sessions">전체 세션</ActionLink>}
      />
      {message === null ? null : (
        <Panel density="compact">
          <p role="status" className="text-sm font-semibold">
            {message}
          </p>
        </Panel>
      )}
      <section className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel
          className="xl:sticky xl:top-24"
          title={session === null ? "수집 계획" : "세션 제어"}
        >
          {session === null ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const created = await port.createHumanoidSession({
                    projectId: "project-tiger",
                    siteId: "site-lab",
                    name,
                    robotId: "robot-001",
                    sensorDeviceId: "sensor-rig-001",
                    taskId: task,
                    instruction,
                  });
                  setSessionId(created.id);
                }, "수집 세션을 생성했습니다. 사전점검을 실행하세요.");
              }}
            >
              <Input
                label="세션 이름"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <Select
                label="로봇"
                value="robot-001"
                options={[{ label: "TIGER H1 · Humanoid", value: "robot-001" }]}
                onValueChange={() => undefined}
              />
              <Select
                label="센서 리그"
                value="sensor-rig-001"
                options={[
                  { label: "Head + Dual Hand Camera", value: "sensor-rig-001" },
                ]}
                onValueChange={() => undefined}
              />
              <Input
                label="작업 ID"
                value={task}
                onChange={(event) => setTask(event.target.value)}
                required
              />
              <Input
                label="지시문"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                required
              />
              <Button type="submit" isLoading={pending}>
                세션 생성
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <Select
                label="활성 세션"
                value={session.id}
                options={humanoidSessions.map((item) => ({
                  label: `${item.name} · ${item.status}`,
                  value: item.id,
                }))}
                onValueChange={setSessionId}
              />
              <DefinitionGrid
                items={[
                  {
                    label: "상태",
                    value: <StatusBadge status={session.status} />,
                  },
                  {
                    label: "Episode",
                    value: String(session.episodeIds.length),
                  },
                  { label: "Active", value: session.activeEpisodeId ?? "없음" },
                  { label: "동기화", value: "Drift 18ms" },
                ]}
              />
              {session.status === "draft" ? (
                <Button
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.validateSession(session.id),
                      "사전점검을 통과했습니다.",
                    )
                  }
                >
                  Validate
                </Button>
              ) : null}
              {session.status === "ready" ? (
                <Button
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.startSession(session.id),
                      "세션 기록을 시작했습니다.",
                    )
                  }
                >
                  Session 시작
                </Button>
              ) : null}
              {session.status === "recording" &&
              session.activeEpisodeId === null ? (
                <>
                  <Input
                    label="다음 Episode 이름"
                    value={episodeName}
                    onChange={(event) => setEpisodeName(event.target.value)}
                  />
                  <Button
                    isLoading={pending}
                    onClick={() =>
                      void run(
                        () => port.startEpisode(session.id, episodeName),
                        "Episode 기록을 시작했습니다.",
                      )
                    }
                  >
                    Episode 시작
                  </Button>
                </>
              ) : null}
              {session.status === "recording" &&
              session.activeEpisodeId !== null ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    isLoading={pending}
                    onClick={() =>
                      void run(
                        () =>
                          port.completeEpisode(
                            session.activeEpisodeId!,
                            "success",
                          ),
                        "Episode를 성공으로 종료했습니다.",
                      )
                    }
                  >
                    성공 종료
                  </Button>
                  <Button
                    variant="secondary"
                    isLoading={pending}
                    onClick={() =>
                      void run(
                        () =>
                          port.completeEpisode(
                            session.activeEpisodeId!,
                            "failure",
                          ),
                        "Episode를 실패로 종료했습니다.",
                      )
                    }
                  >
                    실패 종료
                  </Button>
                </div>
              ) : null}
              {session.status === "recording" ? (
                <Button
                  variant="secondary"
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.stopSession(session.id),
                      "세션을 종료했습니다. 열린 Episode는 aborted 처리됩니다.",
                    )
                  }
                >
                  Session 종료
                </Button>
              ) : null}
              {session.preflight.length === 0 ? null : (
                <div className="grid gap-2">
                  {session.preflight.map((check) => (
                    <div
                      className="flex items-center justify-between gap-3 text-sm"
                      key={check.id}
                    >
                      <span>{check.label}</span>
                      <Badge
                        tone={
                          check.state === "passed" ? "positive" : "negative"
                        }
                      >
                        {check.detail}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
        <div className="grid gap-6">
          <Panel title="실시간 동기화 모니터">
            <SynchronizedPlayer sources={sources} />
          </Panel>
          <Panel title="스트림 상태">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {(session?.streams ?? []).map((stream) => (
                <article
                  className="rounded-[var(--design-radius-control)] bg-layer-base p-3"
                  key={stream.id}
                >
                  <strong className="text-sm">{stream.displayName}</strong>
                  <p className="mt-2 text-2xl font-bold">
                    {stream.observedRateHz ?? 0}
                    <span className="text-xs text-muted"> Hz</span>
                  </p>
                  <StatusBadge status={stream.status} />
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="에피소드 타임라인">
            <Timeline
              durationLabel={
                session?.activeEpisodeId === null ? "대기 중" : "실시간 기록 중"
              }
              markers={[
                {
                  id: "vision",
                  label: "Vision",
                  offsetPercent: 18,
                  tone: "info",
                },
                {
                  id: "action",
                  label: "Action",
                  offsetPercent: 56,
                  tone: "positive",
                },
                {
                  id: "contact",
                  label: "Contact",
                  offsetPercent: 78,
                  tone: "negative",
                },
              ]}
            />
          </Panel>
        </div>
      </section>
    </div>
  );
}

export function MobilityCapturePage() {
  const port = useFlywheelPort();
  const sessions = useFlywheelQuery(loadSessions);
  const [sessionId, setSessionId] = useState("");
  const [name, setName] = useState("Pangyo patrol route B");
  const [routeId, setRouteId] = useState("route-b");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mobilitySessions =
    sessions.status === "ready"
      ? sessions.data.filter((item) => item.kind === "mobility")
      : [];
  const session =
    mobilitySessions.find((item) => item.id === sessionId) ??
    mobilitySessions.find((item) => item.status !== "completed") ??
    null;
  async function run(
    action: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    setPending(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage(actionFailureMessage());
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title="사족·모바일 연속 주행 수집"
        description="주행 상태를 연속 기록하고 제어 모드 전환에서 학습용 Intervention 구간을 자동 생성합니다."
      />
      {message === null ? null : (
        <Panel density="compact">
          <p role="status" className="text-sm font-semibold">
            {message}
          </p>
        </Panel>
      )}
      <section className="grid items-start gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel title={session === null ? "주행 계획" : "주행 제어"}>
          {session === null ? (
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const created = await port.createMobilitySession({
                    projectId: "project-tiger",
                    siteId: "site-pangyo",
                    name,
                    robotId: "robot-002",
                    sensorDeviceId: "sensor-rig-002",
                    routeId,
                    preBufferMs: 10_000,
                    postBufferMs: 20_000,
                  });
                  setSessionId(created.id);
                }, "주행 세션을 생성했습니다.");
              }}
            >
              <Input
                label="세션 이름"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <Select
                label="로봇"
                value="robot-002"
                options={[
                  { label: "TIGER Q2 · Quadruped", value: "robot-002" },
                ]}
                onValueChange={() => undefined}
              />
              <Input
                label="지도 / 경로"
                value={routeId}
                onChange={(event) => setRouteId(event.target.value)}
                required
              />
              <DefinitionGrid
                items={[
                  { label: "Pre-buffer", value: "10초" },
                  { label: "Post-buffer", value: "20초" },
                ]}
              />
              <Button type="submit" isLoading={pending}>
                주행 세션 생성
              </Button>
            </form>
          ) : (
            <div className="grid gap-4">
              <Select
                label="활성 세션"
                value={session.id}
                options={mobilitySessions.map((item) => ({
                  label: `${item.name} · ${item.status}`,
                  value: item.id,
                }))}
                onValueChange={setSessionId}
              />
              <DefinitionGrid
                items={[
                  {
                    label: "상태",
                    value: <StatusBadge status={session.status} />,
                  },
                  { label: "제어 모드", value: session.controlMode },
                  { label: "Drive", value: session.driveSessionId ?? "대기" },
                  {
                    label: "Intervention",
                    value: String(session.interventionIds.length),
                  },
                ]}
              />
              {session.status === "draft" ? (
                <Button
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.validateSession(session.id),
                      "사전점검을 통과했습니다.",
                    )
                  }
                >
                  Validate
                </Button>
              ) : null}
              {session.status === "ready" ? (
                <Button
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.startSession(session.id),
                      "연속 주행 기록을 시작했습니다.",
                    )
                  }
                >
                  연속 기록 시작
                </Button>
              ) : null}
              {session.status === "recording" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    isLoading={pending}
                    variant={
                      session.controlMode === "teleop" ? "primary" : "secondary"
                    }
                    onClick={() =>
                      void run(
                        () => port.setMobilityControlMode(session.id, "teleop"),
                        "Teleop 전환을 감지해 Intervention을 생성했습니다.",
                      )
                    }
                  >
                    Teleop 개입
                  </Button>
                  <Button
                    isLoading={pending}
                    variant={
                      session.controlMode === "autonomous"
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() =>
                      void run(
                        () =>
                          port.setMobilityControlMode(session.id, "autonomous"),
                        "Autonomous로 복귀하고 Post-buffer를 닫았습니다.",
                      )
                    }
                  >
                    자율 복귀
                  </Button>
                </div>
              ) : null}
              {session.status === "recording" ? (
                <Button
                  variant="secondary"
                  isLoading={pending}
                  onClick={() =>
                    void run(
                      () => port.stopSession(session.id),
                      "주행 세션과 Recording Chunk를 종료했습니다.",
                    )
                  }
                >
                  주행 종료
                </Button>
              ) : null}
            </div>
          )}
        </Panel>
        <div className="grid gap-6">
          <Panel title="주행 Vision">
            <SynchronizedPlayer sources={sources.slice(0, 2)} />
          </Panel>
          <div className="grid gap-4 md:grid-cols-4">
            <StatTile label="속도" value="0.82 m/s" />
            <StatTile label="위치 정확도" value="±4 cm" />
            <StatTile label="자율 비율" value="94%" />
            <StatTile label="센서 상태" value="5 / 5" />
          </div>
          <Panel title="자율 / 원격조작 타임라인">
            <Timeline
              durationLabel="연속 기록"
              markers={[
                {
                  id: "auto-1",
                  label: "Autonomous",
                  offsetPercent: 8,
                  tone: "positive",
                },
                {
                  id: "teleop",
                  label: "Human Intervention",
                  offsetPercent: 48,
                  tone: "negative",
                },
                {
                  id: "auto-2",
                  label: "Autonomous 복귀",
                  offsetPercent: 72,
                  tone: "positive",
                },
              ]}
            />
          </Panel>
        </div>
      </section>
    </div>
  );
}

export function FlywheelSessionsPage() {
  const query = useFlywheelQuery(loadSessions);
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = searchParams.get("kind") ?? "all";
  return (
    <div className="grid gap-6">
      <PageHeader
        title="수집 세션"
        description="휴머노이드 Episode 세션과 Mobility 주행 세션을 한 목록에서 구분해 조회합니다."
        actions={<ActionLink to="/mlops/capture">새 수집</ActionLink>}
      />
      <Panel>
        <Select
          label="수집 유형"
          value={kind}
          options={[
            { label: "전체", value: "all" },
            { label: "Humanoid", value: "humanoid" },
            { label: "Mobility", value: "mobility" },
          ]}
          onValueChange={(value) =>
            setSearchParams(value === "all" ? {} : { kind: value })
          }
        />
      </Panel>
      <AsyncState query={query}>
        {(items) => (
          <SessionTable
            items={items.filter((item) => kind === "all" || item.kind === kind)}
          />
        )}
      </AsyncState>
    </div>
  );
}

function SessionTable({
  items,
}: {
  readonly items: readonly FlywheelCaptureSession[];
}) {
  return (
    <Panel title={`${String(items.length)} Sessions`}>
      <JsonExportButton
        fileName="capture-sessions.json"
        label="수집 세션 JSON 내보내기"
        records={items}
      />
      <Table aria-label="수집 세션 목록">
        <TableHeader>
          <TableRow>
            <TableHead>세션</TableHead>
            <TableHead>유형</TableHead>
            <TableHead>로봇</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>생성</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                <DetailLink to={`/mlops/sessions/${session.id}`}>
                  {session.name}
                </DetailLink>
              </TableCell>
              <TableCell>{session.kind}</TableCell>
              <TableCell>{session.robotId}</TableCell>
              <TableCell>
                <StatusBadge status={session.status} />
              </TableCell>
              <TableCell>{formatDateTime(session.createdAtMs)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

export function FlywheelSessionDetailPage() {
  const { sessionId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) => port.getSession(sessionId),
    [sessionId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="수집 세션을 찾을 수 없습니다.">
        {(session) => (
          <>
            <PageHeader
              title={session.name}
              eyebrow={`${session.kind} capture session`}
              actions={<StatusBadge status={session.status} />}
            />
            <Panel title="세션 메타데이터">
              <DefinitionGrid
                items={[
                  {
                    label: "Project / Site",
                    value: `${session.projectId} / ${session.siteId}`,
                  },
                  {
                    label: "Robot",
                    value: `${session.robotId} · ${session.robotType}`,
                  },
                  { label: "Sensor", value: session.sensorDeviceId },
                  {
                    label: "기간",
                    value: `${formatDateTime(session.startedAtMs)} — ${formatDateTime(session.stoppedAtMs)}`,
                  },
                ]}
              />
            </Panel>
            {session.kind === "humanoid" ? (
              <Panel title="에피소드 목록">
                <div className="grid gap-2">
                  {session.episodeIds.map((id, index) => (
                    <DetailLink key={id} to={`/mlops/episodes/${id}`}>
                      Episode {String(index + 1)} · {id}
                    </DetailLink>
                  ))}
                </div>
              </Panel>
            ) : (
              <>
                <Panel title="주행 세션">
                  <DetailLink
                    to={`/mlops/drives/${session.driveSessionId ?? ""}`}
                  >
                    {session.driveSessionId ?? "아직 생성되지 않음"}
                  </DetailLink>
                </Panel>
                <Panel title="개입">
                  <div className="grid gap-2">
                    {session.interventionIds.map((id) => (
                      <DetailLink key={id} to={`/mlops/interventions/${id}`}>
                        {id}
                      </DetailLink>
                    ))}
                  </div>
                </Panel>
              </>
            )}
            <Panel title="수집 Stream">
              <DefinitionGrid
                items={session.streams.map((stream) => ({
                  label: stream.displayName,
                  value: `${String(stream.observedRateHz ?? 0)} Hz · ${stream.status}`,
                }))}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function FlywheelEpisodesPage() {
  const query = useFlywheelQuery(loadEpisodes);
  const [searchParams, setSearchParams] = useSearchParams();
  const outcome = searchParams.get("outcome") ?? "all";
  return (
    <div className="grid gap-6">
      <PageHeader
        title="에피소드"
        description="작업 결과, QC, Annotation 상태와 Dataset 포함 가능성을 확인합니다."
      />
      <Panel>
        <Select
          label="작업 결과"
          value={outcome}
          options={[
            { label: "전체", value: "all" },
            { label: "Success", value: "success" },
            { label: "Failure", value: "failure" },
            { label: "Aborted", value: "aborted" },
          ]}
          onValueChange={(value) =>
            setSearchParams(value === "all" ? {} : { outcome: value })
          }
        />
      </Panel>
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <JsonExportButton
              fileName="episodes.json"
              label="에피소드 JSON 내보내기"
              records={items.filter(
                (item) => outcome === "all" || item.outcome === outcome,
              )}
            />
            <Table aria-label="에피소드 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>에피소드</TableHead>
                  <TableHead>결과</TableHead>
                  <TableHead>Annotation 상태</TableHead>
                  <TableHead>QC</TableHead>
                  <TableHead>기간</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items
                  .filter(
                    (item) => outcome === "all" || item.outcome === outcome,
                  )
                  .map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <DetailLink to={`/mlops/episodes/${item.id}`}>
                          {item.name}
                        </DetailLink>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.outcome ?? item.status} />
                      </TableCell>
                      <TableCell>{item.annotationStatus}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.qualityStatus} />
                      </TableCell>
                      <TableCell>
                        {item.endedAtMs === null
                          ? "기록 중"
                          : formatDuration(item.endedAtMs - item.startedAtMs)}
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

export function FlywheelEpisodeDetailPage() {
  const { episodeId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) => port.getEpisode(episodeId),
    [episodeId],
  );
  const query = useFlywheelQuery(load);
  return (
    <div className="grid gap-6">
      <AsyncState query={query} emptyMessage="에피소드를 찾을 수 없습니다.">
        {(episode) => (
          <>
            <PageHeader
              title={episode.name}
              eyebrow={episode.taskId}
              actions={
                <StatusBadge status={episode.outcome ?? episode.status} />
              }
            />
            <Panel title="동기 멀티뷰">
              <SynchronizedPlayer sources={sources} />
            </Panel>
            <Panel title="영상 / 상태 / 동작 타임라인">
              <Timeline
                durationLabel={
                  episode.endedAtMs === null
                    ? "기록 중"
                    : formatDuration(episode.endedAtMs - episode.startedAtMs)
                }
                markers={episode.events.map((event, index) => ({
                  id: event.id,
                  label: `${event.type} · ${event.label}`,
                  offsetPercent: 20 + index * 45,
                  tone:
                    event.type === "collision" || event.type === "recovery"
                      ? "negative"
                      : "positive",
                }))}
              />
            </Panel>
            <Panel title="에피소드 정보">
              <DefinitionGrid
                items={[
                  { label: "Instruction", value: episode.instruction },
                  { label: "Outcome", value: episode.outcome ?? "기록 중" },
                  { label: "Annotation", value: episode.annotationStatus },
                  { label: "Quality", value: episode.qualityStatus },
                  {
                    label: "Robot / Sensor",
                    value: `${episode.robotId} / ${episode.sensorDeviceId}`,
                  },
                  {
                    label: "Bytes",
                    value: `${(episode.bytesWritten / 1_000_000_000).toFixed(2)} GB`,
                  },
                ]}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function DrivesPage() {
  const query = useFlywheelQuery(loadDrives);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="주행 세션"
        description="연속 주행의 거리, 자율 비율, Recording Chunk와 안전 이벤트를 조회합니다."
      />
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <JsonExportButton
              fileName="drive-sessions.json"
              label="주행 JSON 내보내기"
              records={items}
            />
            <Table aria-label="주행 세션 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>주행</TableHead>
                  <TableHead>경로</TableHead>
                  <TableHead>거리</TableHead>
                  <TableHead>자율 비율</TableHead>
                  <TableHead>개입</TableHead>
                  <TableHead>QC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/drives/${item.id}`}>
                        {item.id}
                      </DetailLink>
                    </TableCell>
                    <TableCell>{item.routeId}</TableCell>
                    <TableCell>
                      {(item.distanceMeters / 1000).toFixed(2)} km
                    </TableCell>
                    <TableCell>
                      {(item.autonomyRatio * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell>{String(item.interventionIds.length)}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.qualityStatus} />
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

export function DriveDetailPage() {
  const { driveSessionId = "" } = useParams();
  const load = useCallback(
    (port: ReturnType<typeof useFlywheelPort>) =>
      port.getDriveSession(driveSessionId),
    [driveSessionId],
  );
  const query = useFlywheelQuery(load);
  const navigate = useNavigate();
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="주행 세션을 찾을 수 없습니다."
      >
        {(drive) => (
          <>
            <PageHeader
              title={`Drive · ${drive.routeId}`}
              actions={
                <Button
                  onClick={() => {
                    void navigate(
                      `/mlops/datasets/new?kind=drive-window&drive=${drive.id}`,
                    );
                  }}
                >
                  Window로 Dataset 생성
                </Button>
              }
            />
            <div className="grid gap-4 md:grid-cols-4">
              <StatTile
                label="주행 시간"
                value={formatDuration(drive.durationMs)}
              />
              <StatTile
                label="거리"
                value={`${(drive.distanceMeters / 1000).toFixed(2)} km`}
              />
              <StatTile
                label="자율 비율"
                value={`${(drive.autonomyRatio * 100).toFixed(1)}%`}
              />
              <StatTile label="청크" value={String(drive.chunks.length)} />
            </div>
            <Panel title="지도 궤적">
              <div className="relative min-h-56 overflow-hidden rounded-[var(--design-radius-surface)] bg-surface-muted p-6">
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
                    backgroundSize: "28px 28px",
                  }}
                />
                <div className="relative mx-auto mt-16 h-2 max-w-3xl rotate-2 rounded-[var(--design-radius-control)] bg-action-primary" />
                <p className="relative mt-8 text-center text-sm font-semibold">
                  Route A · 37.402 → 37.411 · 실내외 전환 2회
                </p>
              </div>
            </Panel>
            <Panel title="동기 주행 영상">
              <SynchronizedPlayer sources={sources.slice(0, 2)} />
            </Panel>
            <Panel title="자율주행 / 개입">
              <Timeline
                durationLabel={formatDuration(drive.durationMs)}
                markers={[
                  {
                    id: "start",
                    label: "Autonomy 시작",
                    offsetPercent: 0,
                    tone: "positive",
                  },
                  ...drive.interventionIds.map((id, index) => ({
                    id,
                    label: `Intervention ${String(index + 1)}`,
                    offsetPercent: 38 + index * 14,
                    tone: "negative" as const,
                  })),
                  {
                    id: "end",
                    label: "주행 종료",
                    offsetPercent: 100,
                    tone: "info",
                  },
                ]}
              />
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}

export function InterventionEventsPage() {
  const query = useFlywheelQuery(loadInterventions);
  return (
    <div className="grid gap-6">
      <PageHeader
        title="개입 이벤트"
        description="학습용 개입 구간의 원인, 심각도, 경계, QC와 Dataset 포함 상태를 관리합니다."
      />
      <AsyncState query={query}>
        {(items) => (
          <Panel>
            <JsonExportButton
              fileName="interventions.json"
              label="개입 JSON 내보내기"
              records={items}
            />
            <Table aria-label="개입 목록">
              <TableHeader>
                <TableRow>
                  <TableHead>이벤트</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>심각도</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>지속 시간</TableHead>
                  <TableHead>QC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <DetailLink to={`/mlops/interventions/${item.id}`}>
                        {item.id}
                      </DetailLink>
                    </TableCell>
                    <TableCell>{item.reason}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.severity} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>
                      {item.endMs === null
                        ? "진행 중"
                        : formatDuration(item.endMs - item.startMs)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.qualityStatus} />
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

export function InterventionDetailPage() {
  const { interventionId = "" } = useParams();
  const port = useFlywheelPort();
  const load = useCallback(
    (value: ReturnType<typeof useFlywheelPort>) =>
      value.getIntervention(interventionId),
    [interventionId],
  );
  const query = useFlywheelQuery(load);
  const [reason, setReason] = useState<InterventionEvent["reason"]>("unknown");
  const [severity, setSeverity] =
    useState<InterventionEvent["severity"]>("medium");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="grid gap-6">
      <AsyncState
        query={query}
        emptyMessage="개입 이벤트를 찾을 수 없습니다."
      >
        {(item) => (
          <>
            <PageHeader
              title={`Intervention · ${item.id}`}
              eyebrow={item.trigger}
              actions={<StatusBadge status={item.status} />}
            />
            <Panel title="개입 전 / 중 / 후">
              <SynchronizedPlayer
                sources={[
                  { id: "before", label: "Before · -10s", src: VIDEO_SOURCE },
                  { id: "during", label: "Human control", src: VIDEO_SOURCE },
                  { id: "after", label: "After · +20s", src: VIDEO_SOURCE },
                ]}
              />
            </Panel>
            <Panel title="제어 전환과 경계">
              <Timeline
                durationLabel={
                  item.endMs === null
                    ? "진행 중"
                    : formatDuration(item.endMs - item.startMs)
                }
                markers={[
                  {
                    id: "pre",
                    label: "Pre-buffer",
                    offsetPercent: 0,
                    tone: "info",
                  },
                  {
                    id: "takeover",
                    label: "Autonomous → Teleop",
                    offsetPercent: 35,
                    tone: "negative",
                  },
                  {
                    id: "return",
                    label: "Control returned",
                    offsetPercent: 72,
                    tone: "positive",
                  },
                  {
                    id: "post",
                    label: "Post-buffer",
                    offsetPercent: 100,
                    tone: "info",
                  },
                ]}
              />
            </Panel>
            <Panel title="검토">
              <form
                className="grid gap-4 md:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const endMs = item.endMs ?? item.startMs + 30_000;
                  void port
                    .updateIntervention(item.id, {
                      startMs: item.startMs,
                      endMs,
                      reason,
                      severity,
                      outcome: item.outcome,
                      note: note || item.note,
                    })
                    .then(() => setMessage("경계와 원인 검수를 저장했습니다."))
                    .catch(() => setMessage(actionFailureMessage()));
                }}
              >
                <Select
                  label="원인"
                  value={reason === "unknown" ? item.reason : reason}
                  options={[
                    "obstacle",
                    "localization",
                    "planning",
                    "perception",
                    "safety",
                    "unknown",
                  ].map((value) => ({ label: value, value }))}
                  onValueChange={(value) =>
                    setReason(value as InterventionEvent["reason"])
                  }
                />
                <Select
                  label="심각도"
                  value={severity === "medium" ? item.severity : severity}
                  options={["low", "medium", "high"].map((value) => ({
                    label: value,
                    value,
                  }))}
                  onValueChange={(value) =>
                    setSeverity(value as InterventionEvent["severity"])
                  }
                />
                <Input
                  className="md:col-span-2"
                  label="검토 메모"
                  value={note || item.note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="submit">검토 저장</Button>
                  <ActionLink
                    to={`/mlops/datasets/new?kind=intervention-window&intervention=${item.id}`}
                  >
                    Dataset Window 생성
                  </ActionLink>
                </div>
                {message === null ? null : (
                  <p
                    role="status"
                    className="md:col-span-2 text-sm font-semibold"
                  >
                    {message}
                  </p>
                )}
              </form>
            </Panel>
          </>
        )}
      </AsyncState>
    </div>
  );
}
