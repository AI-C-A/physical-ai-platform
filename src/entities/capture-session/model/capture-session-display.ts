import type {
  CapturePreflightCheck,
  CaptureSessionStatus,
  CaptureStreamStatus,
} from './capture-session';

const SESSION_STATUS_LABELS = {
  draft: '초안',
  validating: '준비 확인 중',
  ready: '수집 준비 완료',
  starting: '수집 시작 중',
  recording: '기록 중',
  stopping: '기록 중지 중',
  finalizing: '기록 마감 중',
  processing: '후처리 중',
  completed: '완료',
  interrupted: '중단됨',
  failed: '실패',
} satisfies Record<CaptureSessionStatus, string>;

const STREAM_STATUS_LABELS = {
  waiting: '수신 대기',
  active: '기록 중',
  stopped: '기록 종료',
  stale: '최신성 확인 필요',
} satisfies Record<CaptureStreamStatus['state'], string>;

const PREFLIGHT_STATUS_LABELS = {
  passed: '통과',
  failed: '실패',
} satisfies Record<CapturePreflightCheck['state'], string>;

export function getCaptureSessionStatusLabel(value: CaptureSessionStatus): string {
  return SESSION_STATUS_LABELS[value];
}

export function getCaptureStreamStatusLabel(value: CaptureStreamStatus['state']): string {
  return STREAM_STATUS_LABELS[value];
}

export function getCapturePreflightStatusLabel(value: CapturePreflightCheck['state']): string {
  return PREFLIGHT_STATUS_LABELS[value];
}
