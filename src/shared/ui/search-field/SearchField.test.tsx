import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchField } from './SearchField';

describe('SearchField', () => {
  it('입력과 키보드 지우기가 값을 갱신하고 검색창에 포커스를 돌린다', async () => {
    function Search() {
      const [value, setValue] = useState('');
      const inputRef = useRef<HTMLInputElement>(null);
      return <SearchField inputRef={inputRef} label="로봇 검색" value={value} onValueChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Search />);
    const input = screen.getByRole('searchbox', { name: '로봇 검색' });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await user.type(input, 'robot-01');
    await user.tab();
    expect(screen.getByRole('button', { name: '로봇 검색어 모두 지우기' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([{ disabled: true }, { readOnly: true }, { clearable: false }])('수정할 수 없는 검색에서는 지우기를 제공하지 않는다: %o', (state) => {
    render(<SearchField label="검색" value="보존할 값" onValueChange={vi.fn()} {...state} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('보존할 값');
  });
});
