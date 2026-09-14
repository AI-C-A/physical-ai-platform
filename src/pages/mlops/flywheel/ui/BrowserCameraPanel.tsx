import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cameraRequest, startCameraPeer, getCameraOwnerToken, type CameraBinding, type CameraPeerState, type CameraRole } from '@/entities/collection-camera';
import { Button } from '@/shared/ui/button';
import { FittedMedia, MediaPanel } from '@/shared/ui/media-panel';
import { StatusIndicator } from '@/shared/ui/status-indicator';
import { DeviceConnectionCode } from './DeviceConnectionCode';
import { CameraAnalysisCard } from './CameraAnalysisCard';

function BrowserCameraCard({ camera, onReplace, onRemove, managementTarget, connectedTarget, onConnected, tileStyle, analysisStyle, visible }: {
  readonly analysisStyle: CSSProperties;
  readonly visible: boolean;
  readonly tileStyle: CSSProperties;
  readonly camera: CameraBinding;
  readonly managementTarget: HTMLDivElement | null;
  readonly connectedTarget?: HTMLDivElement | null | undefined;
  readonly onConnected?: (() => void) | undefined;
  readonly onReplace: (value: CameraBinding) => void;
  readonly onRemove: (id: string) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [sourceAspectRatio, setSourceAspectRatio] = useState(16 / 9);
  const aspectRatio = rotation % 180 === 0 ? sourceAspectRatio : 1 / sourceAspectRatio;
  const updateAspectRatio = (video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setSourceAspectRatio(video.videoWidth / video.videoHeight);
    }
  };
  const [state, setState] = useState<CameraPeerState>('waiting');
  const [playing, setPlaying] = useState(false);
  const [paired, setPaired] = useState(camera.paired);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(Date.now);
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const reportPaired = useEffectEvent((value: boolean) => {
    setPaired(value);
    if (value !== camera.paired) {
      onReplace({ ...camera, paired: value });
      if (value) onConnected?.();
    }
  });
  useEffect(() => {
    if (paused) return;
    let alive = true;
    const video = videoRef.current;
    const peer = startCameraPeer({ id: camera.id, token: camera.viewerToken, role: 'viewer', onRotation: setRotation, onPaired: (value) => { if (alive) reportPaired(value); },
      onStream: (stream) => {
        if (!alive) return;
        setPlaying(false);
        if (video) {
          video.srcObject = stream;
          if (stream) void video.play().catch(() => { if (alive) setError('영상 재생 버튼을 눌러 미리보기를 시작하세요.'); });
        }
      },
      onState: (next, message) => { if (alive) { setState(next); setError(message ?? null); } },
    });
    const leave = () => { peer.close(); setPaused(true); setPlaying(false); };
    window.addEventListener('pagehide', leave);
    return () => { alive = false; peer.close(); if (video) video.srcObject = null; window.removeEventListener('pagehide', leave); };
  }, [camera.id, camera.viewerToken, camera.pairingCode, paused, attempt]);
  const mutate = async (action: 'renew' | 'remove') => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      if (action === 'remove') { await cameraRequest(`/${camera.id}`, camera.viewerToken, 'DELETE'); onRemove(camera.id); }
      else {
        const updated = await cameraRequest<CameraBinding>(`/${camera.id}/refresh-code`, camera.viewerToken, 'POST', { restart: true });
        setPaired(updated.paired);
        if (updated.paired && !camera.paired) onConnected?.();
        onReplace(updated);
        setNow(Date.now());
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '카메라 연결을 변경하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  };
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  const controlsTarget = paired && connectedTarget !== undefined ? connectedTarget : managementTarget;
  const reconnect = () => { setPaused(false); setPlaying(false); setError(null); setAttempt((value) => value + 1); };
  return <>
    <div className="collection-camera-tile" data-portrait={paired && aspectRatio < 1} style={paired ? tileStyle : { display: 'none' }}><FittedMedia aspectRatio={aspectRatio} className="items-center"><MediaPanel className="collection-camera-panel isolate h-auto" aria-label={`${camera.label} 카메라`} title={camera.label} status={<StatusIndicator label={playing ? '영상 수신 중' : state === 'error' ? '연결 오류' : '수신 대기'} tone={state === 'error' ? 'warning' : 'neutral'} />}><div data-aspect-media-viewport className="relative min-h-0 min-w-0 overflow-hidden" style={{ aspectRatio, clipPath: 'inset(0)', containerType: 'size' }}>
      <video ref={videoRef} aria-label={`${camera.label} 실시간 영상`} autoPlay muted playsInline
        className="absolute top-1/2 left-1/2 object-contain" style={{ width: rotation % 180 === 0 ? '100%' : '100cqh', height: rotation % 180 === 0 ? '100%' : '100cqw', transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
        onLoadedMetadata={(event) => updateAspectRatio(event.currentTarget)} onResize={(event) => updateAspectRatio(event.currentTarget)}
        onPlaying={() => { if (!paused) { setPlaying(true); setError(null); } }} onWaiting={() => setPlaying(false)} onPause={() => setPlaying(false)} />
      {error && !managementTarget ? <div className="absolute inset-0 grid place-content-center gap-3 bg-layer p-4 text-center">
        <p role="alert" className="text-sm text-negative">{error}</p>
        <Button variant="secondary" onClick={reconnect}>다시 연결</Button>
      </div> : null}
    </div></MediaPanel></FittedMedia></div>
    <div className="collection-camera-tile" style={paired && playing ? analysisStyle : { display: 'none' }}>{paired && playing ? <CameraAnalysisCard key={`${camera.viewerToken}:${attempt}`} label={camera.label} role={camera.role} videoRef={videoRef} playing={visible && playing && !paused && state === 'connected'} rotation={rotation} sourceAspectRatio={aspectRatio} /> : null}</div>
    {controlsTarget ? createPortal(paired ? <section aria-label={`${camera.label} 설정`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-border py-4">
      <h3 className="text-sm font-semibold">{camera.label}</h3>
      <Button variant="ghost" className="text-xs text-negative" aria-label={`${camera.label} 삭제`} disabled={pending} onClick={() => void mutate('remove')}>삭제</Button>
      <StatusIndicator label={paused ? '영상 수신 중지' : playing ? '영상 수신 중' : state === 'error' ? '연결 오류' : '영상 수신 대기'} tone={state === 'error' ? 'warning' : 'neutral'} />
      {paused || state === 'error' ? <Button variant="secondary" onClick={reconnect}>다시 연결</Button> : null}
      {error ? <p role="alert" className="col-span-full text-xs text-negative">{error}</p> : null}
    </section> : <DeviceConnectionCode showLabel label={camera.label} device="카메라 기기" path="/collect/camera"
      code={camera.pairingCode} expiresAtMs={camera.pairingExpiresAtMs} now={now} pending={pending} error={error}
      onRenew={() => void mutate('renew')} />,
    controlsTarget) : null}
  </>;
}

function nextCameraLabel(role: CameraRole, cameras: readonly CameraBinding[]): string {
  const base = role === 'head' ? '헤드캠' : '전신 카메라';
  let number = 1;
  while (cameras.some((camera) => camera.label === `${base} ${number}`)) number += 1;
  return `${base} ${number}`;
}

export function BrowserCameraPanel({ sessionId, preview, settingsTarget, connectedTarget, onConnected, emptyState }: { readonly sessionId: string; readonly preview?: ReactNode; readonly settingsTarget?: HTMLDivElement | null; readonly connectedTarget?: HTMLDivElement | null | undefined; readonly onConnected?: (() => void) | undefined; readonly emptyState?: ReactNode }) {
  const [managementTarget, setManagementTarget] = useState<HTMLDivElement | null>(null);
  const [cameras, setCameras] = useState<CameraBinding[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<{ target: HTMLDivElement | null | undefined; id: string } | null>(null);
  const selectedId = selection?.target === settingsTarget ? selection?.id : null;
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const ownerToken = await getCameraOwnerToken(sessionId, controller.signal);
      const list = await cameraRequest<CameraBinding[]>(`?collectionId=${encodeURIComponent(sessionId)}`, ownerToken, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setToken(ownerToken); setCameras(list); setError(null);
    })().catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '카메라 목록을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, [sessionId, reload]);
  const retry = () => { setError(null); setReload((value) => value + 1); };
  const add = async (role: CameraRole) => {
    if (busy.current || token === null) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const existing = cameras.find((camera) => camera.role === role && !camera.paired);
      const camera = existing
        ? await cameraRequest<CameraBinding>(`/${existing.id}/refresh-code`, existing.viewerToken, 'POST', { restart: true })
        : await cameraRequest<CameraBinding>('', token, 'POST', { collectionId: sessionId, role, label: nextCameraLabel(role, cameras) });
      setCameras((current) => existing ? current.map((item) => item.id === camera.id ? camera : item) : [...current, camera]);
      setSelection({ target: settingsTarget, id: camera.id });
      if (camera.paired) onConnected?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '카메라를 추가하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  };
  const previewCount = preview === undefined || preview === null ? 0 : 1;
  const workspace = preview !== undefined;
  const connectedCameras = cameras.filter((camera) => camera.paired);
  const hasTiles = connectedCameras.length > 0 || previewCount > 0;
  const count = Math.max(1, connectedCameras.length * 2 + previewCount);
  const columns = Math.min(4, Math.ceil(Math.sqrt(count)));
  const compactColumns = count <= 2 ? 1 : 2;
  const tileStyle = (index: number): CSSProperties => {
    const remaining = (cols: number) => Math.min(cols, count - Math.floor(index / cols) * cols);
    return { '--tile-span': 12 / remaining(columns), '--tile-span-compact': 12 / remaining(compactColumns) } as CSSProperties;
  };
  const gridStyle = { '--grid-rows': Math.ceil(count / columns), '--grid-rows-compact': Math.ceil(count / compactColumns) } as CSSProperties;
  const feedback = error ? (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--design-radius-control)] bg-status-negative-background p-4">
      <p role="alert" className="text-sm text-status-negative-foreground">{error}</p>
      <Button variant="secondary" onClick={retry}>연결 정보 새로고침</Button>
    </div>
  ) : null;
  const addButtons = <div className="flex flex-wrap gap-2">
    <Button variant="secondary" isLoading={pending} disabled={token === null || cameras.length >= 16} onClick={() => void add('head')}>헤드캠 연결</Button>
    <Button variant="secondary" isLoading={pending} disabled={token === null || cameras.length >= 16} onClick={() => void add('full-body')}>전신 카메라 연결</Button>
  </div>;
  const settings = <div className="grid gap-3">
      {feedback}
      {token === null && error === null ? <p role="status" className="text-xs text-muted">연결된 카메라를 불러오는 중입니다.</p> : null}
      <div ref={setManagementTarget} className="grid" />
      {selectedId && cameras.some((camera) => camera.id === selectedId && !camera.paired) ? null : addButtons}
    </div>;
  return (
    <section aria-label="카메라 연결" className={workspace ? 'flex h-full min-h-0 flex-col gap-2 overflow-hidden' : 'grid gap-4'}>
      {!workspace ? settings : settingsTarget ? createPortal(settings, settingsTarget) : null}
      {workspace && !settingsTarget && feedback ? <div className={!hasTiles && token === null ? 'm-auto w-full max-w-lg p-4' : 'shrink-0'}>{feedback}</div> : null}
      {workspace && !hasTiles && (token !== null || error === null) ? <div className="min-h-0 flex-1">
        {token === null ? <div role="status" className="grid h-full place-items-center text-sm text-muted">연결 정보를 불러오는 중입니다.</div> : emptyState}
      </div> : null}
      <div className={!workspace || !hasTiles ? 'hidden' : 'collection-camera-grid min-h-0 flex-1'} style={gridStyle} data-tile-count={count} aria-label="수집 영상 그리드">
      {previewCount === 0 ? null : <div className="collection-camera-tile" style={tileStyle(0)} aria-label="손 추적 미리보기">{preview}</div>}
      {cameras.map((camera) => <BrowserCameraCard tileStyle={tileStyle(connectedCameras.findIndex((item) => item.id === camera.id) * 2 + previewCount)} analysisStyle={tileStyle(connectedCameras.findIndex((item) => item.id === camera.id) * 2 + previewCount + 1)} visible={preview !== undefined} key={camera.id} camera={camera} managementTarget={camera.paired || camera.id === selectedId ? managementTarget : null} connectedTarget={connectedTarget} onConnected={onConnected}
        onRemove={(id) => setCameras((current) => current.filter((item) => item.id !== id))}
        onReplace={(updated) => setCameras((current) => current.map((item) => item.id === updated.id ? updated : item))} />)}
      </div>
    </section>
  );
}

export function BrowserCameraWorkspace({ sessionId, children, settingsTarget, connectedTarget, onConnected, emptyState }: { readonly sessionId?: string; readonly children: ReactNode; readonly settingsTarget: HTMLDivElement | null; readonly connectedTarget?: HTMLDivElement | null | undefined; readonly onConnected?: (() => void) | undefined; readonly emptyState: ReactNode }) {
  return sessionId === undefined ? children ?? emptyState : <BrowserCameraPanel key={sessionId} sessionId={sessionId} preview={children} settingsTarget={settingsTarget} connectedTarget={connectedTarget} onConnected={onConnected} emptyState={emptyState} />;
}
