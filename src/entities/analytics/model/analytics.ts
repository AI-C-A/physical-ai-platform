import type { ExecutionProvenance } from '@/shared/domain';

export interface AnalyticsRange {
  readonly startMs: number;
  readonly endMs: number;
  readonly robotId: string | null;
}

export interface AnalyticsOverview {
  readonly sessionCount: number;
  /** 집계 대상 Session이 없으면 성공률은 계산할 수 없으므로 null이다. */
  readonly successRatePercent: number | null;
  readonly bytesWritten: number;
  readonly episodeCount: number;
  readonly datasetCount: number;
  readonly statusSeries: readonly AnalyticsChartPoint[];
  readonly trendSeries: readonly AnalyticsChartPoint[];
}

export interface AnalyticsChartPoint {
  readonly label: string;
  readonly value: number;
}

export type AnalyticsRecordType = 'session' | 'episode' | 'dataset';

export interface AnalyticsRecord {
  readonly id: string;
  readonly type: AnalyticsRecordType;
  readonly name: string;
  readonly status: string;
  readonly robotId: string | null;
  readonly timestampMs: number;
  /** 원본 Entity가 기록량을 제공하지 않으면 null이다. */
  readonly bytes: number | null;
  readonly provenance: ExecutionProvenance | null;
}

export interface AnalyticsOperationQuery extends AnalyticsRange {
  readonly type: AnalyticsRecordType;
  readonly status: string | null;
  readonly environment: ExecutionProvenance['environment'] | null;
  readonly deliveryMode: ExecutionProvenance['deliveryMode'] | null;
  readonly groupBy: 'none' | 'status' | 'robot';
}

export interface AnalyticsOperationGroup {
  /** Robot이 연결되지 않은 그룹은 null이며 실제 문자열 ID와 구분한다. */
  readonly key: string | null;
  readonly count: number;
  /** 그룹 안에 기록량 미제공 record가 하나라도 있으면 불완전 합계를 만들지 않고 null이다. */
  readonly bytes: number | null;
}

export interface AnalyticsOperationResult {
  readonly records: readonly AnalyticsRecord[];
  readonly groups: readonly AnalyticsOperationGroup[];
}

export interface TelemetryAggregateQuery {
  readonly robotId: string;
  readonly channel: 'pose' | 'battery';
  readonly startMs: number;
  readonly endMs: number;
  readonly maxPoints: number;
}

export interface TelemetryAggregatePoint {
  readonly timestampMs: number;
  readonly average: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly sampleCount: number;
}

export interface TelemetryAggregateResult {
  readonly bucketMs: number;
  readonly displayedPointCount: number;
  /** Mapper가 timestamp 오름차순·중복 없음으로 정규화한 제한된 표시점이다. */
  readonly points: readonly TelemetryAggregatePoint[];
}

export interface AnalyticsPort {
  getOverview(query: AnalyticsRange): Promise<AnalyticsOverview>;
  queryOperations(query: AnalyticsOperationQuery): Promise<AnalyticsOperationResult>;
  queryTelemetry(query: TelemetryAggregateQuery): Promise<TelemetryAggregateResult>;
  subscribe(listener: () => void): () => void;
}
