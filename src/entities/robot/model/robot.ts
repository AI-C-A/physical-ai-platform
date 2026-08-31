/** 데모에서 Robot별 UI 구성을 선택하기 위한 내부 분류이며 외부 연동 계약이 아니다. */
export type RobotType = 'humanoid' | 'quadruped' | 'mobile';

/** 목록 선택과 내부 라우팅에 필요한, 실제로 제공되는 Robot 식별 정보다. */
export interface RobotDescriptor {
  readonly id: string;
  readonly serialNumber: string | null;
  readonly name: string | null;
  readonly displayName: string;
  readonly integrationProfileId: string;
  /** 외부 연동에서 유형을 확인할 수 없으면 임의 값을 만들지 않고 필드를 생략한다. */
  readonly robotType?: RobotType;
}
