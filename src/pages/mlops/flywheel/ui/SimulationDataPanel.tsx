import {
  findSimulationTask,
  type SimulationBridgeHand,
  type SimulationFeed,
  type SimulationPeer,
} from '@/entities/simulation-collection';
import { StatTile } from '@/shared/ui/stat-tile';
import { StatusIndicator, type StatusIndicatorTone } from '@/shared/ui/status-indicator';

import { feedStatus } from './simulation-feed-status';

function peerModeLabel(mode: SimulationPeer['mode']): string {
  switch (mode) {
    case 'vr': return 'VR';
    case 'desktop': return '데스크톱';
    case 'monitor': return '모니터';
    case 'unknown': return '연결 중';
  }
}

function handSideLabel(hand: SimulationBridgeHand): string {
  if (hand.id === 'left' || hand.id.endsWith('/left')) return '왼손';
  if (hand.id === 'right' || hand.id.endsWith('/right')) return '오른손';
  return hand.kind === 'desktop' ? '마우스 손' : hand.id;
}

function handKindLabel(hand: SimulationBridgeHand): string {
  switch (hand.kind) {
    case 'hand': return '핸드트래킹';
    case 'controller': return '컨트롤러';
    case 'desktop': return '데스크톱';
    case 'unknown': return '장치 미상';
  }
}

function stepTone(state: 'todo' | 'active' | 'done' | 'unknown'): StatusIndicatorTone {
  return state === 'done' ? 'positive' : state === 'active' ? 'info' : 'neutral';
}

const formatSeconds = (value: number): string => `${Math.max(0, value).toFixed(1)}s`;

/** 브리지가 전달하는 자세·이벤트·임무 진행을 모아 데이터가 쌓이는 과정을 보여준다. */
export function SimulationDataPanel({ feed }: { readonly feed: SimulationFeed }) {
  const status = feedStatus(feed);
  const task = feed.task;
  const taskSpec = task === null ? null : findSimulationTask(task.taskId);
  const doneSteps = task?.steps.filter((step) => step.state === 'done').length ?? 0;
  const recentEvents = [...feed.events].reverse().slice(0, 14);

  return (
    <div className="simulation-data-panel">
      <p className="text-sm text-muted" role="status">
        {!feed.connected
          ? '시뮬레이션 화면이 연결되면 참가자와 수집 상황이 표시됩니다.'
          : feed.participants.length === 0
            ? '참가자 대기 · VR에서 방 코드로 입장하면 여기에 표시됩니다.'
            : `참가자 ${String(feed.participants.length)}명 · ${feed.participants.map((peer) => `${peer.name} (${peerModeLabel(peer.mode)})`).join(', ')}`}
      </p>

      <div className="simulation-stat-grid" aria-label="수집 통계">
        <StatTile label="프레임" value={<span className="tabular-nums">{String(feed.stats.frames)}</span>} />
        <StatTile label="이벤트" value={<span className="tabular-nums">{String(feed.stats.events)}</span>} />
        <StatTile label="추적 물체" value={<span className="tabular-nums">{String(feed.stats.tracked || feed.heldCount)}</span>} />
        <StatTile label="에피소드" value={<span className="tabular-nums">{String(feed.stats.episodes)}</span>} />
      </div>
      <p className="text-xs tabular-nums text-muted">
        {!feed.connected
          ? '스냅샷 수신 전'
          : feed.rateHz === null
            ? `${status.label} · 자세 수신 대기`
            : `자세 ${feed.rateHz.toFixed(1)} Hz 수신 중 · 머리·양손 자세와 조작 이벤트를 기록`}
      </p>

      <section aria-label="임무 진행" className="grid gap-2">
        <h3 className="text-sm font-semibold">임무 진행</h3>
        {task === null ? (
          <p className="text-sm text-muted">임무 대기 · 스테이션 받침대의 START 버튼을 누르면 단계별 진행이 표시됩니다.</p>
        ) : (
          <div className="grid gap-2 rounded-[var(--design-radius-control)] bg-layer-base p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {taskSpec === null ? task.title : `MISSION ${String(taskSpec.index).padStart(2, '0')} · ${taskSpec.title}`}
                {task.tier > 0 ? <span className="ml-2 text-xs font-normal text-warning">숙련</span> : null}
              </p>
              <span className="text-sm tabular-nums text-muted">
                {formatSeconds(task.timeSeconds)}{task.parSeconds > 0 ? ` / 목표 ${String(task.parSeconds)}s` : ''}
              </span>
            </div>
            <p className="text-xs text-muted">단계 {String(doneSteps)}/{String(task.steps.length)}</p>
            {task.steps.length === 0 ? null : (
              <ol className="grid gap-1" aria-label="임무 단계">
                {task.steps.map((step, index) => (
                  <li key={`${String(index)}-${step.label}`}>
                    <StatusIndicator label={step.label || `단계 ${String(index + 1)}`} tone={stepTone(step.state)} pulse={step.state === 'active'} />
                  </li>
                ))}
              </ol>
            )}
            {task.hint === '' ? null : <p className="text-xs text-info">{task.hint}</p>}
          </div>
        )}
      </section>

      <section aria-label="손 추적" className="grid gap-2">
        <h3 className="text-sm font-semibold">손 추적</h3>
        {feed.hands.length === 0 ? (
          <p className="text-sm text-muted">손 자세 수신 전</p>
        ) : (
          <div className="simulation-hand-grid text-sm">
            {feed.hands.map((hand) => (
              <div className="contents" key={hand.id}>
                <span className="font-medium">{handSideLabel(hand)}</span>
                <span className="text-muted">{handKindLabel(hand)}{hand.grabbing ? ' · 잡는 중' : ''}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {hand.position.map((value) => value.toFixed(2)).join(' / ')} m
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="이벤트 로그" className="grid gap-2">
        <h3 className="text-sm font-semibold">이벤트 로그</h3>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-muted">아직 기록된 이벤트가 없습니다.</p>
        ) : (
          <ol className="simulation-event-log text-xs" role="log">
            {recentEvents.map((event) => (
              <li className="flex gap-2" key={event.seq}>
                <span className="shrink-0 font-mono text-info">{event.kind}</span>
                <span className="min-w-0 break-words">{event.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
