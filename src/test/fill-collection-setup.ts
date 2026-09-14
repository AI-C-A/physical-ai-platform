import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

export async function fillCollectionSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: '작업 지시' }), '과일을 종류에 맞는 트레이에 분류하세요.');
}
