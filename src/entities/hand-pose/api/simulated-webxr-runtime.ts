import {
  HAND_JOINT_NAMES,
  type ActiveWebXrSession,
  type HandJointPose,
  type HandPoseObservation,
  type Handedness,
  type WebXrFrameObservation,
  type WebXrRuntimePort,
} from '../model/hand-pose';

function createHand(handedness: Handedness, frame: number): HandPoseObservation {
  const direction = handedness === 'left' ? -1 : 1;
  const wrist = [direction * 0.18, 1.1, -0.32] as const;
  const curl = 0.35 + (Math.sin(frame / 18) + 1) * 0.22;
  const fingerOffsets: Readonly<Record<string, number>> = {
    index: -0.026,
    middle: -0.008,
    ring: 0.011,
    pinky: 0.029,
  };
  const fingerLengths: Readonly<Record<string, readonly number[]>> = {
    index: [0.035, 0.028, 0.022, 0.017],
    middle: [0.038, 0.031, 0.024, 0.018],
    ring: [0.036, 0.029, 0.022, 0.017],
    pinky: [0.029, 0.023, 0.018, 0.014],
  };
  const positionFor = (name: string): readonly [number, number, number] => {
    if (name === 'wrist') return wrist;
    if (name.startsWith('thumb-')) {
      const thumbIndex = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'].indexOf(name);
      const distance = [0.025, 0.05, 0.071, 0.088][thumbIndex] ?? 0;
      return [
        wrist[0] + direction * distance * 0.82,
        wrist[1] + 0.012 + distance * 0.35,
        wrist[2] + curl * distance * 0.18,
      ];
    }
    const finger = Object.keys(fingerOffsets).find((candidate) => name.startsWith(candidate));
    if (finger === undefined) return wrist;
    const chain = [
      `${finger}-finger-metacarpal`,
      `${finger}-finger-phalanx-proximal`,
      `${finger}-finger-phalanx-intermediate`,
      `${finger}-finger-phalanx-distal`,
      `${finger}-finger-tip`,
    ];
    const jointIndex = chain.indexOf(name);
    const segmentCount = Math.max(0, jointIndex);
    const lengths = fingerLengths[finger] ?? [];
    let vertical = 0.024;
    let depth = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      const length = lengths[index] ?? 0;
      const angle = curl * Math.max(0, index - 0.25);
      vertical += Math.cos(angle) * length;
      depth += Math.sin(angle) * length;
    }
    return [
      wrist[0] + direction * (fingerOffsets[finger] ?? 0),
      wrist[1] + vertical,
      wrist[2] + depth,
    ];
  };
  const joints = HAND_JOINT_NAMES.map((name) => ({
    name,
    positionMeters: positionFor(name),
    orientationQuaternion: [Math.sin(curl / 2), 0, 0, Math.cos(curl / 2)] as const,
    radiusMeters: 0.008,
  } satisfies HandJointPose));
  return { sourcePresent: true, poseObserved: true, joints };
}

export class SimulatedWebXrRuntime implements WebXrRuntimePort {
  readonly mode = 'simulated' as const;
  #poseAvailable: Record<Handedness, boolean> = { left: true, right: true };
  #sourcePresent: Record<Handedness, boolean> = { left: true, right: true };

  checkSupport(): Promise<{ readonly supported: boolean; readonly secureContext: boolean; readonly detail: string }> {
    return Promise.resolve({
      supported: true,
      secureContext: true,
      detail: 'Mock WebXR runtime으로 Hand Pose lifecycle을 검증합니다.',
    });
  }

  start(
    onFrame: (observation: WebXrFrameObservation) => void,
    onEnded: () => void,
  ): Promise<ActiveWebXrSession> {
    let ended = false;
    let frame = 0;
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      frame += 1;
      const makeObservation = (handedness: Handedness): HandPoseObservation => {
        const sourcePresent = this.#sourcePresent[handedness];
        if (!sourcePresent || !this.#poseAvailable[handedness]) {
          return { sourcePresent, poseObserved: false, joints: [] };
        }
        return createHand(handedness, frame);
      };
      onFrame({
        deviceMonotonicTimestampMs: startedAt + frame * (1_000 / 30),
        hands: { left: makeObservation('left'), right: makeObservation('right') },
      });
    }, 1_000 / 30);
    return Promise.resolve({
      end: () => {
        if (ended) return Promise.resolve();
        ended = true;
        window.clearInterval(timer);
        onEnded();
        return Promise.resolve();
      },
    });
  }

  setHandObservation(handedness: Handedness, input: { readonly poseAvailable: boolean; readonly sourcePresent: boolean }): void {
    this.#poseAvailable[handedness] = input.poseAvailable;
    this.#sourcePresent[handedness] = input.sourcePresent;
  }
}
