import { useEffect, useState, type RefObject } from 'react';
import type { CameraRole } from './camera';

interface AnalysisState {
  readonly status: 'waiting' | 'loading' | 'ready' | 'error';
  readonly count: number | null;
  readonly latencyMs: number | null;
}
const waiting: AnalysisState = { status: 'waiting', count: null, latencyMs: null };

/** 원본 연결을 재사용하고, 회전된 최신 프레임 하나만 서버로 보낸다. */
export function useCameraAnalysis({ videoRef, imageRef, role, enabled, rotation }: {
  readonly videoRef: RefObject<HTMLVideoElement | null>;
  readonly imageRef: RefObject<HTMLImageElement | null>;
  readonly role: CameraRole;
  readonly enabled: boolean;
  readonly rotation: number;
}): AnalysisState {
  const [state, setState] = useState<AnalysisState>(waiting);
  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let staleTimer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let currentUrl: string | null = null;
    let failures = 0;
    const clearImage = () => {
      image.removeAttribute('src');
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = null;
    };
    clearImage();
    setState(waiting);
    if (!enabled) return;
    const canvas = document.createElement('canvas');
    const schedule = (delay: number) => { if (active) timer = setTimeout(() => void capture(), delay); };
    const capture = async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || video.paused) { schedule(250); return; }
      const started = performance.now();
      try {
        const scale = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.width = rotation % 180 === 0 ? width : height;
        canvas.height = rotation % 180 === 0 ? height : width;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('프레임 캡처를 지원하지 않습니다.');
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(rotation * Math.PI / 180);
        context.drawImage(video, -width / 2, -height / 2, width, height);
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (!active) return;
        if (!jpeg) throw new Error('프레임을 캡처하지 못했습니다.');
        if (!currentUrl) setState({ ...waiting, status: 'loading' });
        controller = new AbortController();
        const response = await fetch(`/api/perception/${role}/infer`, {
          method: 'POST', body: jpeg, headers: { 'Content-Type': 'image/jpeg' }, cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        });
        if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png'
          || response.headers.get('x-perception-mode') !== role) throw new Error('분석 서버 응답 오류');
        const countHeader = response.headers.get('x-detection-count');
        const count = countHeader === null ? NaN : Number(countHeader);
        if (!Number.isInteger(count) || count < 0 || count > (role === 'head' ? 2 : 4)) throw new Error('잘못된 검출 정보');
        const blob = await response.blob();
        if (!active) return;
        const url = URL.createObjectURL(blob);
        const decoded = new Image();
        decoded.src = url;
        try { await decoded.decode(); } catch { URL.revokeObjectURL(url); throw new Error('분석 영상을 읽지 못했습니다.'); }
        if (!active) { URL.revokeObjectURL(url); return; }
        clearImage();
        currentUrl = url;
        image.src = url;
        setState({ status: 'ready', count, latencyMs: Math.round(performance.now() - started) });
        failures = 0;
        clearTimeout(staleTimer);
        staleTimer = setTimeout(() => { clearImage(); if (active) setState({ ...waiting, status: 'loading' }); }, 3_000);
        schedule(Math.max(0, 200 - (performance.now() - started)));
      } catch {
        if (!active) return;
        clearTimeout(staleTimer);
        clearImage();
        setState({ ...waiting, status: 'error' });
        failures += 1;
        schedule(Math.min(5_000, 500 * 2 ** failures));
      }
    };
    schedule(0);
    return () => { active = false; controller?.abort(); clearTimeout(timer); clearTimeout(staleTimer); clearImage(); };
  }, [enabled, imageRef, role, rotation, videoRef]);
  return state;
}
