import { describe, expect, it } from 'vitest';

import { getCloseIntent } from './collection-close-intent';

describe('getCloseIntent', () => {
  it.each([
    ['recording', 0, 'stop-recording', '녹화 정지 후 나가기', '계속 녹화'],
    ['review', 0, 'save-review-and-finish', '녹화본 저장하고 마치기', '계속 확인'],
    ['episode-ready', 2, 'finish-saved-session', '저장하고 마치기', '계속 수집'],
    ['episode-ready', 0, 'leave-preserved', '나중에 계속', '계속 수집'],
    ['prepare', 0, 'leave-preserved', '나중에 계속', '계속 수집'],
    ['finalizing', 1, 'leave-background', '백그라운드에서 계속하고 나가기', '계속 보기'],
    ['processing', 1, 'leave-background', '백그라운드에서 계속하고 나가기', '계속 보기'],
    ['attention', 1, 'leave-attention', '나중에 계속', '계속 확인'],
  ] as const)(
    '%s 상태와 저장본 %i개의 종료 분기를 결정한다',
    (state, savedEpisodeCount, kind, primaryLabel, cancelLabel) => {
      expect(getCloseIntent(state, savedEpisodeCount)).toMatchObject({
        kind,
        primaryLabel,
        cancelLabel,
      });
    },
  );

  it('review와 저장본 있는 대기 상태에서만 별도 나중에 계속 선택지를 제공한다', () => {
    expect(getCloseIntent('review', 0).leaveLabel).toBe('나중에 계속');
    expect(getCloseIntent('episode-ready', 1).leaveLabel).toBe('나중에 계속');
    expect(getCloseIntent('recording', 1).leaveLabel).toBeNull();
  });
});
