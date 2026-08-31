export type InterventionStatus =
  | 'waiting'
  | 'accepted'
  | 'teleop'
  | 'resolved'
  | 'transferred'
  | 'emergency-stop';

export type InterventionPriority = 'critical' | 'high';

export interface InterventionSnapshot {
  readonly alt: string;
  readonly height: number;
  readonly url: string;
  readonly width: number;
}

export interface InterventionRequest {
  readonly id: string;
  readonly issueOccurredAtMs: number;
  readonly location: string;
  readonly operatorPrompt: string;
  readonly priority: InterventionPriority;
  readonly requestedAtMs: number;
  readonly robotId: string;
  readonly robotName: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly snapshot: InterventionSnapshot;
  readonly status: InterventionStatus;
  readonly situationSummary: string;
}
