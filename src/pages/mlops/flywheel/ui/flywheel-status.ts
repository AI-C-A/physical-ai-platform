const statusLabels: Readonly<Record<string, string>> = {
  draft: '초안', queued: '대기 중', pending: '검사 대기', loading: '불러오는 중',
  running: '실행 중', 'in-progress': '진행 중', completed: '완료',
  passed: '검사 통과', succeeded: '학습 완료', failed: '실패', error: '오류',
  cancelled: '취소됨', invalid: '유효하지 않음', ready: '준비 완료',
  active: '활성', released: '릴리스됨', production: '운영 중',
  approved: '승인됨', rejected: '반려됨', unassigned: '담당자 미지정',
  assigned: '배정됨', review: '검수 대기', reviewed: '검수 완료',
  'needs-review': '검토 필요', quarantined: '격리됨', partial: '일부 완료',
  deploying: '배포 중', 'rolling-back': '롤백 중', 'rolled-back': '롤백됨',
  detected: '감지됨', empty: '기록 없음', archived: '보관됨',
  candidate: '후보', staging: '검증 중', validating: '검증 중',
  recording: '녹화 중', finalizing: '저장 중', processing: '처리 중',
  waiting: '대기 중', stopped: '중지됨', stale: '갱신 지연',
};

export function getStatusLabel(status: string): string {
  return statusLabels[status] ?? status;
}
