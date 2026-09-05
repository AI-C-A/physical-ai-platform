import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/ui/class-names';
import {
  ModelViewer,
  type ModelViewerElement,
  type ModelViewerNodePose,
} from '@/shared/ui/model-viewer';
import { Spinner } from '@/shared/ui/spinner';
import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

import type {
  CollectionHandJointPose,
  CollectionHandPoseTelemetry,
  CollectionSpatialTelemetry,
} from '../model/flywheel';

type RigView = 'perspective' | 'front' | 'side';
type RigStreamState = 'idle' | 'live' | 'recorded';

interface HumanoidRigViewerProps {
  readonly active?: boolean;
  readonly driftMs?: number;
  readonly playbackPlaying?: boolean;
  readonly playbackPositionMs?: number;
  readonly poseRateHz?: number | null;
  readonly presentation?: 'default' | 'monitoring';
  readonly showSkeleton?: boolean;
  readonly handPose?: CollectionHandPoseTelemetry | null;
  readonly spatial?: CollectionSpatialTelemetry | null;
  readonly streamState?: RigStreamState;
}

const OPENARM_MODEL_URL = `${import.meta.env.BASE_URL}assets/openarm-bimanual-five-finger.glb?motion=2`;
const OPENARM_ANIMATION_NAME = 'Episode Preview';

type OpenArmFingerSegment = {
  readonly modelSegment: 'proximal' | 'distal';
  readonly questFrom: string;
  readonly questTo: string;
};

const openArmFingerSegments: Readonly<Record<string, readonly OpenArmFingerSegment[]>> = {
  index: [
    { modelSegment: 'proximal', questFrom: 'index-finger-phalanx-proximal', questTo: 'index-finger-phalanx-intermediate' },
    { modelSegment: 'distal', questFrom: 'index-finger-phalanx-distal', questTo: 'index-finger-tip' },
  ],
  middle: [
    { modelSegment: 'proximal', questFrom: 'middle-finger-phalanx-proximal', questTo: 'middle-finger-phalanx-intermediate' },
    { modelSegment: 'distal', questFrom: 'middle-finger-phalanx-distal', questTo: 'middle-finger-tip' },
  ],
  ring: [
    { modelSegment: 'proximal', questFrom: 'ring-finger-phalanx-proximal', questTo: 'ring-finger-phalanx-intermediate' },
    { modelSegment: 'distal', questFrom: 'ring-finger-phalanx-distal', questTo: 'ring-finger-tip' },
  ],
  little: [
    { modelSegment: 'proximal', questFrom: 'pinky-finger-phalanx-proximal', questTo: 'pinky-finger-phalanx-intermediate' },
    { modelSegment: 'distal', questFrom: 'pinky-finger-phalanx-distal', questTo: 'pinky-finger-tip' },
  ],
  thumb: [
    { modelSegment: 'proximal', questFrom: 'thumb-phalanx-proximal', questTo: 'thumb-phalanx-distal' },
    { modelSegment: 'distal', questFrom: 'thumb-phalanx-distal', questTo: 'thumb-tip' },
  ],
};

function questPositionInOpenArmHand(
  handedness: 'left' | 'right',
  joint: CollectionHandJointPose,
  wrist: CollectionHandJointPose,
): readonly [number, number, number] {
  const relative = [
    joint.positionMeters[0] - wrist.positionMeters[0],
    joint.positionMeters[1] - wrist.positionMeters[1],
    joint.positionMeters[2] - wrist.positionMeters[2],
  ] as const;
  const [qx, qy, qz, qw] = wrist.orientationQuaternion;
  const quaternionLength = Math.hypot(qx, qy, qz, qw) || 1;
  const ix = -qx / quaternionLength;
  const iy = -qy / quaternionLength;
  const iz = -qz / quaternionLength;
  const iw = qw / quaternionLength;
  const tx = 2 * (iy * relative[2] - iz * relative[1]);
  const ty = 2 * (iz * relative[0] - ix * relative[2]);
  const tz = 2 * (ix * relative[1] - iy * relative[0]);
  const local = [
    relative[0] + iw * tx + (iy * tz - iz * ty),
    relative[1] + iw * ty + (iz * tx - ix * tz),
    relative[2] + iw * tz + (ix * ty - iy * tx),
  ] as const;
  const mirror = handedness === 'left' ? -1 : 1;
  return [local[0] * mirror, -local[2], local[1]];
}

function applyQuestHandPoseToOpenArm(
  modelViewer: ModelViewerElement,
  handPose: CollectionHandPoseTelemetry | null,
): void {
  const poses: ModelViewerNodePose[] = [];
  (['left', 'right'] as const).forEach((handedness) => {
    const observation = handPose?.hands[handedness];
    const joints = observation?.poseObserved === true ? getJointMap(observation.joints) : null;
    const wrist = joints?.get('wrist');
    Object.entries(openArmFingerSegments).forEach(([finger, segments]) => {
      segments.forEach((segment) => {
        const name = `openarm_${handedness}_${finger}_${segment.modelSegment}`;
        const from = joints?.get(segment.questFrom);
        const to = joints?.get(segment.questTo);
        if (from === undefined || to === undefined || wrist === undefined) {
          poses.push({ name, reset: true });
          return;
        }
        poses.push({
          name,
          start: questPositionInOpenArmHand(handedness, from, wrist),
          end: questPositionInOpenArmHand(handedness, to, wrist),
        });
      });
    });
  });
  modelViewer.setNodePoses?.(poses);
}

const viewOptions = [
  { cameraOrbit: '-45deg 72deg 115%', label: '원근', value: 'perspective' },
  { cameraOrbit: '-90deg 75deg 110%', label: '정면', value: 'front' },
  { cameraOrbit: '0deg 75deg 110%', label: '측면', value: 'side' },
] as const satisfies readonly {
  readonly cameraOrbit: string;
  readonly label: string;
  readonly value: RigView;
}[];

const rigSensors = [
  {
    id: 'head-camera',
    label: 'HEAD RGB',
    normal: '0 0 1',
    position: '0.1 0.69 0',
  },
  {
    id: 'left-hand-camera',
    label: 'L HAND',
    normal: '0 0 1',
    position: '0.02 0.14 0.24',
  },
  {
    id: 'right-hand-camera',
    label: 'R HAND',
    normal: '0 0 1',
    position: '0.02 0.14 -0.24',
  },
] as const;

const skeletonJoints = [
  { id: 'head', x: 120, y: 42, source: 'body' },
  { id: 'neck', x: 120, y: 72, source: 'body' },
  { id: 'left-shoulder', x: 86, y: 82, source: 'body' },
  { id: 'right-shoulder', x: 154, y: 82, source: 'body' },
  { id: 'left-elbow', x: 65, y: 128, source: 'body' },
  { id: 'right-elbow', x: 175, y: 128, source: 'body' },
  { id: 'left-wrist', x: 51, y: 174, source: 'hand' },
  { id: 'right-wrist', x: 189, y: 174, source: 'hand' },
  { id: 'spine', x: 120, y: 157, source: 'body' },
  { id: 'left-hip', x: 96, y: 193, source: 'body' },
  { id: 'right-hip', x: 144, y: 193, source: 'body' },
  { id: 'left-knee', x: 87, y: 252, source: 'body' },
  { id: 'right-knee', x: 153, y: 252, source: 'body' },
  { id: 'left-ankle', x: 78, y: 319, source: 'body' },
  { id: 'right-ankle', x: 162, y: 319, source: 'body' },
] as const;

const skeletonBones = [
  ['head', 'neck'],
  ['neck', 'left-shoulder'],
  ['neck', 'right-shoulder'],
  ['left-shoulder', 'left-elbow'],
  ['left-elbow', 'left-wrist'],
  ['right-shoulder', 'right-elbow'],
  ['right-elbow', 'right-wrist'],
  ['neck', 'spine'],
  ['spine', 'left-hip'],
  ['spine', 'right-hip'],
  ['left-hip', 'right-hip'],
  ['left-hip', 'left-knee'],
  ['left-knee', 'left-ankle'],
  ['right-hip', 'right-knee'],
  ['right-knee', 'right-ankle'],
] as const;

const skeletonJointsById = new Map(
  skeletonJoints.map((joint) => [joint.id, joint]),
);

const handSkeletonBones = [
  ['wrist', 'thumb-metacarpal'],
  ['thumb-metacarpal', 'thumb-phalanx-proximal'],
  ['thumb-phalanx-proximal', 'thumb-phalanx-distal'],
  ['thumb-phalanx-distal', 'thumb-tip'],
  ['wrist', 'index-finger-metacarpal'],
  ['index-finger-metacarpal', 'index-finger-phalanx-proximal'],
  ['index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate'],
  ['index-finger-phalanx-intermediate', 'index-finger-phalanx-distal'],
  ['index-finger-phalanx-distal', 'index-finger-tip'],
  ['wrist', 'middle-finger-metacarpal'],
  ['middle-finger-metacarpal', 'middle-finger-phalanx-proximal'],
  ['middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate'],
  ['middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal'],
  ['middle-finger-phalanx-distal', 'middle-finger-tip'],
  ['wrist', 'ring-finger-metacarpal'],
  ['ring-finger-metacarpal', 'ring-finger-phalanx-proximal'],
  ['ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate'],
  ['ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal'],
  ['ring-finger-phalanx-distal', 'ring-finger-tip'],
  ['wrist', 'pinky-finger-metacarpal'],
  ['pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal'],
  ['pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate'],
  ['pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal'],
  ['pinky-finger-phalanx-distal', 'pinky-finger-tip'],
] as const;

function getJointMap(joints: readonly CollectionHandJointPose[]) {
  return new Map(joints.map((joint) => [joint.name, joint]));
}

function getOpenArmJointPosition(
  handedness: 'left' | 'right',
  joint: CollectionHandJointPose,
  wrist: CollectionHandJointPose,
): string {
  const [x, y, z] = joint.positionMeters;
  const [wristX, wristY, wristZ] = wrist.positionMeters;
  const anchor = handedness === 'left'
    ? [0.02, 0.14, 0.24] as const
    : [0.02, 0.14, -0.24] as const;
  return `${String(anchor[0] - (z - wristZ))} ${String(anchor[1] + (y - wristY))} ${String(anchor[2] + (x - wristX))}`;
}

function projectSkeletonJoint(
  handedness: 'left' | 'right',
  joint: CollectionHandJointPose,
  wrist: CollectionHandJointPose,
): { readonly x: number; readonly y: number; readonly depth: number } {
  const anchor = handedness === 'left' ? { x: 51, y: 174 } : { x: 189, y: 174 };
  const [x, y, z] = joint.positionMeters;
  const [wristX, wristY, wristZ] = wrist.positionMeters;
  return {
    x: anchor.x + (x - wristX) * 520 + (z - wristZ) * 100,
    y: anchor.y - (y - wristY) * 520,
    depth: z - wristZ,
  };
}

function getStreamStateLabel(state: RigStreamState): string {
  if (state === 'live') return 'LIVE';
  if (state === 'recorded') return 'RECORDED';
  return '대기';
}

function getStreamStateDotClassName(state: RigStreamState): string {
  if (state === 'live') return 'bg-positive';
  if (state === 'recorded') return 'bg-action-primary';
  return 'bg-muted';
}

function SkeletonPose({ handPose }: { readonly handPose: CollectionHandPoseTelemetry | null }) {
  return (
    <section
      aria-label="전면 RGB 전신과 헤드 RGB 손 추적 3D 스켈레톤"
      className="relative min-h-0 overflow-hidden rounded-[var(--design-radius-control)] bg-layer-canvas"
    >
      <svg
        aria-hidden="true"
        className="h-full min-h-0 w-full text-action-primary"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 240 360"
      >
        <g className="text-border" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M20 330 L120 282 L220 330" opacity="0.45" />
          <path d="M45 342 L120 304 L195 342" opacity="0.3" />
          <path d="M120 282 L120 350" opacity="0.35" />
          <path d="M32 325 L32 292" opacity="0.35" />
          <path d="M32 325 L64 325" opacity="0.35" />
          <path d="M32 325 L18 340" opacity="0.35" />
        </g>
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="5">
          {skeletonBones.map(([fromId, toId]) => {
            const from = skeletonJointsById.get(fromId);
            const to = skeletonJointsById.get(toId);
            if (from === undefined || to === undefined) return null;
            const handBone = from.source === 'hand' || to.source === 'hand';
            return (
              <line
                className={handBone ? 'text-positive' : undefined}
                key={`${fromId}-${toId}`}
                x1={from.x}
                x2={to.x}
                y1={from.y}
                y2={to.y}
              />
            );
          })}
        </g>
        <g>
          {skeletonJoints.map((joint) => (
            <circle
              className={joint.source === 'hand' ? 'fill-positive' : 'fill-action-primary'}
              cx={joint.x}
              cy={joint.y}
              key={joint.id}
              r={joint.id === 'head' ? 10 : joint.source === 'hand' ? 6 : 4.5}
            />
          ))}
        </g>
        {(['left', 'right'] as const).map((handedness) => {
          const hand = handPose?.hands[handedness];
          if (hand?.poseObserved !== true) return null;
          const joints = getJointMap(hand.joints);
          const wrist = joints.get('wrist');
          if (wrist === undefined) return null;
          return (
            <g data-hand-pose={handedness} key={handedness}>
              <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
                {handSkeletonBones.map(([fromName, toName]) => {
                  const from = joints.get(fromName);
                  const to = joints.get(toName);
                  if (from === undefined || to === undefined) return null;
                  const fromPoint = projectSkeletonJoint(handedness, from, wrist);
                  const toPoint = projectSkeletonJoint(handedness, to, wrist);
                  return <line key={`${fromName}-${toName}`} x1={fromPoint.x} x2={toPoint.x} y1={fromPoint.y} y2={toPoint.y} />;
                })}
              </g>
              <g className="fill-positive">
                {hand.joints.map((joint) => {
                  const point = projectSkeletonJoint(handedness, joint, wrist);
                  return <circle cx={point.x} cy={point.y} key={joint.name} opacity={Math.max(0.55, Math.min(1, 0.8 + point.depth * 4))} r={joint.name === 'wrist' ? 4 : 2.3} />;
                })}
              </g>
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function OpenArmHandPoseHotspots({ handPose }: { readonly handPose: CollectionHandPoseTelemetry | null }) {
  if (handPose === null) return null;
  return (['left', 'right'] as const).flatMap((handedness) => {
    const hand = handPose.hands[handedness];
    if (!hand.poseObserved) return [];
    const wrist = hand.joints.find((joint) => joint.name === 'wrist');
    if (wrist === undefined) return [];
    return hand.joints.map((joint) => (
      <span
        aria-hidden="true"
        className="pointer-events-none block size-1.5 rounded-full bg-positive shadow-[0_0_6px_var(--color-positive)]"
        data-hand-joint={joint.name}
        data-hand-pose={handedness}
        data-normal="0 1 0"
        data-position={getOpenArmJointPosition(handedness, joint, wrist)}
        key={`${handedness}-${joint.name}`}
        slot={`hotspot-quest-${handedness}-${joint.name}`}
      />
    ));
  });
}

export function HumanoidRigViewer({
  active = false,
  driftMs = 18,
  playbackPlaying,
  playbackPositionMs,
  poseRateHz = null,
  presentation = 'default',
  showSkeleton = false,
  handPose = null,
  spatial = null,
  streamState,
}: HumanoidRigViewerProps) {
  const [view, setView] = useState<RigView>('perspective');
  const [localMotionPlaying, setLocalMotionPlaying] = useState(true);
  const modelViewerRef = useRef<ModelViewerElement>(null);
  const selectedView = viewOptions.find((option) => option.value === view)
    ?? viewOptions[0];
  const motionPlaying = playbackPlaying ?? localMotionPlaying;
  const resolvedStreamState = streamState ?? (active ? 'live' : 'idle');

  useEffect(() => {
    const modelViewer = modelViewerRef.current;
    if (modelViewer === null) return undefined;

    const syncMotion = () => {
      if (motionPlaying) {
        modelViewer.play?.({ repetitions: Infinity });
      } else {
        modelViewer.pause?.();
      }
    };
    syncMotion();
    modelViewer.addEventListener('load', syncMotion);
    return () => modelViewer.removeEventListener('load', syncMotion);
  }, [motionPlaying]);

  useEffect(() => {
    if (playbackPositionMs === undefined) return;
    const modelViewer = modelViewerRef.current;
    if (modelViewer !== null) modelViewer.currentTime = playbackPositionMs / 1_000;
  }, [playbackPositionMs]);

  useEffect(() => {
    const modelViewer = modelViewerRef.current;
    if (modelViewer === null) return undefined;
    const syncHandPose = () => applyQuestHandPoseToOpenArm(modelViewer, handPose);
    syncHandPose();
    modelViewer.addEventListener('load', syncHandPose);
    return () => modelViewer.removeEventListener('load', syncHandPose);
  }, [handPose]);

  return (
    <section
      aria-label="휴머노이드 Rig 3D 자세"
      className={presentation === 'monitoring'
        ? 'h-full min-h-0'
        : 'grid gap-3'}
      data-presentation={presentation}
    >
      {presentation === 'default' ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <strong>{showSkeleton ? '자세 추정 3D' : 'OpenArm Rig'}</strong>
            <>
              <Badge tone={resolvedStreamState === 'live'
                ? 'positive'
                : resolvedStreamState === 'recorded'
                  ? 'info'
                  : 'neutral'}>
                {getStreamStateLabel(resolvedStreamState)}
              </Badge>
              <Badge tone={motionPlaying ? 'positive' : 'neutral'}>
                {motionPlaying ? 'MOTION' : 'PAUSED'}
              </Badge>
            </>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              aria-label={motionPlaying ? 'OpenArm 동작 일시정지' : 'OpenArm 동작 재생'}
              aria-pressed={motionPlaying}
              className="min-h-9 gap-1.5 px-2.5 py-1 text-xs"
              onClick={() => setLocalMotionPlaying((playing) => !playing)}
              variant="secondary"
            >
              {motionPlaying ? '일시정지' : '재생'}
            </Button>
            <div aria-label="3D 시점" className="flex gap-1" role="group">
              {viewOptions.map((option) => (
                <Button
                  aria-pressed={view === option.value}
                  className="min-h-9 px-2.5 py-1 text-xs"
                  key={option.value}
                  onClick={() => setView(option.value)}
                  variant={view === option.value ? 'secondary' : 'ghost'}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className={presentation === 'monitoring'
        ? showSkeleton
          ? 'grid h-full min-h-0 grid-rows-2 gap-2'
          : 'relative min-h-0 overflow-hidden'
        : showSkeleton
          ? 'grid min-h-[40rem] gap-2 lg:grid-cols-2'
          : 'relative min-h-80 overflow-hidden rounded-[var(--design-radius-surface)] bg-layer-canvas'}>
        <div className={`relative min-h-0 overflow-hidden ${showSkeleton ? 'rounded-[var(--design-radius-control)] bg-layer-canvas' : ''}`}>
          <ModelViewer
            alt="OpenArm v1 기반 5지 양팔 로봇 3D 시각화"
            animation-name={OPENARM_ANIMATION_NAME}
            autoplay={motionPlaying}
            camera-controls
            camera-orbit={selectedView.cameraOrbit}
            camera-target="0m 0.4m 0m"
            className={presentation === 'monitoring'
              ? 'block h-full min-h-0 w-full'
              : 'block h-96 w-full'}
            environment-image="neutral"
            elementRef={modelViewerRef}
            errorFallback={(retry) => (
              <div className="absolute inset-0 grid place-items-center p-4">
                <div className="grid justify-items-center gap-2 text-center">
                  <p className="text-sm text-muted" role="status">
                    3D 모델을 표시할 수 없습니다.
                  </p>
                  <Button onClick={retry} variant="secondary">다시 시도</Button>
                </div>
              </div>
            )}
            interaction-prompt="none"
            loading="eager"
            loadingFallback={(
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <Spinner className="size-6 text-muted" label="휴머노이드 3D 모델 불러오는 중" />
              </div>
            )}
            reveal="auto"
            shadow-intensity="1.2"
            shadow-softness="0.8"
            src={OPENARM_MODEL_URL}
            time-scale={0.85}
            touch-action="pan-y"
          >
            <span slot="progress-bar" />
            <OpenArmHandPoseHotspots handPose={handPose} />
            {presentation === 'default'
              ? rigSensors.map((sensor) => (
                <div
                  aria-label={`${sensor.label} 장착 위치`}
                  className={cn(
                    'pointer-events-none flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold text-foreground',
                    getFloatingSurfaceClassName(),
                  )}
                  data-normal={sensor.normal}
                  data-position={sensor.position}
                  key={sensor.id}
                  slot={`hotspot-${sensor.id}`}
                >
                  <span className={`size-1.5 rounded-full ${getStreamStateDotClassName(resolvedStreamState)}`} />
                  {sensor.label}
                </div>
              ))
              : null}
          </ModelViewer>

          {presentation === 'default' ? (
            <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
              <span className={cn(
                'rounded-[var(--design-radius-control)] px-2.5 py-1.5 text-xs text-muted',
                getFloatingSurfaceClassName(),
              )}>
                드래그하여 회전 · 스크롤하여 확대
              </span>
              <span className={cn(
                'rounded-[var(--design-radius-control)] px-2.5 py-1.5 text-xs text-muted',
                getFloatingSurfaceClassName(),
              )}>
                양팔 14축 · 6.0s 루프
              </span>
            </div>
          ) : null}

          {presentation === 'monitoring' && spatial !== null ? (
            <div
              aria-label="로봇 공간 상태"
              className={cn(
                'pointer-events-none absolute inset-x-2 bottom-2 grid gap-1 rounded-[var(--design-radius-control)] px-2.5 py-2 text-[10px] leading-4 text-foreground',
                getFloatingSurfaceClassName(),
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="font-semibold">{spatial.coordinateFrame}</span>
                <span className="tabular-nums text-muted">
                  XYZ {spatial.positionMeters.map((value) => value.toFixed(2)).join(' / ')} m
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 text-muted">
                <span className="tabular-nums">
                  RPY {spatial.orientationRpyDegrees.map((value) => value.toFixed(1)).join(' / ')}°
                </span>
                <span className="tabular-nums">
                  {spatial.pointCloud.available && spatial.pointCloud.pointCount !== null
                    ? `Point cloud ${spatial.pointCloud.pointCount.toLocaleString('ko-KR')} pts`
                    : 'Point cloud unavailable'}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {showSkeleton ? <SkeletonPose handPose={handPose} /> : null}
      </div>

      {presentation === 'default' ? (
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-[var(--design-radius-control)] bg-layer-base p-3">
            <dt className="text-xs text-muted">Pose</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {poseRateHz === null ? '—' : `${poseRateHz.toFixed(1)} Hz`}
            </dd>
          </div>
          <div className="rounded-[var(--design-radius-control)] bg-layer-base p-3">
            <dt className="text-xs text-muted">연결 카메라</dt>
            <dd className="mt-1 font-semibold tabular-nums">3 / 3</dd>
          </div>
          <div className="rounded-[var(--design-radius-control)] bg-layer-base p-3">
            <dt className="text-xs text-muted">동기화 Drift</dt>
            <dd className="mt-1 font-semibold tabular-nums">{String(driftMs)} ms</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
