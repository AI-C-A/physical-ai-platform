import { useEffect, useRef } from 'react';

import { Button } from '@/shared/ui/button';
import { ErrorMessage } from '@/shared/ui/error-message';
import {
  ModelViewer,
  type ModelViewerCameraOrbit,
  type ModelViewerElement,
  type ModelViewerVector3,
} from '@/shared/ui/model-viewer';
import { Spinner } from '@/shared/ui/spinner';

import type { IndoorSiteDescriptor } from '../model/site';

const INITIAL_CAMERA_RADIUS_RATIO = 1.45;
const MINIMUM_CAMERA_RADIUS_RATIO = 0.2;
const MAXIMUM_CAMERA_RADIUS_RATIO = 1.8;
const WHEEL_ZOOM_ANIMATION_MS = 220;
const FLOOR_NORMAL_MINIMUM_Y = 0.85;
const POINTER_INERTIA_DECAY_MS = 80;
const POINTER_INERTIA_MAX_DURATION_MS = 420;
const POINTER_INERTIA_MIN_SPEED_PX_PER_MS = 0.01;
const POINTER_INERTIA_MAX_SPEED_PX_PER_MS = 1.25;
const POINTER_VELOCITY_BLEND = 0.65;
const PAN_SENSITIVITY = 0.018;

function canRenderIndoorMap() {
  return (
    typeof WebGLRenderingContext !== 'undefined'
    && typeof customElements !== 'undefined'
  );
}

function swapPrimaryAndSecondaryMouseButtons(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;

  const swappedButton = event.button === 0
    ? 2
    : event.button === 2
      ? 0
      : null;
  if (swappedButton === null) return;

  Object.defineProperty(event, 'button', {
    configurable: true,
    value: swappedButton,
  });
}

function attachMapboxStyleMouseControls(
  modelViewer: ModelViewerElement,
) {
  type DragMode = 'pan' | 'rotate';

  let activePointerId: number | null = null;
  let dragMode: DragMode | null = null;
  let dragDistance = 0;
  let inertiaFrameId: number | null = null;
  let inertiaGeneration = 0;
  let lastPointerTime = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let pointerVelocityX = 0;
  let pointerVelocityY = 0;

  const cancelInertia = () => {
    inertiaGeneration += 1;
    if (inertiaFrameId !== null) cancelAnimationFrame(inertiaFrameId);
    inertiaFrameId = null;
  };

  const startInertia = (
    mode: DragMode,
    initialVelocityX: number,
    initialVelocityY: number,
  ) => {
    const initialSpeed = Math.hypot(initialVelocityX, initialVelocityY);
    if (initialSpeed < POINTER_INERTIA_MIN_SPEED_PX_PER_MS) return;

    const speedScale = Math.min(
      1,
      POINTER_INERTIA_MAX_SPEED_PX_PER_MS / initialSpeed,
    );
    let velocityX = initialVelocityX * speedScale;
    let velocityY = initialVelocityY * speedScale;
    const generation = ++inertiaGeneration;
    const startedAt = performance.now();
    let previousTime = startedAt;

    const animateInertia = (currentTime: number) => {
      if (generation !== inertiaGeneration) return;

      const elapsed = currentTime - startedAt;
      const deltaTime = Math.min(32, Math.max(0, currentTime - previousTime));
      previousTime = currentTime;
      const decay = Math.exp(-deltaTime / POINTER_INERTIA_DECAY_MS);
      const distanceScale = POINTER_INERTIA_DECAY_MS * (1 - decay);
      const deltaX = velocityX * distanceScale;
      const deltaY = velocityY * distanceScale;
      velocityX *= decay;
      velocityY *= decay;

      const orbit = modelViewer.getCameraOrbit?.();
      if (orbit === undefined) return;

      if (mode === 'rotate') {
        const bounds = modelViewer.getBoundingClientRect();
        if (bounds.height <= 0) return;

        const radiansPerPixel = 2 * Math.PI / bounds.height;
        modelViewer.cameraOrbit = [
          `${orbit.theta - deltaX * radiansPerPixel}rad`,
          `${orbit.phi - deltaY * radiansPerPixel}rad`,
          `${orbit.radius}m`,
        ].join(' ');
      } else {
        const target = modelViewer.getCameraTarget?.();
        const fieldOfView = modelViewer.getFieldOfView?.();
        const bounds = modelViewer.getBoundingClientRect();
        if (
          target === undefined
          || fieldOfView === undefined
          || bounds.height <= 0
        ) return;

        const metersPerPixel = (
          orbit.radius * fieldOfView * PAN_SENSITIVITY / bounds.height
        );
        const cosTheta = Math.cos(orbit.theta);
        const sinTheta = Math.sin(orbit.theta);
        const cosPhi = Math.cos(orbit.phi);
        const sinPhi = Math.sin(orbit.phi);
        modelViewer.cameraTarget = [
          target.x + (-cosTheta * deltaX - cosPhi * sinTheta * deltaY)
            * metersPerPixel,
          target.y + sinPhi * deltaY * metersPerPixel,
          target.z + (sinTheta * deltaX - cosPhi * cosTheta * deltaY)
            * metersPerPixel,
        ].map((value) => `${value}m`).join(' ');
      }

      void Promise.resolve(modelViewer.updateComplete).then(() => {
        if (generation !== inertiaGeneration) return;

        modelViewer.jumpCameraToGoal?.();
        const speed = Math.hypot(velocityX, velocityY);
        if (
          elapsed < POINTER_INERTIA_MAX_DURATION_MS
          && speed >= POINTER_INERTIA_MIN_SPEED_PX_PER_MS
        ) {
          inertiaFrameId = requestAnimationFrame(animateInertia);
          return;
        }

        inertiaFrameId = null;
      });
    };

    inertiaFrameId = requestAnimationFrame(animateInertia);
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;

    cancelInertia();
    activePointerId = event.pointerId;
    dragMode = event.button === 0
      ? 'pan'
      : event.button === 2
        ? 'rotate'
        : null;
    dragDistance = 0;
    lastPointerTime = performance.now();
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    pointerVelocityX = 0;
    pointerVelocityY = 0;
    swapPrimaryAndSecondaryMouseButtons(event);
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (
      event.pointerType !== 'mouse'
      || event.pointerId !== activePointerId
      || dragMode === null
    ) return;

    const currentTime = performance.now();
    const deltaTime = Math.max(1, currentTime - lastPointerTime);
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    const instantaneousVelocityX = deltaX / deltaTime;
    const instantaneousVelocityY = deltaY / deltaTime;
    pointerVelocityX += (
      instantaneousVelocityX - pointerVelocityX
    ) * POINTER_VELOCITY_BLEND;
    pointerVelocityY += (
      instantaneousVelocityY - pointerVelocityY
    ) * POINTER_VELOCITY_BLEND;
    dragDistance += Math.hypot(deltaX, deltaY);
    lastPointerTime = currentTime;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  };
  const handlePointerUp = (event: PointerEvent) => {
    if (
      event.pointerType !== 'mouse'
      || event.pointerId !== activePointerId
    ) return;

    const releasedMode = dragMode;
    const releasedVelocityX = pointerVelocityX;
    const releasedVelocityY = pointerVelocityY;
    const shouldStartInertia = dragDistance >= 4
      && performance.now() - lastPointerTime < 80;
    Object.defineProperty(event, 'altKey', {
      configurable: true,
      value: true,
    });
    activePointerId = null;
    dragMode = null;

    if (releasedMode !== null && shouldStartInertia) {
      inertiaFrameId = requestAnimationFrame(() => {
        startInertia(
          releasedMode,
          releasedVelocityX,
          releasedVelocityY,
        );
      });
    }
  };
  const handlePointerCancel = (event: PointerEvent) => {
    if (
      event.pointerType !== 'mouse'
      || event.pointerId !== activePointerId
    ) return;

    activePointerId = null;
    dragMode = null;
  };

  modelViewer.addEventListener('pointerdown', handlePointerDown, {
    capture: true,
  });
  modelViewer.addEventListener('pointermove', handlePointerMove, {
    capture: true,
  });
  modelViewer.addEventListener('pointerup', handlePointerUp, {
    capture: true,
  });
  modelViewer.addEventListener('pointercancel', handlePointerCancel, {
    capture: true,
  });
  modelViewer.addEventListener('wheel', cancelInertia, { capture: true });

  return () => {
    cancelInertia();
    modelViewer.removeEventListener('pointerdown', handlePointerDown, {
      capture: true,
    });
    modelViewer.removeEventListener('pointermove', handlePointerMove, {
      capture: true,
    });
    modelViewer.removeEventListener('pointerup', handlePointerUp, {
      capture: true,
    });
    modelViewer.removeEventListener('pointercancel', handlePointerCancel, {
      capture: true,
    });
    modelViewer.removeEventListener('wheel', cancelInertia, { capture: true });
  };
}

function findMapPlaneHeight(
  modelViewer: ModelViewerElement,
  bounds: DOMRect,
) {
  const positionAndNormalFromPoint = modelViewer.positionAndNormalFromPoint;
  if (positionAndNormalFromPoint === undefined) return null;

  const floorHeights: number[] = [];
  const gridDivisions = 8;
  for (let row = 1; row < gridDivisions; row += 1) {
    for (let column = 1; column < gridDivisions; column += 1) {
      const hit = positionAndNormalFromPoint.call(
        modelViewer,
        bounds.left + bounds.width * column / gridDivisions,
        bounds.top + bounds.height * row / gridDivisions,
      );
      if (hit !== null && hit.normal.y >= FLOOR_NORMAL_MINIMUM_Y) {
        floorHeights.push(hit.position.y);
      }
    }
  }

  return floorHeights.length === 0 ? null : Math.min(...floorHeights);
}

function getCursorMapPlaneAnchor({
  bounds,
  cameraTarget,
  cameraOrbit,
  cursorX,
  cursorY,
  fieldOfViewDegrees,
  mapPlaneHeight,
}: {
  readonly bounds: DOMRect;
  readonly cameraTarget: ModelViewerVector3;
  readonly cameraOrbit: ModelViewerCameraOrbit;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly fieldOfViewDegrees: number;
  readonly mapPlaneHeight: number;
}) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const { theta, phi, radius } = cameraOrbit;
  const sinPhi = Math.sin(phi);
  const cameraDirection = {
    x: sinPhi * Math.sin(theta),
    y: Math.cos(phi),
    z: sinPhi * Math.cos(theta),
  };
  const cameraPosition = {
    x: cameraTarget.x + radius * cameraDirection.x,
    y: cameraTarget.y + radius * cameraDirection.y,
    z: cameraTarget.z + radius * cameraDirection.z,
  };
  const cameraRight = {
    x: Math.cos(theta),
    y: 0,
    z: -Math.sin(theta),
  };
  const cameraUp = {
    x: -Math.cos(phi) * Math.sin(theta),
    y: sinPhi,
    z: -Math.cos(phi) * Math.cos(theta),
  };
  const tangent = Math.tan(fieldOfViewDegrees * Math.PI / 360);
  const horizontalOffset = (
    2 * (cursorX - bounds.left) / bounds.width - 1
  ) * bounds.width / bounds.height * tangent;
  const verticalOffset = (
    1 - 2 * (cursorY - bounds.top) / bounds.height
  ) * tangent;
  const rayDirection = {
    x: -cameraDirection.x
      + cameraRight.x * horizontalOffset
      + cameraUp.x * verticalOffset,
    y: -cameraDirection.y
      + cameraRight.y * horizontalOffset
      + cameraUp.y * verticalOffset,
    z: -cameraDirection.z
      + cameraRight.z * horizontalOffset
      + cameraUp.z * verticalOffset,
  };
  if (Math.abs(rayDirection.y) < 0.000001) return null;

  const distanceAlongRay = (
    mapPlaneHeight - cameraPosition.y
  ) / rayDirection.y;
  if (distanceAlongRay <= 0) return null;

  return {
    x: cameraPosition.x + rayDirection.x * distanceAlongRay,
    y: mapPlaneHeight,
    z: cameraPosition.z + rayDirection.z * distanceAlongRay,
  };
}

function attachMapboxStyleWheelZoom(
  modelViewer: ModelViewerElement,
) {
  let animationFrameId: number | null = null;
  let zoomGeneration = 0;
  let goalRadius: number | null = null;
  let lastWheelDirection = 0;
  let framedRadius: number | null = null;
  let mapPlaneHeight: number | null = null;

  const handleWheel = (event: WheelEvent) => {
    const getCameraTarget = modelViewer.getCameraTarget;
    const getFieldOfView = modelViewer.getFieldOfView;
    if (
      getCameraTarget === undefined
      || getFieldOfView === undefined
    ) return;

    const initialOrbit = modelViewer.getCameraOrbit?.();
    const initialTarget = getCameraTarget.call(modelViewer);
    const fieldOfViewDegrees = getFieldOfView.call(modelViewer);
    if (initialOrbit === undefined || initialOrbit.radius <= 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const bounds = modelViewer.getBoundingClientRect();
    mapPlaneHeight ??= findMapPlaneHeight(modelViewer, bounds);
    const anchor = mapPlaneHeight === null
      ? initialTarget
      : getCursorMapPlaneAnchor({
        bounds,
        cameraOrbit: initialOrbit,
        cameraTarget: initialTarget,
        cursorX: event.clientX,
        cursorY: event.clientY,
        fieldOfViewDegrees,
        mapPlaneHeight,
      }) ?? initialTarget;
    const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? bounds.height
        : 1;
    const wheelDeltaPixels = Math.max(
      -600,
      Math.min(600, event.deltaY * deltaMultiplier),
    );
    if (wheelDeltaPixels === 0) return;

    const wheelDirection = Math.sign(wheelDeltaPixels);
    if (goalRadius === null || wheelDirection !== lastWheelDirection) {
      goalRadius = initialOrbit.radius;
    }
    lastWheelDirection = wheelDirection;
    framedRadius ??= initialOrbit.radius / INITIAL_CAMERA_RADIUS_RATIO;
    const zoomFactor = Math.exp(wheelDeltaPixels * 0.0015);
    goalRadius = Math.max(
      framedRadius * MINIMUM_CAMERA_RADIUS_RATIO,
      Math.min(
        framedRadius * MAXIMUM_CAMERA_RADIUS_RATIO,
        goalRadius * zoomFactor,
      ),
    );
    const finalScaleRatio = goalRadius / initialOrbit.radius;
    const finalTarget = {
      x: anchor.x + (initialTarget.x - anchor.x) * finalScaleRatio,
      y: anchor.y + (initialTarget.y - anchor.y) * finalScaleRatio,
      z: anchor.z + (initialTarget.z - anchor.z) * finalScaleRatio,
    };
    const generation = ++zoomGeneration;
    const startTime = performance.now();

    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);

    const animateCameraAndTarget = (currentTime: number) => {
      if (generation !== zoomGeneration) return;

      const linearProgress = Math.min(
        1,
        Math.max(0, (currentTime - startTime) / WHEEL_ZOOM_ANIMATION_MS),
      );
      const progress = 1 - (1 - linearProgress) ** 3;
      const radius = initialOrbit.radius
        + (goalRadius as number - initialOrbit.radius) * progress;
      const target = {
        x: initialTarget.x + (finalTarget.x - initialTarget.x) * progress,
        y: initialTarget.y + (finalTarget.y - initialTarget.y) * progress,
        z: initialTarget.z + (finalTarget.z - initialTarget.z) * progress,
      };
      modelViewer.cameraOrbit = [
        `${initialOrbit.theta}rad`,
        `${initialOrbit.phi}rad`,
        `${radius}m`,
      ].join(' ');
      modelViewer.cameraTarget = `${target.x}m ${target.y}m ${target.z}m`;

      void Promise.resolve(modelViewer.updateComplete).then(() => {
        if (generation !== zoomGeneration) return;

        modelViewer.jumpCameraToGoal?.();
        if (linearProgress < 1) {
          animationFrameId = requestAnimationFrame(animateCameraAndTarget);
          return;
        }

        animationFrameId = null;
        goalRadius = null;
        lastWheelDirection = 0;
      });
    };

    animationFrameId = requestAnimationFrame(animateCameraAndTarget);
  };

  modelViewer.addEventListener('wheel', handleWheel, {
    capture: true,
    passive: false,
  });

  return () => {
    zoomGeneration += 1;
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    modelViewer.removeEventListener('wheel', handleWheel, { capture: true });
  };
}

export function IndoorSiteMap({
  site,
}: {
  readonly site: IndoorSiteDescriptor;
}) {
  const modelViewerRef = useRef<ModelViewerElement>(null);

  useEffect(() => {
    if (!canRenderIndoorMap()) return undefined;

    const modelViewer = modelViewerRef.current;
    if (modelViewer === null) return undefined;

    const detachMapboxStyleMouseControls = attachMapboxStyleMouseControls(
      modelViewer,
    );
    const detachMapboxStyleWheelZoom = attachMapboxStyleWheelZoom(
      modelViewer,
    );

    return () => {
      detachMapboxStyleMouseControls();
      detachMapboxStyleWheelZoom();
    };
  }, []);

  return (
    <figure
      aria-label={`${site.displayName} 실내 지도`}
      className="absolute inset-0 z-0 m-0 h-full w-full overflow-hidden bg-zinc-900"
      role="region"
    >
      <ModelViewer
        alt={site.mapAlt}
        camera-controls
        camera-orbit="-15deg 50deg 145%"
        className="block h-full w-full"
        disable-tap
        environment-image="legacy"
        errorFallback={(retry) => (
          <div className="absolute inset-0 grid place-items-center gap-3 p-4">
            <ErrorMessage>실내 지도를 표시할 수 없습니다.</ErrorMessage>
            <Button onClick={retry} variant="secondary">다시 시도</Button>
          </div>
        )}
        exposure={0.5}
        field-of-view="40deg"
        interaction-prompt="none"
        interpolation-decay={0}
        loading="eager"
        loadingFallback={(
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-zinc-900/30">
            <Spinner className="size-8 text-white" label="실내 지도 불러오는 중" />
          </div>
        )}
        max-camera-orbit="auto auto 180%"
        min-camera-orbit="auto auto 20%"
        elementRef={modelViewerRef}
        reveal="auto"
        shadow-intensity="0.3"
        shadow-softness="0.85"
        src={site.mapUrl}
        tone-mapping="neutral"
        touch-action="none"
      >
        <span className="hidden" slot="pan-target" />
        <span slot="progress-bar" />
      </ModelViewer>
    </figure>
  );
}
