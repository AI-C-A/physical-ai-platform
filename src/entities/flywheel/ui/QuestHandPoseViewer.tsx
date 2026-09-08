import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import { Badge } from '@/shared/ui/badge';
import { FittedMedia, MediaPanel, MediaStreamPlaceholder, getMediaStreamLabel, type MediaStreamState } from '@/shared/ui/media-panel';
import { readCollectionVisualPalette } from './collection-visual-palette';

import type {
  CollectionHandPoseTelemetry,
  CollectionStreamTelemetry,
} from '../model/flywheel';
import { transformJointToViewer } from './quest-hand-pose-geometry';
import { loadQuestSmoothHand, type QuestSmoothHand } from './quest-smooth-hand';

type Handedness = 'left' | 'right';

interface QuestHandPoseViewerProps {
  readonly className?: string;
  readonly handPose?: CollectionHandPoseTelemetry | null;
  readonly streams?: readonly CollectionStreamTelemetry[];
  readonly streamState?: MediaStreamState;
  readonly availability?: Readonly<Record<Handedness, MediaStreamState>>;
}

function handStream(
  streams: readonly CollectionStreamTelemetry[],
  handedness: Handedness,
): CollectionStreamTelemetry | null {
  return streams.find((stream) => stream.streamId === `quest-hand-${handedness}`) ?? null;
}

function handStateLabel(
  pose: CollectionHandPoseTelemetry | null,
  handedness: Handedness,
  stream: CollectionStreamTelemetry | null,
): string {
  const observation = pose?.hands[handedness];
  if (stream?.connectionState === 'offline') return '연결 끊김';
  if (stream?.connectionState === 'stale') return '수신 지연';
  if (observation?.poseObserved === true) return '추적';
  if (observation?.sourcePresent === false) return '유실';
  return stream?.handTracking?.qualityState === 'tracking'
    ? '추적'
    : stream?.handTracking?.qualityState === 'lost' ? '유실' : '부분';
}

function stateTone(label: string): 'positive' | 'warning' | 'negative' | 'neutral' {
  if (label === '추적') return 'positive';
  if (label === '부분' || label === '수신 지연') return 'warning';
  if (label === '수신 대기') return 'neutral';
  return 'negative';
}

export function QuestHandPoseViewer({
  className,
  handPose: receivedPose = null,
  streams = [],
  streamState = 'idle',
  availability,
}: QuestHandPoseViewerProps) {
  const leftAvailability = availability?.left ?? (streamState === 'recorded' ? 'recorded' : handStream(streams, 'left')?.connectionState ?? streamState);
  const rightAvailability = availability?.right ?? (streamState === 'recorded' ? 'recorded' : handStream(streams, 'right')?.connectionState ?? streamState);
  const handPose = useMemo(() => {
    if (receivedPose === null) return null;
    const leftAvailable = leftAvailability === 'live' || leftAvailability === 'recorded';
    const rightAvailable = rightAvailability === 'live' || rightAvailability === 'recorded';
    if (leftAvailable && rightAvailable) return receivedPose;
    return { ...receivedPose, hands: {
      left: leftAvailable ? receivedPose.hands.left : { sourcePresent: false, poseObserved: false, joints: [] },
      right: rightAvailable ? receivedPose.hands.right : { sourcePresent: false, poseObserved: false, joints: [] },
    } };
  }, [receivedPose, leftAvailability, rightAvailability]);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const updateSceneRef = useRef<(fitCamera: boolean) => void>(() => undefined);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [webGlUnavailable, setWebGlUnavailable] = useState(false);
  const hasObservedJoints = (['left', 'right'] as const).some((handedness) => (
    handPose?.hands[handedness].poseObserved === true && handPose.hands[handedness].joints.length > 0
  ));
  const poseRef = useRef(handPose);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (host === null) return undefined;
    if (typeof globalThis.WebGLRenderingContext === 'undefined') {
      void Promise.resolve().then(() => setWebGlUnavailable(true));
      return undefined;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      void Promise.resolve().then(() => setWebGlUnavailable(true));
      return undefined;
    }
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    renderer.domElement.className = 'block size-full touch-none';
    renderer.domElement.setAttribute('aria-label', 'Quest 양손 3D 손 모델 캔버스');
    host.replaceChildren(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.001, 10);
    camera.position.set(0, 0.16, 0.36);
    camera.lookAt(0, 0, 0);
    const palette = readCollectionVisualPalette(host);
    const light = new THREE.HemisphereLight(palette.light, palette.groundLight, 2.2);
    scene.add(light);

    const hands = new Map<Handedness, QuestSmoothHand>();
    let disposed = false;
    const keyLight = new THREE.DirectionalLight(palette.light, 2);
    keyLight.position.set(-0.3, 0.6, 1);
    scene.add(keyLight);
    (['left', 'right'] as const).forEach((side) => {
      void loadQuestSmoothHand(side, palette[side]).then((hand) => {
        if (disposed) { hand.dispose(); return; }
        hands.set(side, hand);
        scene.add(hand.root);
        updateScene(true);
      }).catch(() => {
        if (!disposed) setModelLoadFailed(true);
      });
    });

    const allPoints: THREE.Vector3[] = [];
    const center = new THREE.Vector3();
    let hadPoints = false;
    let wasEgocentric = false;
    const render = () => renderer.render(scene, camera);
    const updateScene = (fitCamera: boolean) => {
      const currentPose = poseRef.current;
      const viewerPose = currentPose?.viewerPose;
      const toPoint = (position: readonly [number, number, number]) => viewerPose != null
        ? transformJointToViewer(position, viewerPose) : new THREE.Vector3(...position);
      allPoints.length = 0;
      (['left', 'right'] as const).forEach((side) => {
        const hand = currentPose?.hands[side];
        if (hand?.poseObserved) hand.joints.forEach((joint) => allPoints.push(toPoint(joint.positionMeters)));
      });
      const egocentric = viewerPose != null;
      center.set(0, 0, 0);
      if (!egocentric && allPoints.length > 0) {
        allPoints.forEach((point) => center.add(point));
        center.multiplyScalar(1 / allPoints.length);
      }
      hands.forEach((hand, side) => hand.update(currentPose, side, center));
      if (viewerPose != null) {
        camera.position.set(0, 0, 0);
        camera.quaternion.identity();
        camera.fov = 85;
        camera.updateProjectionMatrix();
      } else if (fitCamera || wasEgocentric || (!hadPoints && allPoints.length > 0)) {
        camera.fov = 38;
        camera.updateProjectionMatrix();
        const box = new THREE.Box3().setFromPoints(allPoints.map((point) => point.clone().sub(center)));
        const size = box.isEmpty() ? 0.28 : Math.max(box.getSize(new THREE.Vector3()).length(), 0.12);
        // local-floor의 +X는 오른쪽, -Z는 정면이다. 기존 녹화는
        // 착용자 쪽에서 손을 약간 내려다보는 고정 방향으로 표시한다.
        camera.position.set(0, size * 0.8, size * 1.8);
        camera.lookAt(0, 0, 0);
      }
      wasEgocentric = egocentric;
      hadPoints = allPoints.length > 0;
      render();
    };

    updateSceneRef.current = updateScene;
    updateScene(true);
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    return () => {
      updateSceneRef.current = () => undefined;
      observer.disconnect();
      disposed = true;
      hands.forEach((hand) => hand.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    poseRef.current = handPose;
    updateSceneRef.current(false);
  }, [handPose]);

  const leftStream = handStream(streams, 'left');
  const rightStream = handStream(streams, 'right');
  const leftState = leftAvailability === 'live' || leftAvailability === 'recorded' ? handStateLabel(handPose, 'left', streamState === 'recorded' ? null : leftStream) : getMediaStreamLabel(leftAvailability);
  const rightState = rightAvailability === 'live' || rightAvailability === 'recorded' ? handStateLabel(handPose, 'right', streamState === 'recorded' ? null : rightStream) : getMediaStreamLabel(rightAvailability);
  const displayState = leftAvailability === 'recorded' ? 'recorded' : leftAvailability === 'live' || rightAvailability === 'live' ? 'live'
    : leftAvailability === 'stale' || rightAvailability === 'stale' ? 'stale' : leftAvailability === 'offline' || rightAvailability === 'offline' ? 'offline' : 'idle';
  const missingViewerPose = displayState === 'live' && handPose?.viewerPose == null;
  const unavailable = displayState === 'idle' || displayState === 'offline' || displayState === 'stale' ? displayState : null;

  return (
    <FittedMedia className={`items-center ${className ?? ''}`}>
    <MediaPanel
      aria-label="Quest 손 포즈 3D"
      className="h-auto"
      data-hand-pose-viewer
      data-stream-state={displayState}
      data-hand-transport={handPose?.delivery?.transport}
      data-hand-frame-timestamp={handPose?.deviceTimestampMs}
      title="손 추적"
      status={(
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={stateTone(leftState)}>L {leftState}</Badge>
          <Badge tone={stateTone(rightState)}>R {rightState}</Badge>
          {displayState === 'live' && handPose?.delivery && (
            <Badge tone={handPose.delivery.transport === 'webrtc' ? 'positive' : 'neutral'}>
              {handPose.delivery.transport === 'webrtc' ? '직접 연결' : '중계 연결'}
              {handPose.delivery.roundTripMs !== null ? ` · 왕복 ${Math.round(handPose.delivery.roundTripMs)}ms` : ''}
            </Badge>
          )}
        </div>
      )}
    >

      <div data-aspect-media-viewport className="relative aspect-video min-h-0">
        <div className="absolute inset-0" ref={canvasHostRef} hidden={unavailable !== null || missingViewerPose} />
        {unavailable !== null ? <MediaStreamPlaceholder state={unavailable} /> : missingViewerPose ? (
          <div className="absolute inset-0 grid place-items-center p-2 text-center">
            <p className="text-xs font-semibold" role="status">머리 추적 수신 대기 · Quest를 새로고침하고 다시 연결하세요.</p>
          </div>
        ) : !hasObservedJoints ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-2 text-center">
            <p className="text-xs font-semibold">손 프레임 대기</p>
          </div>
        ) : null}
        {modelLoadFailed && unavailable === null ? (
          <p className="absolute inset-x-3 bottom-3 rounded-[var(--design-radius-control)] bg-layer-raised p-2 text-xs text-muted" role="status">
            손 모델을 불러오지 못했습니다. 페이지를 새로고침해 주세요.
          </p>
        ) : null}
        {webGlUnavailable && unavailable === null ? (
          <p className="absolute inset-x-3 bottom-3 rounded-[var(--design-radius-control)] bg-layer-raised p-2 text-xs text-muted" role="status">
            3D 화면을 표시할 수 없습니다. 브라우저의 그래픽 가속 설정을 확인하세요.
          </p>
        ) : null}
      </div>
    </MediaPanel>
    </FittedMedia>
  );
}
