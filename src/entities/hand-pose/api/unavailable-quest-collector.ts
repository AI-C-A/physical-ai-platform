import type { QuestCollectorPort, QuestCollectorSnapshot } from '../model/hand-pose';

const detail = 'Collector Backend와 WebXR runtime이 이 실행 환경에 구성되지 않았습니다.';

export function createUnavailableQuestCollector(): QuestCollectorPort {
  const snapshot: QuestCollectorSnapshot = {
    support: { state: 'unavailable', secureContext: false, detail },
    pairing: { state: 'unpaired', sessionId: null, participantId: null, sourceDeviceId: null, detail: null },
    immersive: { state: 'idle', detail: null },
    backend: {
      state: 'unavailable',
      detail,
      queuedFrameCount: 0,
      droppedFrameCount: 0,
      sentFrameCount: 0,
      lastReceivedTimestampMs: null,
    },
    recording: { state: 'idle', episodeId: null, command: null, acknowledgement: null, detail: null },
    hands: {
      left: {
        sourcePresent: false, poseObserved: false, qualityState: 'lost', qualityBasis: 'profile-time-policy',
        validJointCount: 0, consecutiveMissingMs: 0, observedRateHz: null, lastObservedAtMs: null,
      },
      right: {
        sourcePresent: false, poseObserved: false, qualityState: 'lost', qualityBasis: 'profile-time-policy',
        validJointCount: 0, consecutiveMissingMs: 0, observedRateHz: null, lastObservedAtMs: null,
      },
    },
  };
  const reject = (): Promise<QuestCollectorSnapshot> => Promise.reject(new Error(detail));
  return {
    getSnapshot: () => snapshot,
    checkSupport: () => Promise.resolve(snapshot),
    pair: reject,
    startImmersiveSession: reject,
    endImmersiveSession: () => Promise.resolve(snapshot),
    reconnectBackend: reject,
    leaveCollector: () => undefined,
    subscribe: () => () => undefined,
  };
}
