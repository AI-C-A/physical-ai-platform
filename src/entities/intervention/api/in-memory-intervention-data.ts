import type { ClockPort } from '@/shared/lib/clock';

import type { InterventionRequest } from '../model/intervention';

export function createInMemoryInterventionRequests(
  clock: ClockPort,
): readonly InterventionRequest[] {
  const anchorMs = clock.nowMs();
  return [
    {
      id: 'intervention-001',
      robotId: 'robot-001',
      robotName: '사족보행 로봇',
      siteId: 'pangyo-army-ax-hub',
      siteName: '판교 육군 AX 거점',
      location: '군수동 1층 보급 통로',
      operatorPrompt: '우회 경로 확인',
      situationSummary: '전방 보급 통로에 군용 수송 케이스가 쏟아져 로봇이 자율 주행을 중지했습니다.',
      priority: 'high',
      status: 'accepted',
      issueOccurredAtMs: anchorMs - (2 * 60_000 + 18_000),
      requestedAtMs: anchorMs - 2 * 60_000,
      snapshot: {
        alt: '군수 시설 보급 통로에 쏟아진 수송 케이스가 정찰 로봇의 경로를 막고 있는 모습',
        url: '/assets/interventions/military-logistics-route-blocked.png',
        width: 1672,
        height: 941,
      },
    },
    {
      id: 'intervention-002',
      robotId: 'robot-003',
      robotName: '양팔형 로봇',
      siteId: 'pangyo-outdoor-zone',
      siteName: '판교 기동 시험장',
      location: '차량 정비 구역 순찰로',
      operatorPrompt: '순찰로 진입 인원 확인',
      situationSummary: '차량 정비 구역 순찰로에 안전조끼를 입은 인원 1명이 진입해 로봇이 안전 정지했습니다.',
      priority: 'critical',
      status: 'waiting',
      issueOccurredAtMs: anchorMs - (17 * 60_000 + 11_000),
      requestedAtMs: anchorMs - (16 * 60_000 + 54_000),
      snapshot: {
        alt: '군 차량 정비 구역에서 안전조끼를 입은 인원이 정찰 로봇 순찰로로 진입한 모습',
        url: '/assets/interventions/military-maintenance-lane-person.png',
        width: 1672,
        height: 941,
      },
    },
  ];
}