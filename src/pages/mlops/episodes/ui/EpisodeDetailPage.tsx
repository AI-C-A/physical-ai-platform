import { Link, useNavigate, useParams } from 'react-router-dom';

import { useEpisode } from '@/entities/episode';
import {
  getControlModeLabel,
  getDataOriginLabel,
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
} from '@/shared/domain';
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatRateHertz,
} from '@/shared/lib/format';
import { appendPathSegment, decodePathSegment } from '@/shared/lib/navigation';
import { Badge } from '@/shared/ui/badge';
import { Breadcrumb } from '@/shared/ui/breadcrumb';
import { Button } from '@/shared/ui/button';
import { DetailPane } from '@/shared/ui/detail-pane';
import { ErrorMessage } from '@/shared/ui/error-message';
import { Icon } from '@/shared/ui/icon';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryFeedback } from '@/shared/ui/query-feedback';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export function EpisodeDetailPage() {
  const { episodeId: encodedEpisodeId = '' } = useParams();
  const episodeId = decodePathSegment(encodedEpisodeId);
  const navigate = useNavigate();
  const result = useEpisode(episodeId);

  if (result.status === 'loading') {
    return <QueryFeedback kind="loading" />;
  }
  if (result.status === 'error') {
    return <QueryFeedback kind="error" message={result.message} onRetry={result.retry} />;
  }
  if (result.data === null) {
    return (
      <div className="grid gap-6">
        <Breadcrumb
          items={[
            { label: 'MLOps' },
            { label: '에피소드', to: '/mlops/episodes' },
            { label: '에피소드 없음' },
          ]}
        />
        <QueryFeedback kind="not-found" message="요청한 에피소드를 찾을 수 없습니다." />
        <Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/episodes">
          <Icon name="back" />에피소드로
        </Link>
      </div>
    );
  }

  const episode = result.data;

  return (
    <div className="grid gap-6">
      <Breadcrumb
        items={[
          { label: 'MLOps' },
          { label: '에피소드', to: '/mlops/episodes' },
          { label: episode.name },
        ]}
      />
      <PageHeader
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{getDataOriginLabel(episode.provenance.dataOrigin)}</Badge>
            <Button
              onClick={() => {
                const query = new URLSearchParams({ episodeId: episode.id });
                void navigate(`/mlops/datasets/new?${query.toString()}`);
              }}
            >
              초안 데이터셋 만들기
            </Button>
          </div>
        )}
        description={episode.id}
        eyebrow="에피소드 상세"
        title={episode.name}
      />
      <Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/episodes">
        <Icon name="back" />에피소드로
      </Link>

      {result.refreshError === null ? null : (
        <DetailPane title="최신 에피소드 정보를 반영하지 못했습니다">
          <ErrorMessage>
            기존 에피소드 정보는 유지했습니다. {result.refreshError}
          </ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">
            다시 불러오기
          </Button>
        </DetailPane>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <DetailPane title="출처">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">수집 세션</dt>
              <dd><Link className="underline" to={appendPathSegment('/mlops/sessions', episode.captureSessionId)}>{episode.captureSessionId}</Link></dd>
            </div>
            <div><dt className="text-xs text-muted">로봇</dt><dd>{episode.robotId}</dd></div>
            <div><dt className="text-xs text-muted">센서 장치</dt><dd>{episode.sensorDeviceId}</dd></div>
            <div><dt className="text-xs text-muted">통합 프로필</dt><dd>{episode.integrationProfileId}</dd></div>
          </dl>
        </DetailPane>
        <DetailPane title="요약">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">생성 시각</dt><dd>{formatDateTime(episode.createdAtMs)}</dd></div>
            <div><dt className="text-xs text-muted">길이</dt><dd>{formatDuration(episode.durationMs)}</dd></div>
            <div><dt className="text-xs text-muted">기록량</dt><dd>{formatBytes(episode.bytesWritten)}</dd></div>
            <div><dt className="text-xs text-muted">실행 환경</dt><dd>{getExecutionEnvironmentLabel(episode.provenance.environment)}</dd></div>
            <div><dt className="text-xs text-muted">전달 방식</dt><dd>{getDeliveryModeLabel(episode.provenance.deliveryMode)}</dd></div>
            <div><dt className="text-xs text-muted">제어 방식</dt><dd>{getControlModeLabel(episode.provenance.controlMode)}</dd></div>
            <div><dt className="text-xs text-muted">데이터 출처</dt><dd>{getDataOriginLabel(episode.provenance.dataOrigin)}</dd></div>
          </dl>
        </DetailPane>
      </section>

      <DetailPane title="스트림 요약">
        <Table aria-label="에피소드 스트림 요약">
          <TableHeader>
            <TableRow>
              <TableHead>스트림</TableHead>
              <TableHead>관측 주기</TableHead>
              <TableHead>기록량</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {episode.streams.map((stream) => (
              <TableRow key={stream.id}>
                <TableCell>{stream.displayName}</TableCell>
                <TableCell>{formatRateHertz(stream.observedRateHz)}</TableCell>
                <TableCell>{formatBytes(stream.bytesWritten)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DetailPane>
    </div>
  );
}
