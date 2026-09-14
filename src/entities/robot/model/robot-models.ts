import type { RobotModelId, RobotType } from './robot';

export const robotModels: Record<RobotModelId, { file: string; label: string; orbit: string; orientation?: string }> = {
  openarm: { file: 'openarm-bimanual-five-finger.glb', label: '양팔형 로봇 (오픈암 스타일)', orbit: '-45deg 72deg 115%' },
  alice5: { file: 'alice5.glb', label: '휴머노이드 로봇', orbit: '-45deg 75deg 105%' },
  // RBQ-10의 Z-up 좌표를 뷰어의 Y-up 좌표로 변환한다.
  rbq10: { file: 'rbq10_walk.glb', label: '사족보행 로봇', orbit: '45deg 65deg 105%', orientation: '0deg -90deg 0deg' },
  'four-wheel-rover': { file: 'four-wheel-rover.glb', label: '사륜 로봇', orbit: '-135deg 65deg 105%' },
  'wheeled-robot': { file: 'wheeled-robot.glb', label: '차륜형 로봇', orbit: '-45deg 65deg 105%' },
};

export const defaultModels: Record<RobotType, RobotModelId> = {
  humanoid: 'openarm', quadruped: 'rbq10', mobile: 'four-wheel-rover',
};
