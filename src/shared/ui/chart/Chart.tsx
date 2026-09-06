import type { ReactNode } from 'react';
import { getButtonClassName } from '@/shared/ui/button';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const axisTick = { fill: 'var(--muted)', fontSize: 14 };
const axisLine = { stroke: 'var(--border)' };
const tooltipStyle = {
  backgroundColor: 'var(--layer-raised)',
  borderColor: 'var(--border)',
  borderRadius: 'var(--design-radius-control)',
  color: 'var(--foreground)',
};

export interface ChartDatum {
  readonly id?: string;
  readonly label: string;
  readonly value: number;
}

interface ChartProps {
  readonly accessibleSummary: ReactNode;
  readonly data: readonly ChartDatum[];
  readonly isPending?: boolean;
  readonly kind?: 'bar' | 'line';
  readonly onDatumSelect?: (datum: ChartDatum) => void;
}

export function Chart({
  accessibleSummary,
  data,
  isPending = false,
  kind = 'line',
  onDatumSelect,
}: ChartProps) {
  const chartData = [...data];
  return (
    <div aria-busy={isPending}>
      <div aria-hidden="true" className="h-64 w-full">
        <ResponsiveContainer height="100%" width="100%">
          {kind === 'bar' ? (
            <BarChart data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={axisLine} dataKey="label" tick={axisTick} tickLine={false} />
              <YAxis axisLine={false} tick={axisTick} tickLine={false} width={48} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} cursor={{ fill: 'var(--surface-muted)' }} />
              <Bar
                dataKey="value"
                fill="var(--action-primary)"
                isAnimationActive={false}
              />
            </BarChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis axisLine={axisLine} dataKey="label" tick={axisTick} tickLine={false} />
              <YAxis axisLine={false} tick={axisTick} tickLine={false} width={48} />
              <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--foreground)' }} cursor={{ stroke: 'var(--muted)' }} />
              <Line
                dataKey="value"
                dot={false}
                isAnimationActive={false}
                stroke="var(--action-primary)"
                strokeWidth={2}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="sr-only">{accessibleSummary}</div>
      {onDatumSelect === undefined ? null : (
        <div
          aria-label="차트 상세 탐색"
          className="mt-3 flex flex-wrap gap-2"
          role="group"
        >
          {data.map((datum, index) => (
            <button
              aria-disabled={isPending}
              className={getButtonClassName('secondary', 'px-2 text-xs aria-disabled:cursor-not-allowed aria-disabled:opacity-50')}
              key={`${datum.id ?? datum.label}-${String(index)}`}
              onClick={() => {
                if (!isPending) onDatumSelect(datum);
              }}
              type="button"
            >
              {datum.label} 상세
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
