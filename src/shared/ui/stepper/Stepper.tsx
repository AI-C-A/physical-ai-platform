export interface StepperItem {
  readonly label: string;
  readonly description?: string;
}

interface StepperProps {
  readonly activeIndex: number;
  readonly items: readonly StepperItem[];
}

export function Stepper({ activeIndex, items }: StepperProps) {
  return (
    <ol aria-label="진행 단계" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item, index) => {
        const state = index < activeIndex ? '완료' : index === activeIndex ? '현재' : '대기';
        return (
          <li
            aria-current={index === activeIndex ? 'step' : undefined}
            className={index === activeIndex
              ? 'rounded-[var(--design-radius-control)] border-0 bg-selection-background p-3'
              : 'rounded-[var(--design-radius-control)] border-0 bg-layer-base p-3'}
            key={item.label}
          >
            <span className="text-xs font-bold text-muted">{String(index + 1)} · {state}</span>
            <strong className="mt-1 block text-sm">{item.label}</strong>
            {item.description === undefined ? null : <span className="mt-1 block text-xs text-muted">{item.description}</span>}
          </li>
        );
      })}
    </ol>
  );
}
