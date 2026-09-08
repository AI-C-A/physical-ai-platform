import { useEffect, useRef, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { StatusIndicator } from '@/shared/ui/status-indicator';

import { cameraEndpoint, connectCollectionCamera, type CollectionCameraConnection } from './collection-camera-connection';
import { BrowserCameraPanel } from './BrowserCameraPanel';

function CameraSource({ label }: { readonly label: string }) {
  const [address, setAddress] = useState('');
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const updateAspectRatio = (video: HTMLVideoElement) => {
    if (video.videoWidth > 0 && video.videoHeight > 0) setAspectRatio(video.videoWidth / video.videoHeight);
  };
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<CollectionCameraConnection | null>(null);
  const generationRef = useRef(0);
  useEffect(() => () => {
    generationRef.current += 1;
    connectionRef.current?.close();
  }, []);

  const disconnect = () => {
    generationRef.current += 1;
    connectionRef.current?.close();
    connectionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };
  const connect = () => {
    disconnect();
    setError(null);
    const generation = generationRef.current;
    const failed = (message: string) => {
      if (generation !== generationRef.current) return;
      disconnect();
      setError(message);
      setState('error');
    };
    try {
      const endpoint = cameraEndpoint(address);
      if (typeof RTCPeerConnection === 'undefined') throw new Error('이 브라우저는 WebRTC 영상 연결을 지원하지 않습니다.');
      setState('connecting');
      connectionRef.current = connectCollectionCamera(endpoint, {
        onStream: (stream) => {
          if (generation !== generationRef.current || !videoRef.current) return;
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => failed('영상 재생을 시작하지 못했습니다. 다시 연결하세요.'));
        },
        onError: failed,
      });
    } catch (cause) {
      failed(cause instanceof Error ? cause.message : '카메라 연결을 시작하지 못했습니다.');
    }
  };
  const active = state === 'connecting' || state === 'live';
  return (
    <section aria-label={`${label} 연결`} className="grid min-w-0 gap-3 rounded-[var(--design-radius-control)] bg-layer-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <StatusIndicator label={state === 'live' ? '영상 수신 중' : state === 'connecting' ? '연결 중' : state === 'error' ? '연결 오류' : '연결 대기'} tone={state === 'error' ? 'warning' : 'neutral'} />
      </div>
      <div className="relative overflow-hidden rounded-[var(--design-radius-control)] bg-layer-base" style={{ aspectRatio }}>
        <video ref={videoRef} aria-label={`${label} 실시간 영상`} autoPlay muted playsInline
          className="absolute inset-0 h-full w-full object-contain"
          onLoadedMetadata={(event) => updateAspectRatio(event.currentTarget)} onResize={(event) => updateAspectRatio(event.currentTarget)} onPlaying={() => { if (connectionRef.current) setState('live'); }}
          onWaiting={() => { if (connectionRef.current) setState('connecting'); }} />
        {state === 'live' ? null : <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted">{state === 'connecting' ? '카메라 영상 수신 대기 중' : '카메라를 연결하면 영상이 표시됩니다.'}</p>}
      </div>
      <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); connect(); }}>
        <Input label={`${label} WebRTC 주소`} type="url" value={address} required disabled={active}
          placeholder="https://camera.example/head/whep" onChange={(event) => setAddress(event.target.value)} />
        <div className="flex gap-2">
          <Button type="submit" disabled={active || !address.trim()} variant="secondary">{state === 'error' ? '다시 연결' : '카메라 연결'}</Button>
          {active ? <Button type="button" variant="ghost" onClick={() => { disconnect(); setState('idle'); setError(null); }}>연결 해제</Button> : null}
        </div>
      </form>
      {error ? <p role="alert" className="text-xs leading-5 text-negative">{error}</p> : null}
    </section>
  );
}

export function CollectionCameraPanel({ sessionId }: { readonly sessionId?: string }) {
  return (
    <section aria-label="시연 카메라" className="grid gap-3">
      {sessionId ? <BrowserCameraPanel key={sessionId} sessionId={sessionId} /> : null}
      <details open={sessionId === undefined}>
      <summary className="cursor-pointer py-2 text-xs text-muted">외부 WebRTC 주소로 연결</summary>
      <div className="grid gap-1">
        <h2 className="text-sm font-semibold">시연 카메라</h2>
        <p className="text-xs leading-5 text-muted">라즈베리파이 등에서 보내는 WebRTC 영상을 연결하세요. 실시간 확인용이며 Episode에는 영상이 저장되지 않습니다.</p>
      </div>
      <CameraSource label="헤드캠" />
      <CameraSource label="전신 카메라" />
      </details>
    </section>
  );
}
