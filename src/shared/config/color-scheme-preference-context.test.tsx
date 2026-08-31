import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ColorSchemePreferenceProvider,
  useColorSchemePreference,
} from './color-scheme-preference-context';

function PreferenceProbe() {
  const { preference, selectPreference } = useColorSchemePreference();

  return (
    <>
      <output aria-label="선택된 색상 모드">{preference}</output>
      <button onClick={() => selectPreference('dark')} type="button">
        다크 선택
      </button>
      <button onClick={() => selectPreference('system')} type="button">
        시스템 선택
      </button>
    </>
  );
}

function renderPreference() {
  return render(
    <ColorSchemePreferenceProvider>
      <PreferenceProbe />
    </ColorSchemePreferenceProvider>,
  );
}

describe('ColorSchemePreferenceProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-color-scheme');
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-color-scheme');
  });

  it('기본값으로 시스템 색상 모드를 따른다', () => {
    renderPreference();

    expect(screen.getByLabelText('선택된 색상 모드')).toHaveTextContent(
      'system',
    );
    expect(document.documentElement).not.toHaveAttribute('data-color-scheme');
  });

  it('명시적인 색상 모드를 즉시 적용하고 다음 마운트에서 복원한다', async () => {
    const user = userEvent.setup();
    const first = renderPreference();

    await user.click(screen.getByRole('button', { name: '다크 선택' }));

    expect(document.documentElement).toHaveAttribute(
      'data-color-scheme',
      'dark',
    );
    expect(window.localStorage.getItem(
      'robot-army-tiger.color-scheme.v1',
    )).toBe('dark');
    first.unmount();

    renderPreference();
    expect(screen.getByLabelText('선택된 색상 모드')).toHaveTextContent(
      'dark',
    );
    expect(document.documentElement).toHaveAttribute(
      'data-color-scheme',
      'dark',
    );
  });

  it('시스템 모드로 돌아가면 명시적인 색상 모드를 제거한다', async () => {
    const user = userEvent.setup();
    renderPreference();

    await user.click(screen.getByRole('button', { name: '다크 선택' }));
    await user.click(screen.getByRole('button', { name: '시스템 선택' }));

    expect(document.documentElement).not.toHaveAttribute('data-color-scheme');
    expect(window.localStorage.getItem(
      'robot-army-tiger.color-scheme.v1',
    )).toBe('system');
  });
});
