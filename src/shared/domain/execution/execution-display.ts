import type {
  ControlMode,
  DataOrigin,
  DeliveryMode,
  ExecutionEnvironment,
  ExecutionProvenance,
} from './execution';

const ENVIRONMENT_LABELS = {
  physical: '실제 환경',
  simulation: '시뮬레이션',
} satisfies Record<ExecutionEnvironment, string>;

const DELIVERY_MODE_LABELS = {
  live: '실시간',
  replay: '재생',
} satisfies Record<DeliveryMode, string>;

const CONTROL_MODE_LABELS = {
  autonomous: '자율',
  teleop: '원격 조작',
  manual: '수동',
  mixed: '혼합',
} satisfies Record<ControlMode, string>;

const DATA_ORIGIN_LABELS = {
  captured: '수집 원본',
  synthetic: '합성',
  derived: '파생',
} satisfies Record<DataOrigin, string>;

export function getExecutionEnvironmentLabel(value: ExecutionEnvironment): string {
  return ENVIRONMENT_LABELS[value];
}

export function getDeliveryModeLabel(value: DeliveryMode): string {
  return DELIVERY_MODE_LABELS[value];
}

export function getControlModeLabel(value: ControlMode): string {
  return CONTROL_MODE_LABELS[value];
}

export function getDataOriginLabel(value: DataOrigin): string {
  return DATA_ORIGIN_LABELS[value];
}

export function getExecutionProvenanceLabel(value: ExecutionProvenance): string {
  return [
    getExecutionEnvironmentLabel(value.environment),
    getDeliveryModeLabel(value.deliveryMode),
    getControlModeLabel(value.controlMode),
    getDataOriginLabel(value.dataOrigin),
  ].join(' · ');
}
