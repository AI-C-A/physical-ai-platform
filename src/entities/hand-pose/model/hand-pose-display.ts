import type { QuestCollectorSnapshot } from './hand-pose';

export function getQuestRuntimeModeLabel(
  mode: QuestCollectorSnapshot['support']['runtimeMode'],
): string {
  if (mode === 'webxr') return 'WebXR';
  if (mode === 'simulated') return '시뮬레이션';
  return '사용 불가';
}
