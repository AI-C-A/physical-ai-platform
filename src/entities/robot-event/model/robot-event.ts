export type RobotEventType = 'info' | 'warning' | 'error';

export interface RobotEvent {
  readonly id: string;
  readonly robotId: string;
  readonly type: RobotEventType;
  readonly occurredAtMs: number;
  readonly title: string;
  readonly detail: string;
}
