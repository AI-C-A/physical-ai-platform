import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Chart } from './Chart';

describe('Chart', () => {
  it('갱신 중에는 drilldown 포커스를 유지하면서 선택을 막는다', async () => {
    const user = userEvent.setup();
    const onDatumSelect = vi.fn();
    render(
      <Chart
        accessibleSummary={<p>완료 12건</p>}
        data={[{ label: '완료', value: 12 }]}
        isPending
        onDatumSelect={onDatumSelect}
      />,
    );

    const drilldown = screen.getByRole('button', { name: '완료 상세' });
    drilldown.focus();
    await user.click(drilldown);

    expect(drilldown).toHaveAttribute('aria-disabled', 'true');
    expect(drilldown).toHaveFocus();
    expect(onDatumSelect).not.toHaveBeenCalled();
  });

  it('시각 차트를 숨긴 요약과 이름 있는 상세 탐색 버튼으로 보완한다', async () => {
    const user = userEvent.setup();
    const onDatumSelect = vi.fn();

    render(
      <Chart
        accessibleSummary={<p>완료 12건, 실패 2건</p>}
        data={[
          { label: '완료', value: 12 },
          { label: '실패', value: 2 },
        ]}
        kind="bar"
        onDatumSelect={onDatumSelect}
      />,
    );

    expect(
      screen.getByText('완료 12건, 실패 2건').closest('.sr-only'),
    ).not.toBeNull();
    const drilldown = screen.getByRole('group', { name: '차트 상세 탐색' });
    await user.click(screen.getByRole('button', { name: '실패 상세' }));

    expect(drilldown).toContainElement(
      screen.getByRole('button', { name: '완료 상세' }),
    );
    expect(onDatumSelect).toHaveBeenCalledWith({ label: '실패', value: 2 });
  });
});
