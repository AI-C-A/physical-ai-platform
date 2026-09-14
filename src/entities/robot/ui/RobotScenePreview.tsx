import { useContext, useCallback } from 'react';

import type { RobotDescriptor } from '../model/robot';
import { RobotModelViewer } from './RobotModelViewer';
import { RobotSceneContext } from './robot-scene-context';

export function RobotScenePreview({ robot, nickname }: {
  readonly robot: RobotDescriptor;
  readonly nickname: string;
}) {
  const shared = useContext(RobotSceneContext);
  const attachPreview = useCallback((element: HTMLDivElement | null) => { shared?.setPreview(element); }, [shared]);
  if (!shared) return <RobotModelViewer modelId={robot.modelId} nickname={nickname} robotType={robot.robotType} />;
  return <figure className="flex min-w-0 flex-col" aria-label="로봇 3D 모델">
    <div ref={attachPreview} className="relative h-20 shrink-0 md:h-52" />
    <figcaption className="mt-2 truncate text-left text-xl font-medium tracking-tight text-foreground md:mt-4 md:text-4xl md:font-light">{nickname}</figcaption>
  </figure>;
}
