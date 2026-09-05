import { createContext, useContext } from 'react';

import type { QuestCollectorPort } from './hand-pose';

export const QuestCollectorContext = createContext<QuestCollectorPort | null>(null);

export function useQuestCollectorPort(): QuestCollectorPort {
  const port = useContext(QuestCollectorContext);
  if (port === null) throw new Error('QuestCollectorPort가 제공되지 않았습니다.');
  return port;
}
