import { Link, useParams } from 'react-router-dom';

import {
  getCapturePreflightStatusLabel,
  getCaptureSessionStatusLabel,
  getCaptureStreamStatusLabel,
  useCaptureSession,
} from '@/entities/capture-session';
import {
  getControlModeLabel,
  getDataOriginLabel,
  getDeliveryModeLabel,
  getExecutionEnvironmentLabel,
} from '@/shared/domain';
import {
  formatBytes,
  formatDateTime,
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
  TableSection,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/table';

export function SessionDetailPage() {
  const { sessionId: encodedSessionId = '' } = useParams();
  const sessionId = decodePathSegment(encodedSessionId);
  const result = useCaptureSession(sessionId);

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
            { label: '수집 세션', to: '/mlops/sessions' },
            { label: '세션 없음' },
          ]}
        />
        <QueryFeedback kind="not-found" message="요청한 수집 세션을 찾을 수 없습니다." />
        <Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/sessions">
          <Icon name="back" />수집 세션으로
        </Link>
      </div>
    );
  }

  const session = result.data;
  const statusTone = session.status === 'completed'
    ? 'positive'
    : session.status === 'failed' || session.status === 'interrupted'
      ? 'negative'
      : 'info';

  return (
    <div className="grid gap-6">
      <Breadcrumb
        items={[
          { label: 'MLOps' },
          { label: '수집 세션', to: '/mlops/sessions' },
          { label: session.name },
        ]}
      />
      <PageHeader
        actions={(
          <span aria-atomic="true" role="status">
            <Badge tone={statusTone}>
              {getCaptureSessionStatusLabel(session.status)}
            </Badge>
          </span>
        )}
        description={session.id}
        eyebrow="수집 세션 상세"
        title={session.name}
      />
      <Link className="inline-flex items-center gap-1 text-sm font-semibold underline" to="/mlops/sessions">
        <Icon name="back" />수집 세션으로
      </Link>

      {result.refreshError === null ? null : (
        <DetailPane title="최신 수집 세션 정보를 반영하지 못했습니다">
          <ErrorMessage>기존 상세 정보를 유지했습니다. {result.refreshError}</ErrorMessage>
          <Button className="mt-4" onClick={result.retry} variant="secondary">
            다시 불러오기
          </Button>
        </DetailPane>
      )}

      {session.lastError === null ? null : (
        <DetailPane title="수집 실패 원인">
          <ErrorMessage>{session.lastError}</ErrorMessage>
        </DetailPane>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <DetailPane title="대상과 출처">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">로봇</dt><dd>{session.robotId}</dd></div>
            <div><dt className="text-xs text-muted">센서 장치</dt><dd>{session.sensorDeviceId}</dd></div>
            <div><dt className="text-xs text-muted">실행 환경</dt><dd>{getExecutionEnvironmentLabel(session.provenance.environment)}</dd></div>
            <div><dt className="text-xs text-muted">전달 방식</dt><dd>{getDeliveryModeLabel(session.provenance.deliveryMode)}</dd></div>
            <div><dt className="text-xs text-muted">제어 방식</dt><dd>{getControlModeLabel(session.provenance.controlMode)}</dd></div>
            <div><dt className="text-xs text-muted">데이터 출처</dt><dd>{getDataOriginLabel(session.provenance.dataOrigin)}</dd></div>
            <div><dt className="text-xs text-muted">기록량</dt><dd>{formatBytes(session.bytesWritten)}</dd></div>
          </dl>
        </DetailPane>
        <DetailPane title="상태 이력">
          <ol className="grid gap-2">
            {session.statusHistory.map((item, index) => (
              <li
                className="flex items-center justify-between gap-3 border-b border-border pb-2"
                key={`${item.status}-${String(index)}`}
              >
                <strong>{getCaptureSessionStatusLabel(item.status)}</strong>
                <time>{formatDateTime(item.occurredAtMs)}</time>
              </li>
            ))}
          </ol>
        </DetailPane>
      </section>

      {session.preflight === null ? null : (
        <DetailPane title="사전 점검">
          <ul className="grid gap-2">
            {session.preflight.checks.map((check) => (
              <li className="flex items-start justify-between gap-3" key={check.id}>
                <span>
                  <strong>{check.label}</strong>
                  <span className="block text-sm text-muted">{check.detail}</span>
                </span>
                <Badge tone={check.state === 'passed' ? 'positive' : 'negative'}>
                  {getCapturePreflightStatusLabel(check.state)}
                </Badge>
              </li>
            ))}
          </ul>
        </DetailPane>
      )}

      <TableSection title="스트림">
        <Table aria-label="수집 세션 스트림 상태">
          <TableHeader>
            <TableRow>
              <TableHead>스트림</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>요청 주기</TableHead>
              <TableHead>관측 주기</TableHead>
              <TableHead>마지막 수신</TableHead>
              <TableHead>기록량</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {session.streams.map((stream) => (
              <TableRow key={stream.id}>
                <TableCell>{stream.displayName}</TableCell>
                <TableCell>{getCaptureStreamStatusLabel(stream.state)}</TableCell>
                <TableCell>{formatRateHertz(stream.expectedRateHz)}</TableCell>
                <TableCell>{formatRateHertz(stream.observedRateHz)}</TableCell>
                <TableCell>{formatDateTime(stream.lastReceivedTimestampMs)}</TableCell>
                <TableCell>{formatBytes(stream.bytesWritten)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableSection>

      {session.episodeId === null ? null : (
        <Link className="inline-flex items-center gap-1 font-semibold underline" to={appendPathSegment('/mlops/episodes', session.episodeId)}>
          생성된 에피소드 보기<Icon name="chevron-right" />
        </Link>
      )}
    </div>
  );
}
