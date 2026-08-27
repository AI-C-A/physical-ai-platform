import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  useParams,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { appendPathSegment, decodePathSegment } from './navigation';

function DecodedPathParameter() {
  const { recordId = '' } = useParams();

  return (
    <output data-testid="decoded-path-parameter">
      {decodePathSegment(recordId)}
    </output>
  );
}

describe('React Router 동적 경로 식별자 통합', () => {
  it.each([
    '.',
    '..',
    'site/a?mode=x#top',
    '로봇-가/🤖',
    '~id~marker',
    '%2F',
  ])('브라우저 경로를 거쳐도 %s 식별자를 복원한다', (id) => {
    const path = appendPathSegment('/records', id);
    const browserPath = new URL(path, 'https://example.test').pathname;
    const router = createMemoryRouter(
      [
        {
          path: '/records/:recordId',
          element: <DecodedPathParameter />,
        },
      ],
      { initialEntries: [browserPath] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('decoded-path-parameter').textContent).toBe(id);
  });
});
