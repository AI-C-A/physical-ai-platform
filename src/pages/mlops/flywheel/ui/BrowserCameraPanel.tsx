import { createPortal } from 'react-dom';
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cameraRequest, cameraRoleLabel, startCameraPeer, type CameraBinding, type CameraPeerState, type CameraRole } from '@/entities/collection-camera';
import { Button } from '@/shared/ui/button';
import { FittedMedia, MediaPanel } from '@/shared/ui/media-panel';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { StatusIndicator } from '@/shared/ui/status-indicator';
import { CameraAnalysisCard } from './CameraAnalysisCard';

function BrowserCameraCard({ camera, onReplace, onRemove, managementTarget, tileStyle, analysisStyle, visible }: {
  readonly analysisStyle: CSSProperties;
  readonly visible: boolean;
  readonly tileStyle: CSSProperties;
  readonly camera: CameraBinding;
  readonly managementTarget: HTMLDivElement | null;
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
  useEffect(() => {
    if (paused) return;
    let alive = true;
    const video = videoRef.current;
    const peer = startCameraPeer({ id: camera.id, token: camera.viewerToken, role: 'viewer', onRotation: setRotation, onPaired: (value) => { if (alive) setPaired(value); },
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
  const retryAfter = useRef(0);
  const mutate = async (action: 'renew' | 'remove', automatic = false, signal?: AbortSignal) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      if (action === 'remove') { await cameraRequest(`/${camera.id}`, camera.viewerToken, 'DELETE'); onRemove(camera.id); }
      else {
        const updated = await cameraRequest<CameraBinding>(`/${camera.id}/${automatic ? 'refresh-code' : 'renew'}`, camera.viewerToken, 'POST', {}, signal);
        if (signal?.aborted) return;
        setPaired(updated.paired);
        if (!automatic || (!updated.paired && updated.pairingCode !== camera.pairingCode)) { setPaused(false); setPlaying(false); }
        onReplace(updated);
      }
    } catch (cause) { if (signal?.aborted) return; retryAfter.current = Date.now() + 10_000; setError(cause instanceof Error ? cause.message : '카메라 설정을 변경하지 못했습니다.'); }
    finally { busy.current = false; if (!signal?.aborted) setPending(false); }
  };
  const refreshCode = useEffectEvent((signal: AbortSignal) => {
    const time = Date.now();
    setNow(time);
    if (!paired && camera.pairingExpiresAtMs <= time && time >= retryAfter.current) void mutate('renew', true, signal);
  });
  useEffect(() => {
    const controller = new AbortController();
    const resume = () => refreshCode(controller.signal);
    const timer = setInterval(resume, 1_000);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, []);
  const expired = camera.pairingExpiresAtMs <= now;
  const codeUrl = `${location.origin}/collect/camera?code=${camera.pairingCode ?? ''}`;
  return <>
    <div className="collection-camera-tile" style={tileStyle}><FittedMedia aspectRatio={aspectRatio} className="items-center"><MediaPanel className="isolate h-auto" aria-label={`${camera.label} 카메라`} title={camera.label} status={<StatusIndicator label={playing ? '영상 수신 중' : state === 'error' ? '연결 오류' : '수신 대기'} tone={state === 'error' ? 'warning' : 'neutral'} />}><div data-aspect-media-viewport className="relative min-h-0 min-w-0 overflow-hidden" style={{ aspectRatio, clipPath: 'inset(0)', containerType: 'size' }}>
      <video ref={videoRef} aria-label={`${camera.label} 실시간 영상`} autoPlay muted playsInline
        className="absolute top-1/2 left-1/2 object-contain" style={{ width: rotation % 180 === 0 ? '100%' : '100cqh', height: rotation % 180 === 0 ? '100%' : '100cqw', transform: `translate(-50%, -50%) rotate(${rotation}deg)` }}
        onLoadedMetadata={(event) => updateAspectRatio(event.currentTarget)} onResize={(event) => updateAspectRatio(event.currentTarget)}
        onPlaying={() => { if (!paused) { setPlaying(true); setError(null); } }} onWaiting={() => setPlaying(false)} onPause={() => setPlaying(false)} />
    </div></MediaPanel></FittedMedia></div>
    <div className="collection-camera-tile" style={analysisStyle}><CameraAnalysisCard key={`${camera.viewerToken}:${attempt}`} label={camera.label} role={camera.role} videoRef={videoRef} playing={visible && playing && !paused && state === 'connected'} rotation={rotation} /></div>
    {managementTarget ? createPortal(<section aria-label={`${camera.label} 설정`} className="grid gap-3 rounded-[var(--design-radius-control)] bg-layer-raised p-3">
      <header className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{camera.label}</h3><span className="text-xs text-muted">{cameraRoleLabel(camera.role)}</span></header>
      {paired ? <StatusIndicator label={paused ? '미리보기 정지' : playing ? '영상 수신 중' : state === 'error' ? '연결 오류' : '영상 수신 대기'} tone={state === 'error' ? 'warning' : 'neutral'} /> : null}
      {!paired ? <div className="grid gap-2 text-xs">
        {expired ? <p role="status" className="text-warning">새 연결 코드를 받는 중…</p> : <>
          <output aria-label={`${camera.label} 연결 코드`} className="text-center font-mono text-2xl font-bold tracking-widest">{camera.pairingCode}</output>
          <a href={codeUrl} target="_blank" rel="noreferrer" className="text-center underline underline-offset-4">카메라에서 열기</a>
        </>}
      </div> : null}
      <details><summary className="cursor-pointer text-xs text-muted">관리</summary>
      <div className="flex flex-wrap gap-2 pt-2">
        {error && !paused && state !== 'error' ? <Button variant="secondary" onClick={() => void videoRef.current?.play().catch(() => setError('영상 재생을 시작하지 못했습니다. 다시 연결하세요.'))}>영상 재생</Button> : null}
        {paired && (paused || state === 'error') ? <Button variant="secondary" onClick={() => { setPaused(false); setPlaying(false); setAttempt((value) => value + 1); }}>다시 연결</Button>
          : paired ? <Button variant="ghost" onClick={() => { setPaused(true); setPlaying(false); }}>미리보기 정지</Button> : null}
        <Button variant="ghost" disabled={pending} onClick={() => void mutate('renew')}>새 코드 받기</Button>
        <Button variant="ghost" disabled={pending} onClick={() => void mutate('remove')}>카메라 제거</Button>
      </div>
      </details>
      {error ? <p role="alert" className="text-xs leading-5 text-negative">{error}</p> : null}
    </section>, managementTarget) : null}
  </>;
}

export function BrowserCameraPanel({ sessionId, preview, settingsTarget }: { readonly sessionId: string; readonly preview?: ReactNode; readonly settingsTarget?: HTMLDivElement | null }) {
  const [managementTarget, setManagementTarget] = useState<HTMLDivElement | null>(null);
  const [cameras, setCameras] = useState<CameraBinding[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<CameraRole>('head');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const response = await fetch(`/api/quest/collections/${encodeURIComponent(sessionId)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
      if (!response.ok) throw new Error('수집 세션의 카메라 연결 정보를 불러오지 못했습니다.');
      const record: unknown = await response.json();
      if (typeof record !== 'object' || record === null || !('viewerToken' in record)
        || typeof record.viewerToken !== 'string' || !record.viewerToken) throw new Error('카메라 페어링을 지원하는 수집 서버가 필요합니다.');
      const list = await cameraRequest<CameraBinding[]>(`?collectionId=${encodeURIComponent(sessionId)}`, record.viewerToken, 'GET', undefined, controller.signal);
      if (controller.signal.aborted) return;
      setToken(record.viewerToken); setCameras(list); setError(null);
    })().catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '카메라 목록을 불러오지 못했습니다.'); });
    return () => controller.abort();
  }, [sessionId, reload]);
  const add = async () => {
    if (busy.current || token === null) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const camera = await cameraRequest<CameraBinding>('', token, 'POST', { collectionId: sessionId, role,
        label: label.trim() || `${role === 'head' ? 'Head' : 'Full body'} ${String(cameras.filter((item) => item.role === role).length + 1)}` });
      setCameras((current) => [...current, camera]); setLabel('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '카메라를 추가하지 못했습니다.'); }
    finally { busy.current = false; setPending(false); }
  };
  const count = cameras.length * 2 + 1;
  const columns = Math.min(4, Math.ceil(Math.sqrt(count)));
  const compactColumns = count <= 2 ? 1 : 2;
  const tileStyle = (index: number): CSSProperties => {
    const remaining = (cols: number) => Math.min(cols, count - Math.floor(index / cols) * cols);
    return { '--tile-span': 12 / remaining(columns), '--tile-span-compact': 12 / remaining(compactColumns) } as CSSProperties;
  };
  const gridStyle = { '--grid-rows': Math.ceil(count / columns), '--grid-rows-compact': Math.ceil(count / compactColumns) } as CSSProperties;
  const settings = <div className="grid gap-4">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void add(); }}>
        <Select label="카메라 용도" value={role} onValueChange={(value) => { if (value === 'head' || value === 'full-body') setRole(value); }}
          options={[{ label: cameraRoleLabel('head'), value: 'head' }, { label: cameraRoleLabel('full-body'), value: 'full-body' }]} disabled={pending} />
        <Input label="카메라 이름 · 선택" maxLength={80} value={label} disabled={pending} placeholder="예: Head 정면, Full body 측면" onChange={(event) => setLabel(event.target.value)} />
        <Button type="submit" isLoading={pending} disabled={token === null || cameras.length >= 16}>카메라 추가</Button>
      </form>

      {error ? <div className="grid gap-2"><p role="alert" className="text-xs text-negative">{error}</p><Button variant="ghost" onClick={() => setReload((value) => value + 1)}>목록 다시 불러오기</Button></div> : null}
      {token === null && error === null ? <p role="status" className="text-xs text-muted">연결된 카메라를 불러오는 중입니다.</p> : null}
      <div ref={setManagementTarget} className="grid gap-4" />
      <p className="text-xs text-muted">카메라 영상은 미리보기용이며 Episode에 저장되지 않습니다.</p>
    </div>;
  return (
    <section aria-label="브라우저 카메라 연동" className={preview === undefined ? 'grid gap-4' : 'h-full min-h-0 overflow-hidden'}>
      {preview === undefined ? settings : settingsTarget ? createPortal(settings, settingsTarget) : null}
      <div className={preview === undefined ? 'hidden' : 'collection-camera-grid'} style={gridStyle} aria-label="수집 영상 그리드">
      {preview === undefined ? null : <div className="collection-camera-tile" style={tileStyle(0)} aria-label="손 추적 미리보기">{preview}</div>}
      {cameras.map((camera, index) => <BrowserCameraCard tileStyle={tileStyle(index * 2 + 1)} analysisStyle={tileStyle(index * 2 + 2)} visible={preview !== undefined} key={camera.id} camera={camera} managementTarget={managementTarget}
        onRemove={(id) => setCameras((current) => current.filter((item) => item.id !== id))}
        onReplace={(updated) => setCameras((current) => current.map((item) => item.id === updated.id ? updated : item))} />)}
      </div>
    </section>
  );
}

export function BrowserCameraWorkspace({ sessionId, children, settingsTarget }: { readonly sessionId?: string; readonly children: ReactNode; readonly settingsTarget: HTMLDivElement | null }) {
  return sessionId === undefined ? children : <BrowserCameraPanel key={sessionId} sessionId={sessionId} preview={children} settingsTarget={settingsTarget} />;
}
