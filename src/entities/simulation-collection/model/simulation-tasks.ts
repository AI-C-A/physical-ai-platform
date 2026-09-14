export interface SimulationTaskSpec {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly en: string;
  readonly primitives: readonly string[];
  readonly difficulty: 1 | 2 | 3;
  /** 목표 시간(초). 시뮬레이션의 등급 산정 기준과 같다. */
  readonly parSeconds: number;
}

/**
 * 시뮬레이션의 8개 임무 스테이션. 릴레이는 임무 id만 보내므로 표시용 정보는 여기서 찾는다.
 * 시뮬레이션 `src/tasks/t01..t08`과 id·순서를 맞춰야 한다.
 */
export const SIMULATION_TASKS: readonly SimulationTaskSpec[] = [
  { id: 't01_radio', index: 1, title: '전술 무전기 준비', en: 'TACTICAL RADIO PREP', primitives: ['grasp', 'align', 'insert', 'knob_turn', 'press'], difficulty: 1, parSeconds: 40 },
  { id: 't02_medkit', index: 2, title: '응급 구급낭 보급', en: 'CASUALTY KIT RESUPPLY', primitives: ['grasp', 'sort', 'place', 'carry', 'press'], difficulty: 1, parSeconds: 55 },
  { id: 't03_ugv', index: 3, title: '무인차량 배터리 교체', en: 'UGV BATTERY SWAP', primitives: ['latch', 'extract', 'carry', 'align', 'insert', 'press'], difficulty: 2, parSeconds: 60 },
  { id: 't04_inspection', index: 4, title: '장비 검수 및 분류', en: 'EQUIPMENT INSPECTION', primitives: ['grasp', 'rotate', 'inspect', 'classify', 'place'], difficulty: 2, parSeconds: 75 },
  { id: 't05_loadout', index: 5, title: '개인 장구 결속', en: 'LOADOUT PREPARATION', primitives: ['grasp', 'align', 'sort', 'place', 'press'], difficulty: 2, parSeconds: 65 },
  { id: 't06_cable', index: 6, title: '감시장비 결선', en: 'SENSOR MAST CABLING', primitives: ['grasp', 'align', 'plug', 'place', 'press'], difficulty: 2, parSeconds: 60 },
  { id: 't07_maintenance', index: 7, title: '야전 발전기 정비', en: 'FIELD GENERATOR MAINTENANCE', primitives: ['grasp', 'screw', 'extract', 'place', 'insert', 'align'], difficulty: 3, parSeconds: 115 },
  { id: 't08_fault', index: 8, title: '통신 장비 고장 진단', en: 'FAULT ISOLATION', primitives: ['grasp', 'inspect', 'classify', 'extract', 'insert', 'press'], difficulty: 3, parSeconds: 95 },
];

export function findSimulationTask(taskId: string): SimulationTaskSpec | null {
  return SIMULATION_TASKS.find((task) => task.id === taskId) ?? null;
}
