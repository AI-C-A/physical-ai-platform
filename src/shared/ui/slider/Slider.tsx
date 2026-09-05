import type { ComponentProps, CSSProperties } from 'react';

import { getFloatingSurfaceClassName } from '@/shared/ui/surface';

import './slider.css';

type SliderProps = Omit<ComponentProps<'input'>, 'type' | 'min' | 'max' | 'value' | 'defaultValue'> & {
  readonly min?: number;
  readonly max: number;
  readonly value: number;
  readonly valueLabel?: string;
};

/** Native range interaction with a theme-aware track and thumb. */
export function Slider({ min = 0, max, value, valueLabel, className, style, ...props }: SliderProps) {
  const position = Math.min(max, Math.max(min, value));
  const progress = max > min ? (position - min) / (max - min) * 100 : 0;

  return (
    <span
      className="slider"
      data-disabled={props.disabled || undefined}
      style={{ '--slider-progress': `${String(progress)}%` } as CSSProperties}
    >
      <span aria-hidden="true" className="slider__track">
        <span className="slider__fill" />
      </span>
      <input
        {...props}
        className={['slider__input', className].filter(Boolean).join(' ')}
        max={max}
        min={min}
        style={style}
        type="range"
        value={position}
      />
      {valueLabel === undefined ? null : (
        <span aria-hidden="true" className="slider__value-anchor">
          <span
            className={`slider__value ${getFloatingSurfaceClassName()} rounded-[var(--design-radius-control)] px-2 py-1 text-xs font-semibold tabular-nums text-foreground`}
          >
            {valueLabel}
          </span>
        </span>
      )}
    </span>
  );
}
