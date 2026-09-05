import { describe, expect, it } from 'vitest';

import { createInMemoryFlywheel } from '@/entities/flywheel';

import { createCatalogExportRecord, createCollectionSessionExportRecord, createEpisodeExportRecord } from './flywheel-export-records';

describe('수집 기록 JSON 내보내기', () => {
  it('페어링 정보와 연동 프로필을 제외하고 기록 ID·시각·수집 장치를 보존한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const session = await port.createHumanDemonstrationSession({
        projectId: 'project-tiger', siteId: 'site-lab', name: '기록 검증', taskId: 'task-sort-fruit',
        instruction: '과일을 분류하세요.', exoskeletonDeviceId: 'exoskeleton-export', questDeviceId: 'quest-export',
        headCameraDeviceId: 'head-export', externalCameraDeviceId: '', profileId: 'human-demo-quest-hand-v1',
      });
      if (session.humanDemonstration === null) throw new Error('사람 시연 연결 정보가 없습니다.');
      const withAdditionalFields = {
        ...session,
        authentication: 'DO_NOT_EXPORT',
        provenance: { ...session.provenance, providerConfiguration: 'DO_NOT_EXPORT' },
        humanDemonstration: {
          ...session.humanDemonstration,
          pairing: { code: 'DO_NOT_EXPORT', expiresAtMs: 123 },
          profile: { ...session.humanDemonstration.profile, id: 'DO_NOT_EXPORT' },
          sourceBindings: session.humanDemonstration.sourceBindings.map((source) => ({ ...source, integrationProfileId: 'DO_NOT_EXPORT' })),
        },
        streams: session.streams.map((stream) => ({ ...stream, signedUrl: 'DO_NOT_EXPORT' })),
      };
      const record = createCollectionSessionExportRecord(withAdditionalFields);
      expect(record).toMatchObject({ id: session.id, name: session.name, createdAtMs: session.createdAtMs, environment: 'simulation', status: 'draft', episodeIds: [] });
      expect(record.humanDemonstration?.participantId).toBe(session.humanDemonstration.participantId);
      expect(record.humanDemonstration?.sources.map((source) => source.deviceId)).toEqual(session.humanDemonstration.sourceBindings.map((source) => source.sourceDeviceId));
      expect(record.streams.map((stream) => stream.id)).toEqual(session.streams.map((stream) => stream.id));
      expect(JSON.stringify(record)).not.toContain('DO_NOT_EXPORT');
      expect(JSON.stringify(record)).not.toMatch(/"(?:pairing|profile|integrationProfileId|provenance|collectorAcknowledgements)"/u);
      const episode = await port.getEpisode('episode-fw-001');
      if (episode === null) throw new Error('에피소드가 없습니다.');
      const episodeRecord = createEpisodeExportRecord({ ...episode, humanDemonstration: withAdditionalFields.humanDemonstration });
      expect(episodeRecord.humanDemonstration?.participantId).toBe(session.humanDemonstration.participantId);
      expect(JSON.stringify(episodeRecord)).not.toContain('DO_NOT_EXPORT');
    } finally {
      port.dispose();
    }
  });

  it('에피소드의 원본 시각·결과·이벤트를 보존하고 오류 진단·추가 필드는 내보내지 않는다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const episode = await port.getEpisode('episode-fw-001');
      if (episode === null) throw new Error('에피소드가 없습니다.');
      const withAdditionalFields = {
        ...episode,
        finalizationError: 'DO_NOT_EXPORT',
        qualityWarnings: ['DO_NOT_EXPORT'],
        internalConfiguration: 'DO_NOT_EXPORT',
        events: episode.events.map((event) => ({ ...event, privateMetadata: 'DO_NOT_EXPORT' })),
      };
      const record = createEpisodeExportRecord(withAdditionalFields);
      expect(record).toMatchObject({
        id: episode.id, captureSessionId: episode.captureSessionId, startedAtMs: episode.startedAtMs,
        endedAtMs: episode.endedAtMs, bytesWritten: episode.bytesWritten, outcome: episode.outcome,
        annotationStatus: episode.annotationStatus, qualityStatus: episode.qualityStatus,
      });
      expect(record.events).toEqual(episode.events);
      expect(record.humanDemonstration).toBeNull();
      expect(JSON.stringify(record)).not.toContain('DO_NOT_EXPORT');
    } finally {
      port.dispose();
    }
  });

  it('카탈로그의 선택 가능한 에피소드 순서를 보존하고 DTO 확장 필드는 제외한다', async () => {
    const port = createInMemoryFlywheel({ nowMs: () => 1_800_000_000_000 });
    try {
      const collection = await port.getCatalogCollection('capture-h-001');
      if (collection === null) throw new Error('카탈로그가 없습니다.');
      const episodeIds = ['episode-second', 'episode-first'];
      const withAdditionalFields = { ...collection, episodeIds, integrationProfileId: 'DO_NOT_EXPORT', pairing: { code: 'DO_NOT_EXPORT' } };
      const record = createCatalogExportRecord(withAdditionalFields);
      expect(record).toEqual({ ...collection, episodeIds });
      expect(record.episodeIds).toEqual(['episode-second', 'episode-first']);
      expect(JSON.stringify(record)).not.toContain('DO_NOT_EXPORT');
    } finally {
      port.dispose();
    }
  });
});
