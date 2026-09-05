export type CollectionWorkspaceState =
  | 'prepare'
  | 'episode-ready'
  | 'recording'
  | 'finalizing'
  | 'review'
  | 'processing'
  | 'attention';

export type CollectionCloseIntentKind =
  | 'stop-recording'
  | 'save-review-and-finish'
  | 'finish-saved-session'
  | 'leave-preserved'
  | 'leave-background'
  | 'leave-attention';

export interface CollectionCloseIntent {
  readonly kind: CollectionCloseIntentKind;
  readonly title: string;
  readonly description: string;
  readonly primaryLabel: string;
  readonly leaveLabel: string | null;
  readonly cancelLabel: string;
}

export function getCloseIntent(
  workspaceState: CollectionWorkspaceState,
  savedEpisodeCount: number,
): CollectionCloseIntent {
  if (workspaceState === 'recording') {
    return {
      kind: 'stop-recording',
      title: '녹화를 정지하고 나갈까요?',
      description: '현재 Episode를 검토 상태로 정지하고 목록으로 이동합니다. 세션은 계속 유지됩니다.',
      primaryLabel: '녹화 정지 후 나가기',
      leaveLabel: null,
      cancelLabel: '계속 녹화',
    };
  }
  if (workspaceState === 'review') {
    return {
      kind: 'save-review-and-finish',
      title: '녹화본을 저장하고 세션을 마칠까요?',
      description: '현재 녹화본을 저장한 뒤 세션을 종료하고 카탈로그 처리를 시작합니다.',
      primaryLabel: '녹화본 저장하고 마치기',
      leaveLabel: '나중에 계속',
      cancelLabel: '계속 확인',
    };
  }
  if (workspaceState === 'processing' || workspaceState === 'finalizing') {
    return {
      kind: 'leave-background',
      title: '처리는 백그라운드에서 계속됩니다',
      description: '현재 저장·처리 작업을 중단하지 않고 수집 목록으로 이동합니다.',
      primaryLabel: '백그라운드에서 계속하고 나가기',
      leaveLabel: null,
      cancelLabel: '계속 보기',
    };
  }
  if (workspaceState === 'attention') {
    return {
      kind: 'leave-attention',
      title: '확인 필요 상태를 보존할까요?',
      description: '실패 상태와 복구 가능한 데이터를 그대로 보존하고 목록으로 이동합니다. 자동 저장은 실행하지 않습니다.',
      primaryLabel: '나중에 계속',
      leaveLabel: null,
      cancelLabel: '계속 확인',
    };
  }
  if (savedEpisodeCount > 0) {
    return {
      kind: 'finish-saved-session',
      title: '세션을 저장하고 마칠까요?',
      description: `저장한 Episode ${String(savedEpisodeCount)}개로 세션을 확정하고 카탈로그 처리를 시작합니다.`,
      primaryLabel: '저장하고 마치기',
      leaveLabel: '나중에 계속',
      cancelLabel: '계속 수집',
    };
  }
  return {
    kind: 'leave-preserved',
    title: '세션을 나중에 계속할까요?',
    description: '현재 세션은 자동 보존됩니다. 빈 세션을 확정하거나 데이터를 삭제하지 않습니다.',
    primaryLabel: '나중에 계속',
    leaveLabel: null,
    cancelLabel: '계속 수집',
  };
}
