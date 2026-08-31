import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MapStylePreferenceProvider,
  useMapStylePreference,
} from './map-style-preference-context';

function PreferenceProbe() {
  const {
    availableStyles,
    selectedStyle,
    selectMapStyle,
  } = useMapStylePreference();

  return (
    <>
      <output aria-label="선택된 지도 스타일">{selectedStyle.id}</output>
      <output aria-label="사용 가능한 지도 스타일">
        {availableStyles.map((style) => `${style.id}:${style.label}`).join(',')}
      </output>
      <button onClick={() => selectMapStyle('secondary')} type="button">
        추가 스타일 선택
      </button>
    </>
  );
}

function renderPreference() {
  return render(
    <MapStylePreferenceProvider>
      <PreferenceProbe />
    </MapStylePreferenceProvider>,
  );
}

describe('MapStylePreferenceProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('VITE_MAPBOX_STYLE_URL', 'mapbox://styles/test/primary');
    vi.stubEnv(
      'VITE_MAPBOX_SECONDARY_STYLE_URL',
      'mapbox://styles/test/secondary',
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('승인된 추가 스타일 선택을 저장하고 다음 마운트에서 복원한다', async () => {
    const user = userEvent.setup();
    const first = renderPreference();

    expect(screen.getByLabelText('선택된 지도 스타일')).toHaveTextContent(
      'primary',
    );
    expect(screen.getByLabelText('사용 가능한 지도 스타일')).toHaveTextContent(
      'primary:기본 스타일,secondary:네온',
    );

    await user.click(screen.getByRole('button', { name: '추가 스타일 선택' }));
    expect(screen.getByLabelText('선택된 지도 스타일')).toHaveTextContent(
      'secondary',
    );
    first.unmount();

    renderPreference();
    expect(screen.getByLabelText('선택된 지도 스타일')).toHaveTextContent(
      'secondary',
    );
  });

  it('추가 스타일 URL이 없으면 선택지에서 제외한다', () => {
    vi.stubEnv('VITE_MAPBOX_SECONDARY_STYLE_URL', '');

    renderPreference();

    expect(screen.getByLabelText('사용 가능한 지도 스타일')).toHaveTextContent(
      'primary:기본 스타일',
    );
    expect(screen.getByLabelText('사용 가능한 지도 스타일'))
      .not.toHaveTextContent('secondary');
  });
});
