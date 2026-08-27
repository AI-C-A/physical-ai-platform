/** 목록 선택과 내부 라우팅에 필요한, 실제로 제공되는 Robot 식별 정보다. */
export interface RobotDescriptor {
  readonly id: string;
  readonly serialNumber: string | null;
  readonly displayName: string;
  readonly description: string | null;
  readonly integrationProfileId: string;
}
