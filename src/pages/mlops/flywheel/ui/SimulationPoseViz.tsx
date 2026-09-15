import { useEffect, useRef, type MutableRefObject } from 'react';

import type { SimulationBridgeSnapshot } from '@/entities/simulation-collection';

/** WebXR 25관절 손 순서의 손가락 사슬(손목 → 각 손가락 끝). */
const FINGER_CHAINS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [0, 5, 6, 7, 8, 9],
  [0, 10, 11, 12, 13, 14],
  [0, 15, 16, 17, 18, 19],
  [0, 20, 21, 22, 23, 24],
];

type Vec3 = readonly [number, number, number];

interface PoseColors {
  readonly left: string;
  readonly right: string;
  readonly joint: string;
  readonly shell: string;
  readonly gridMajor: string;
  readonly gridMinor: string;
  readonly muted: string;
}

function readColors(element: HTMLElement): PoseColors {
  const style = getComputedStyle(element);
  const pick = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  // 폴백도 토큰을 가리켜, 이 파일에는 색상 리터럴을 두지 않는다.
  const muted = pick('--muted', pick('--visual-pose-joint', 'gray'));
  return {
    left: pick('--visual-pose-left', muted),
    right: pick('--visual-pose-right', muted),
    joint: pick('--visual-pose-joint', muted),
    shell: pick('--visual-pose-shell', muted),
    gridMajor: pick('--visual-pose-grid-major', muted),
    gridMinor: pick('--visual-pose-grid-minor', muted),
    muted,
  };
}

function isLeft(id: string): boolean {
  return id === 'left' || id.endsWith('/left');
}

interface Bounds { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; }

function extend(bounds: Bounds, p: Vec3): void {
  bounds.minX = Math.min(bounds.minX, p[0]); bounds.maxX = Math.max(bounds.maxX, p[0]);
  bounds.minY = Math.min(bounds.minY, p[1]); bounds.maxY = Math.max(bounds.maxY, p[1]);
  bounds.minZ = Math.min(bounds.minZ, p[2]); bounds.maxZ = Math.max(bounds.maxZ, p[2]);
}

/**
 * 브리지가 실어 오는 머리·양손 자세를 정면(X·Y)과 위(X·Z) 두 시점으로 그린다.
 *
 * 고주기 스냅샷은 React 상태가 아니라 ref로 읽어, 자세가 흔들려도 페이지가 리렌더되지
 * 않는다. 손 관절 25점이 오면 손가락 사슬을, 없으면 손 위치 점만 그린다.
 */
export function SimulationPoseViz({ latestRef, connected }: {
  readonly latestRef: MutableRefObject<SimulationBridgeSnapshot | null>;
  readonly connected: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas === null || wrap === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    let colors = readColors(canvas);
    let raf = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = wrap.clientWidth;
      height = wrap.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colors = readColors(canvas);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const drawView = (snapshot: SimulationBridgeSnapshot, x0: number, w: number, axis: 'front' | 'top', title: string) => {
      const pad = 16;
      const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
      if (snapshot.head) extend(bounds, snapshot.head);
      for (const hand of snapshot.hands) {
        extend(bounds, hand.position);
        if (hand.joints) for (const j of hand.joints) if (j) extend(bounds, j);
      }
      if (!Number.isFinite(bounds.minX)) return;
      const spanH = axis === 'front' ? bounds.maxX - bounds.minX : bounds.maxX - bounds.minX;
      const spanV = axis === 'front' ? bounds.maxY - bounds.minY : bounds.maxZ - bounds.minZ;
      const span = Math.max(0.4, spanH, spanV);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cv = axis === 'front' ? (bounds.minY + bounds.maxY) / 2 : (bounds.minZ + bounds.maxZ) / 2;
      const size = Math.min(w, height) - pad * 2;
      const scale = size / span;
      const ox = x0 + w / 2;
      const oy = height / 2;
      const project = (p: Vec3): [number, number] => {
        const h = (p[0] - cx) * scale;
        const v = (axis === 'front' ? p[1] - cv : p[2] - cv) * scale;
        // 정면은 Y가 위로, 위 시점은 Z가 아래로 향하게 화면 좌표로 뒤집는다.
        return [ox + h, axis === 'front' ? oy - v : oy + v];
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, 0, w, height);
      ctx.clip();

      // 바닥/기준 격자.
      ctx.strokeStyle = colors.gridMinor;
      ctx.lineWidth = 1;
      for (let i = -2; i <= 2; i += 1) {
        const gx = ox + i * 0.25 * scale;
        ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, height - pad); ctx.stroke();
        const gy = oy + i * 0.25 * scale;
        ctx.beginPath(); ctx.moveTo(x0 + pad, gy); ctx.lineTo(x0 + w - pad, gy); ctx.stroke();
      }

      ctx.fillStyle = colors.muted;
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(title, x0 + pad, pad + 4);

      if (snapshot.head) {
        const [hx, hy] = project(snapshot.head);
        ctx.fillStyle = colors.shell;
        ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
      }

      for (const hand of snapshot.hands) {
        const color = isLeft(hand.id) ? colors.left : colors.right;
        if (hand.joints && hand.joints.length >= 25) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          for (const chain of FINGER_CHAINS) {
            ctx.beginPath();
            let started = false;
            for (const idx of chain) {
              const j = hand.joints[idx];
              if (!j) { started = false; continue; }
              const [px, py] = project(j);
              if (started) ctx.lineTo(px, py); else ctx.moveTo(px, py);
              started = true;
            }
            ctx.stroke();
          }
          ctx.fillStyle = colors.joint;
          for (const j of hand.joints) {
            if (!j) continue;
            const [px, py] = project(j);
            ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        }
        const [px, py] = project(hand.position);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, hand.grabbing ? 6 : 4, 0, Math.PI * 2); ctx.fill();
        if (hand.grabbing) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, py, 9, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    };

    const pad0 = 8;
    const render = () => {
      raf = requestAnimationFrame(render);
      ctx.clearRect(0, 0, width, height);
      const snapshot = latestRef.current;
      if (snapshot === null || (snapshot.hands.length === 0 && snapshot.head === null)) {
        ctx.fillStyle = colors.muted;
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(connected ? '자세 데이터 수신 대기' : '시뮬레이션 화면 연결 대기', width / 2, height / 2);
        ctx.textAlign = 'start';
        return;
      }
      const half = width / 2;
      drawView(snapshot, 0, half, 'front', '정면 (X·Y)');
      drawView(snapshot, half, half, 'top', '평면 (X·Z)');
      ctx.strokeStyle = colors.gridMajor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(half, pad0); ctx.lineTo(half, height - pad0); ctx.stroke();
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [latestRef, connected]);

  return (
    <div ref={wrapRef} className="simulation-pose-viz" aria-label="수집 자세 시각화" role="img">
      <canvas ref={canvasRef} />
      <div className="simulation-pose-legend" aria-hidden="true">
        <span><i style={{ background: 'var(--visual-pose-left)' }} />왼손</span>
        <span><i style={{ background: 'var(--visual-pose-right)' }} />오른손</span>
        <span><i style={{ background: 'var(--visual-pose-shell)' }} />머리</span>
      </div>
    </div>
  );
}
