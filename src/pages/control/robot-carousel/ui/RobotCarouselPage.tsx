import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ProgressiveBlur } from '@/shared/ui/progressive-blur';

import { createCarouselScene, RobotCompanyAvatar, useRobotCatalog, useRobotOperationalStatus, type RobotDescriptor } from '@/entities/robot';
import { Button, getButtonClassName } from '@/shared/ui/button';
import { Brand } from '@/shared/ui/brand';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { defaultRouteMorphConfig } from '@/shared/ui/route-morph';
import { Spinner } from '@/shared/ui/spinner';
import { Icon } from '@/shared/ui/icon';

import './robot-carousel.css';

interface PresentationProps {
  readonly immersive?: boolean;
  readonly preview?: HTMLDivElement | null;
}

function RobotInfoOverlay({ robot }: { readonly robot: RobotDescriptor }) {
  const status = useRobotOperationalStatus(robot.id);
  const snapshot = status.status === 'ready' && status.data?.robotId === robot.id ? status.data.data : null;
  const stale = Boolean(status.streamIssue || status.refreshError);
  const serialNumber = snapshot?.serialNumber?.trim() || robot.serialNumber?.trim();
  const systemName = snapshot?.name?.trim() || robot.name?.trim();
  const nickname = snapshot?.nickname?.trim();
  const latitude = snapshot?.latitude;
  const longitude = snapshot?.longitude;
  const hasLocation = typeof latitude === 'number' && Number.isFinite(latitude)
    && typeof longitude === 'number' && Number.isFinite(longitude)
    && !(latitude === 0 && longitude === 0);
  const coordinateFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 6 });
  const company = robot.company?.name.trim();
  const battery = snapshot?.battery;
  const [logoFailed, setLogoFailed] = useState(false);
  const validBattery = typeof battery === 'number' && Number.isFinite(battery) && battery >= 0 && battery <= 100;
  const batteryLabel = stale ? '마지막 배터리' : '배터리';
  return (
    <section className="robot-carousel-info" aria-label={`${robot.displayName} 로봇 정보`}>
      {company && <div className="robot-carousel-brand">
        {robot.company?.logoUrl && !logoFailed && <img src={robot.company.logoUrl} alt={`${company} 로고`} onError={() => setLogoFailed(true)} className="robot-carousel-logo" />}
        <span>{company}</span>
      </div>}
      <h2 className="robot-carousel-name">{robot.displayName}</h2>
      {nickname && nickname !== robot.displayName && <p className="robot-carousel-nickname">{nickname}</p>}
      <dl className="robot-carousel-identity">
        <div className="robot-carousel-identity-row"><dt className="text-muted">일련번호</dt><dd className="break-all">{serialNumber || '미등록'}</dd></div>
        <div className="robot-carousel-identity-row"><dt className="text-muted">시스템 이름</dt><dd className="break-all">{systemName || '미등록'}</dd></div>
      </dl>
      {(validBattery || snapshot) && <div className="robot-carousel-metrics">
        {validBattery && <div className="robot-carousel-battery" data-low={battery <= 20} data-stale={stale}>
          <div className="robot-carousel-metric-label">{batteryLabel}</div>
          <div className="robot-carousel-battery-value">{new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(battery)}<span>%</span></div>
          <div className="robot-carousel-battery-track" role="meter" aria-label={batteryLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={battery}>
            <div style={{ width: `${battery}%` }} />
          </div>
          {snapshot?.isCharging && <span className="robot-carousel-charging"><Icon name="charging" size="sm" />충전 중</span>}
        </div>}
        {snapshot && <div className="robot-carousel-connection" data-online={snapshot.isConnecting && !stale}>
          <div className="robot-carousel-metric-label">{stale ? '마지막 연결 상태' : '연결 상태'}</div>
          <div className="robot-carousel-connection-value"><span className="robot-carousel-status-dot" aria-hidden="true" /><strong>{snapshot.isConnecting ? '온라인' : '오프라인'}</strong></div>
          <div className="robot-carousel-connection-signal" aria-hidden="true"><Icon name={snapshot.isConnecting ? 'radio' : 'wifi-off'} size="sm" /><span /></div>
        </div>}
      </div>}
      {snapshot && <section className="robot-carousel-location" aria-label={stale ? '마지막 위치' : '현재 위치'}>
        <h3>{stale ? '마지막 위치' : '현재 위치'}<span aria-hidden="true">GPS</span></h3>
        {hasLocation ? <dl className="robot-carousel-coordinates">
          <div><dt>위도</dt><dd>{coordinateFormat.format(Math.abs(latitude))}<span>° {latitude >= 0 ? 'N' : 'S'}</span></dd></div>
          <div><dt>경도</dt><dd>{coordinateFormat.format(Math.abs(longitude))}<span>° {longitude >= 0 ? 'E' : 'W'}</span></dd></div>
        </dl> : <p className="mt-3 text-sm text-muted">GPS 신호를 수신하지 못했습니다.</p>}
      </section>}
      {status.status === 'loading' && <div className="mt-4"><Spinner label="운영 정보 불러오는 중" /></div>}
      {status.status === 'ready' && !snapshot && <p className="mt-4 text-sm text-muted" role="status">운영 정보가 제공되지 않았습니다.</p>}
      {status.status === 'error' || stale ? <div className="mt-4 grid justify-items-start gap-2 text-xs text-muted" role="status"><p>{snapshot ? '상태 갱신이 중단되어 마지막 수신 정보를 표시합니다.' : '상태 정보를 불러오지 못했습니다.'}</p><Button variant="secondary" onClick={status.retry}>다시 불러오기</Button></div> : null}
    </section>
  );
}

function Carousel({ robots, immersive = true, preview = null }: PresentationProps & { readonly robots: readonly RobotDescriptor[] }) {
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const flight = useRef<Animation | null>(null);
  const positioned = useRef(false);
  const transitionInitialized = useRef(false);
  const [params, setParams] = useSearchParams();
  const selectedIndex = Math.max(0, robots.findIndex((robot) => robot.id === params.get('robotId')));
  const selected = robots[selectedIndex];
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<(HTMLButtonElement | null)[]>([]);
  const scene = useRef<ReturnType<typeof createCarouselScene> | null>(null);
  const [loads, setLoads] = useState<Record<string, boolean>>({});
  const [sceneError, setSceneError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const changeRef = useRef<(index: number) => void>(() => undefined);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  function select(index: number) {
    const robot = robots[(index + robots.length) % robots.length];
    if (!robot) return;
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('robotId', robot.id); return next; }, { replace: true });
  }
  useEffect(() => { changeRef.current = select; });
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    try {
      scene.current = createCarouselScene(host.current, robots, (id, ok) => setLoads((previous) => ({ ...previous, [id]: ok })), (index) => changeRef.current(index), labels.current);
    } catch { queueMicrotask(() => { if (active) setSceneError(true); }); }
    return () => { active = false; scene.current?.dispose(); scene.current = null; };
  }, [robots, attempt]);
  useEffect(() => {
    scene.current?.present(immersive, !transitionInitialized.current, () => flight.current?.effect?.getComputedTiming().progress ?? 1);
    scene.current?.select(selectedIndex);
    transitionInitialized.current = true;
  }, [selectedIndex, attempt, robots, immersive]);
  useLayoutEffect(() => {
    const element = host.current;
    const destination = immersive ? stage.current : preview;
    if (!element || !destination) return;
    const start = element.getBoundingClientRect();
    const frame = (rect: DOMRect) => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const destinationRect = destination.getBoundingClientRect();
    flight.current?.cancel();
    Object.assign(element.style, frame(destinationRect));
    if (positioned.current && start.width > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && element.animate) {
      flight.current = element.animate([frame(start), frame(destinationRect)], {
        duration: defaultRouteMorphConfig.durationMs, easing: defaultRouteMorphConfig.easing,
      });
    }
    positioned.current = true;
    const update = () => Object.assign(element.style, frame(destination.getBoundingClientRect()));
    const observer = new ResizeObserver(update);
    observer.observe(destination);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [immersive, preview]);
  useEffect(() => {
    if (!immersive) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void navigate({ pathname: '/control/monitoring', search: params.toString() });
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [immersive, navigate, params]);
  useEffect(() => () => { flight.current?.cancel(); }, []);
  if (!selected) return null;
  const completed = Object.keys(loads).length;
  const failed = Object.values(loads).filter((ok) => !ok).length;
  return (
    <ColorSchemeArea {...(immersive ? { scheme: "dark" as const } : {})} role="region" className="robot-carousel-page" data-immersive={immersive} aria-label={immersive ? "로봇 캐러셀" : "로봇 미리보기"}>
      {immersive && <header className="robot-carousel-header">
        <Brand compact={false} linked={false} stacked />
        <Link className={getButtonClassName('secondary')} to={{ pathname: '/control/monitoring', search: params.toString() }}>지도로 돌아가기</Link>
      </header>}
      {immersive && <div aria-hidden="true" className="robot-carousel-scrim">
        <ProgressiveBlur position="left" intensity={400} className="robot-carousel-blur-desktop" />
        <ProgressiveBlur position="top" intensity={400} className="robot-carousel-blur-mobile" />
      </div>}
      {immersive && <RobotInfoOverlay key={selected.id} robot={selected} />}
      <div className="robot-carousel-content">
        <div ref={stage} className="robot-carousel-stage" role="region" aria-roledescription={immersive ? "캐러셀" : undefined} aria-label="3D 로봇 선택" tabIndex={immersive ? 0 : -1}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(selectedIndex + (event.key === 'ArrowRight' ? 1 : -1)); }
          }}>
          <div ref={host} role="region" aria-label={`${selected.displayName} 3D 모델`} aria-busy={loads[selected.id] === undefined} className="robot-carousel-canvas" style={{ visibility: immersive || preview ? "visible" : "hidden" }}
            onPointerDown={(event) => { if ((event.target as HTMLElement).closest("button")) return; pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => {
              if (immersive || !pointer.current) return;
              scene.current?.orbit((event.clientX - pointer.current.x) * 0.008);
              pointer.current = { x: event.clientX, y: event.clientY };
            }}
            onPointerCancel={() => { pointer.current = null; }}
            onPointerUp={(event) => {
              const start = pointer.current; pointer.current = null;
              if (!start) return;
              const dx = event.clientX - start.x;
              if (!immersive) return;
              if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(event.clientY - start.y)) select(selectedIndex + (dx < 0 ? 1 : -1));
              else if (Math.hypot(dx, event.clientY - start.y) < 8) scene.current?.pick(event.nativeEvent);
            }}>
            {robots.map((robot, index) => <Button
              variant="ghost"
              key={robot.id}
              buttonRef={(element) => { labels.current[index] = element; }}
              className="robot-carousel-label robot-map-label"
              data-color-scheme="light"
              type="button"
              hidden
              aria-label={`${robot.company?.name ? `${robot.company.name} · ` : ''}${robot.displayName} 선택`}
              aria-pressed={index === selectedIndex}
              onClick={() => select(index)}
            >
              <span className="robot-map-bubble">
                <RobotCompanyAvatar robot={robot} showTitle={false} />
                <span className="robot-map-caption-copy"><strong>{robot.displayName}</strong><span>{robot.company?.name}</span></span>
              </span>
            </Button>)}
            {!immersive && preview && !sceneError && loads[selected.id] === undefined ? <div className="robot-preview-feedback"><Spinner label="로봇 모델 불러오는 중" /></div> : null}
            {!immersive && preview && (sceneError || loads[selected.id] === false) ? <div className="robot-preview-feedback" role="status"><span>3D 모델을 표시할 수 없습니다.</span><Button variant="secondary" onClick={() => { setLoads({}); setSceneError(false); setAttempt((value) => value + 1); }}>다시 시도</Button></div> : null}
          </div>
          {immersive && completed < robots.length && !sceneError ? <div className="robot-carousel-loading"><Spinner label="로봇 모델 불러오는 중" /></div> : null}
          {immersive && (sceneError || failed > 0) ? <div className="robot-carousel-loading" role="status"><span>{sceneError ? '3D 화면을 열 수 없습니다.' : '모델을 불러오지 못했습니다.'}</span><Button variant="secondary" onClick={() => { setLoads({}); setSceneError(false); setAttempt((value) => value + 1); }}>다시 시도</Button></div> : null}
          {immersive && <div className="robot-carousel-navigation">
            <div className="robot-carousel-selection">
            <Button variant="secondary" aria-label="이전 로봇" onClick={() => select(selectedIndex - 1)}>←</Button>
            <p className="truncate text-center text-sm text-muted" aria-live="polite">{selectedIndex + 1} / {robots.length}</p>
            <Button variant="secondary" aria-label="다음 로봇" onClick={() => select(selectedIndex + 1)}>→</Button>
            </div>
            <Link className={getButtonClassName('primary')} to={{ pathname: `/control/monitoring/${selected.id}`, search: params.toString() }}>영상 관제</Link>
          </div>}
        </div>
      </div>
    </ColorSchemeArea>
  );
}

export function RobotCarouselPage({ immersive = true, preview = null }: PresentationProps) {
  const catalog = useRobotCatalog();
  if (!immersive && catalog.status !== 'ready') return null;
  if (catalog.status === 'loading') return <div className="absolute inset-0 z-40 grid min-h-[60dvh] bg-background place-items-center"><Spinner label="로봇 목록 불러오는 중" /></div>;
  if (catalog.status === 'error') return <div className="absolute inset-0 z-40 grid min-h-[60dvh] bg-background place-content-center gap-4"><p role="alert">{catalog.message}</p><Button onClick={catalog.retry}>다시 시도</Button></div>;
  if (!immersive && catalog.robots.length === 0) return null;
  if (catalog.robots.length === 0) return <div className="absolute inset-0 z-40 grid min-h-[60dvh] bg-background place-content-center gap-4"><h1>연동된 로봇이 없습니다.</h1><Link to="/control/robots">로봇 관리</Link></div>;
  return <Carousel robots={catalog.robots} immersive={immersive} preview={preview} />;
}
