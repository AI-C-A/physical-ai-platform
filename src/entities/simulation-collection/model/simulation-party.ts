/**
 * 시뮬레이션(WebXR) 화면에서 콘솔로 넘어오는 값의 공용 타입.
 *
 * 좌표는 시뮬레이션 월드(미터, y-up)이고, 물체는 태그/번호로만 식별한다.
 * 값은 브리지 스냅샷(postMessage)으로 오며, 여기서는 그 조각들의 타입만 정의한다.
 */

export type SimulationPeerMode = 'vr' | 'desktop' | 'monitor' | 'unknown';

export interface SimulationPeer {
  readonly id: string;
  readonly name: string;
  readonly mode: SimulationPeerMode;
}

export interface SimulationHandSample {
  readonly id: string;
  /** desktop: 마우스 포인터 손, controller: 컨트롤러, hand: 핸드트래킹 */
  readonly kind: 'desktop' | 'controller' | 'hand' | 'unknown';
  readonly position: readonly [number, number, number];
  readonly grabbing: boolean;
}

export interface SimulationTaskStep {
  readonly label: string;
  readonly state: 'todo' | 'active' | 'done' | 'unknown';
}
