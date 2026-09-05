import { useSyncExternalStore } from 'react';

import type { QuestCollectorSnapshot } from './hand-pose';
import { useQuestCollectorPort } from './hand-pose-context';

export function useQuestCollector(): QuestCollectorSnapshot {
  const port = useQuestCollectorPort();
  return useSyncExternalStore(
    (listener) => port.subscribe(listener),
    () => port.getSnapshot(),
    () => port.getSnapshot(),
  );
}
