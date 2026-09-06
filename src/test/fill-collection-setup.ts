import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

export async function fillCollectionSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: '작업 ID' }), 'task-sort-fruit');
  await user.type(screen.getByRole('textbox', { name: '작업 지시' }), '과일을 종류에 맞는 트레이에 분류하세요.');
  await user.type(screen.getByRole('textbox', { name: '외골격 장치 ID' }), 'exoskeleton-001');
  await user.type(screen.getByRole('textbox', { name: 'Quest 손 추적 장치 ID' }), 'quest2-001');
  await user.type(screen.getByRole('textbox', { name: 'RBP 헤드 카메라 ID' }), 'rbp-headcam-001');
  await user.type(screen.getByRole('textbox', { name: '외부 카메라 ID · 선택' }), 'external-camera-001');
}
