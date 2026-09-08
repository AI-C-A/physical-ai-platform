import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { cameraRequest, cameraRoleLabel, startCameraPeer, type CameraPeerState, type CameraSender } from '@/entities/collection-camera';
import { Button } from '@/shared/ui/button';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { StatusIndicator } from '@/shared/ui/status-indicator';

function cameraError(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return '카메라 권한이 거부되었습니다. 브라우저 설정에서 허용한 뒤 다시 시작하세요.';
    if (error.name === 'NotFoundError') return '사용할 수 있는 카메라가 없습니다. 장치를 연결하세요.';
    if (error.name === 'NotReadableError') return '카메라를 열지 못했습니다. 다른 앱에서 사용 중인지 확인하세요.';
    if (error.name === 'OverconstrainedError') return '선택한 카메라를 찾을 수 없습니다. 목록을 새로고침하세요.';
    return error.message;
  }
  return '카메라 연결을 완료하지 못했습니다. 다시 시도하세요.';
}

function CameraSenderSlot({ initialCode, slotId, claimDevice, releaseDevice }: {
  readonly initialCode: string;
  readonly slotId: number;
  readonly claimDevice: (slot: number, device: string) => boolean;
  readonly releaseDevice: (slot: number) => void;
}) {
  const [rotation, setRotation] = useState(0);
  const [code, setCode] = useState(initialCode);
  const [binding, setBinding] = useState<CameraSender | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState('default');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<CameraPeerState | 'idle'>('idle');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<ReturnType<typeof startCameraPeer> | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const releaseRef = useRef(releaseDevice);
  useEffect(() => { releaseRef.current = releaseDevice; }, [releaseDevice]);
  const active = state !== 'idle' && state !== 'error';
  const refresh = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const attempt = generation.current;
    const list = await navigator.mediaDevices.enumerateDevices();
    if (generation.current === attempt) setDevices(list.filter((device) => device.kind === 'videoinput' && device.deviceId));
  };
  const stop = () => {
    generation.current += 1;
    peerRef.current?.close(); peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    releaseRef.current(slotId);
    busy.current = false; setPending(false); setState('idle');
  };
  useEffect(() => {
    let alive = true;
    const update = () => {
      void navigator.mediaDevices?.enumerateDevices().then((list) => {
        if (alive) setDevices(list.filter((device) => device.kind === 'videoinput' && device.deviceId));
      }).catch(() => undefined);
    };
    const leave = () => {
      generation.current += 1;
      peerRef.current?.close(); peerRef.current = null;
      streamRef.current?.getTracks().forEach((track) => { track.onended = null; track.stop(); });
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      releaseRef.current(slotId);
    };
    const pageHide = () => { leave(); setState('idle'); setPending(false); busy.current = false; };
    update();
    navigator.mediaDevices?.addEventListener('devicechange', update);
    window.addEventListener('pagehide', pageHide);
    return () => {
      alive = false; leave();
      navigator.mediaDevices?.removeEventListener('devicechange', update);
      window.removeEventListener('pagehide', pageHide);
    };
  }, [slotId]);

  const pair = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    const attempt = ++generation.current;
    try {
      const result = await cameraRequest<CameraSender>('/pair', undefined, 'POST', { pairingCode: code });
      if (generation.current === attempt) setBinding(result);
    } catch (cause) { if (generation.current === attempt) setError(cameraError(cause)); }
    finally { if (generation.current === attempt) { busy.current = false; setPending(false); } }
  };
  const start = async () => {
    if (busy.current || !binding) return;
    stop();
    const attempt = generation.current;
    busy.current = true; setPending(true); setError(null);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('카메라를 사용하려면 HTTPS 주소로 접속하세요.');
      if (typeof RTCPeerConnection === 'undefined') throw new Error('이 브라우저는 영상 전송을 지원하지 않습니다.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(deviceId === 'default' ? { facingMode: { ideal: 'environment' } } : { deviceId: { exact: deviceId } }),
        width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 },
      } });
      if (generation.current !== attempt) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const actualDevice = stream.getVideoTracks()[0]?.getSettings().deviceId;
      if (actualDevice && !claimDevice(slotId, actualDevice)) throw new Error('이 카메라는 다른 연결에서 사용 중입니다. 다른 장치를 선택하세요.');
      if (actualDevice) setDeviceId(actualDevice);
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      if (generation.current !== attempt) return;
      for (const track of stream.getVideoTracks()) track.onended = () => { stop(); setState('error'); setError('카메라가 분리되었거나 권한이 해제되었습니다. 다시 시작하세요.'); };
      peerRef.current = startCameraPeer({ id: binding.id, token: binding.senderToken, role: 'sender', stream,
        onState: (next, message) => {
          if (generation.current !== attempt) return;
          if (next === 'error') stop();
          setState(next); if (message) setError(message);
        },
      });
      peerRef.current.setRotation(rotation);
      void refresh().catch(() => undefined);
    } catch (cause) {
      if (generation.current === attempt) { stop(); setState('error'); setError(cameraError(cause)); }
    } finally { if (generation.current === attempt) { busy.current = false; setPending(false); } }
  };

  return (
    <section aria-label={`카메라 연결 ${String(slotId)}`} className="grid gap-4 rounded-[var(--design-radius-control)] bg-layer-raised p-4">
      <header className="grid gap-1">
        <h2 className="text-base font-semibold">{binding?.label ?? `카메라 ${String(slotId)}`}</h2>
        {binding ? <p className="text-sm text-muted">{cameraRoleLabel(binding.role)}</p> : null}
      </header>
      {!binding ? <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); if (code.length === 6) void pair(); }}>
        <Input label="6자리 카메라 연결 코드" inputMode="numeric" autoComplete="one-time-code" required maxLength={6}
          value={code} disabled={pending} onChange={(event) => setCode(event.target.value.replace(/\D/gu, '').slice(0, 6))} />
        <Button type="submit" isLoading={pending} disabled={code.length !== 6}>세션 연결</Button>
      </form> : <>
        <div className="relative aspect-video overflow-hidden rounded-[var(--design-radius-control)] bg-layer-base"><video ref={videoRef} aria-label={`${binding.label} 로컬 미리보기`} className="absolute top-1/2 left-1/2 object-contain" style={{ width: rotation % 180 === 0 ? '100%' : '56.25%', height: rotation % 180 === 0 ? '100%' : '177.7778%', transform: `translate(-50%, -50%) rotate(${rotation}deg)` }} autoPlay playsInline muted /></div>
        <StatusIndicator label={state === 'connected' ? 'PC로 영상 전송 중' : state === 'connecting' ? '영상 연결 중' : state === 'waiting' ? 'PC 연결 대기' : state === 'error' ? '연결 오류' : '전송 대기'} tone={state === 'error' ? 'warning' : 'neutral'} />
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => { const next = (rotation + 90) % 360; setRotation(next); peerRef.current?.setRotation(next); }}>90° 회전</Button>
          {active || pending ? <Button variant="secondary" onClick={stop}>카메라 정지</Button> : <Button onClick={() => void start()}>카메라 시작</Button>}
        </div>
        <details>
          <summary className="cursor-pointer py-2 text-sm text-muted">카메라 설정</summary>
          <div className="grid gap-3 pt-2">
        <Select label="사용할 카메라" value={deviceId} disabled={active || pending}
          options={[{ label: '기본 카메라', value: 'default' }, ...devices.map((device, index) => ({ label: device.label || `카메라 ${String(index + 1)}`, value: device.deviceId }))]}
          onValueChange={setDeviceId} />
            <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={active || pending} onClick={() => void refresh().catch((cause: unknown) => setError(cameraError(cause)))}>목록 새로고침</Button>
          <Button variant="ghost" onClick={() => { stop(); setBinding(null); setCode(''); setError(null); }}>다른 코드로 연결</Button>
            </div>
            <p className="text-xs text-muted">전송 중에는 이 페이지를 열어 두세요. 영상은 Episode에 저장되지 않습니다.</p>
          </div>
        </details>
      </>}
      {error ? <p role="alert" className="text-sm leading-6 text-negative">{error}</p> : null}
    </section>
  );
}

export function CameraCollectorPage() {
  const [params] = useSearchParams();
  const [slots, setSlots] = useState([1]);
  const devicesInUse = useRef(new Map<number, string>());
  return (
    <ColorSchemeArea layer="base" scheme="dark" className="min-h-dvh text-foreground">
      <main className="mx-auto grid w-full max-w-lg gap-6 px-5 py-10">
        <header className="grid gap-2"><h1 className="text-2xl font-bold">카메라 연동</h1>
        </header>
        {slots.map((slot) => <CameraSenderSlot key={slot} slotId={slot} initialCode={slot === 1 ? params.get('code')?.replace(/\D/gu, '').slice(0, 6) ?? '' : ''}
          claimDevice={(id, device) => {
            if ([...devicesInUse.current].some(([other, value]) => other !== id && value === device)) return false;
            devicesInUse.current.set(id, device); return true;
          }} releaseDevice={(id) => { devicesInUse.current.delete(id); }} />)}
        <Button variant="ghost" disabled={slots.length >= 16} onClick={() => setSlots((current) => [...current, current.length + 1])}>카메라 추가 연결</Button>
      </main>
    </ColorSchemeArea>
  );
}
