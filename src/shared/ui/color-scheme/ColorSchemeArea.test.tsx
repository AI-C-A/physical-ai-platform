import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ColorSchemeArea } from './ColorSchemeArea';

describe('ColorSchemeArea', () => {
  it('하위 영역에 색상 모드와 레이어를 선언한다', () => {
    render(
      <ColorSchemeArea layer="floating" scheme="dark">
        <span>내용</span>
      </ColorSchemeArea>,
    );

    const area = screen.getByText('내용').parentElement;
    expect(area).toHaveAttribute('data-color-scheme', 'dark');
    expect(area).toHaveAttribute('data-color-layer', 'floating');
    expect(area).toHaveClass('text-foreground');
  });

  it('모드를 지정하지 않으면 시스템 또는 상위 영역 설정을 상속한다', () => {
    render(<ColorSchemeArea>내용</ColorSchemeArea>);

    const area = screen.getByText('내용');
    expect(area).not.toHaveAttribute('data-color-scheme');
    expect(area).toHaveAttribute('data-color-layer', 'base');
  });
});
