import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Table, TableBody, TableCell, TableRow } from './Table';

describe('Table', () => {
  it('이름 있는 표에 키보드로 진입할 수 있는 가로 스크롤 영역을 제공한다', () => {
    render(
      <Table aria-label="운영 기록 목록">
        <TableBody>
          <TableRow><TableCell>기록 1</TableCell></TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('table', { name: '운영 기록 목록' })).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: '운영 기록 목록 가로 스크롤 영역' }),
    ).toHaveAttribute('tabindex', '0');
  });
});
