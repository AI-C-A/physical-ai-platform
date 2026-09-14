import { Link, useLocation } from 'react-router-dom';

import { useBranding } from '@/shared/config';
import { cn } from '@/shared/ui/class-names';
import { ColorSchemeArea } from '@/shared/ui/color-scheme';

import './brand.css';

interface BrandProps {
  readonly compact: boolean;
  readonly linked?: boolean;
  readonly animateCollapse?: boolean;
  readonly stacked?: boolean;
  readonly className?: string;
}

export function Brand({ compact, linked = true, animateCollapse = false, stacked = false, className: customClassName }: BrandProps) {
  const branding = useBranding();
  const location = useLocation();
  const wordmarkLines = stacked ? branding.productName.match(/^(\S+)\s+(.+)$/u) : null;
  const siteId = new URLSearchParams(location.search).get('siteId');
  const siteSelectionSearch = siteId === null ? '' : `?${new URLSearchParams({ siteId }).toString()}`;
  const className = compact
    ? 'ui-focus-inset flex min-h-12 shrink-0 items-center justify-center'
    : 'ui-focus-inset flex min-h-12 min-w-0 items-center gap-2';
  const content = (
    <>
      {branding.logo === null ? (
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center text-xs font-bold"
        >
          AR
        </span>
      ) : branding.logoDark !== undefined ? (
        <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center">
          <img alt="" className="brand-symbol-light size-full object-contain" src={branding.logo} />
          <img alt="" className="brand-symbol-dark size-full object-contain" src={branding.logoDark} />
        </span>
      ) : (
        <ColorSchemeArea scheme="light" className="flex size-8 shrink-0 items-center justify-center rounded-[var(--design-radius-control)] bg-background p-0.5">
          <img
            alt=""
            className="size-full object-contain"
            src={branding.logo}
          />
        </ColorSchemeArea>
      )}
      {compact && !animateCollapse ? null : (
        <span aria-hidden={compact} className={cn('min-w-0', animateCollapse && 'brand-collapse-label')}>
          <strong className="brand-wordmark block text-xs leading-tight">
            {wordmarkLines === null ? branding.productName : (
              <>
                <span className="block text-[0.6875rem] leading-[0.875rem]">{wordmarkLines[1]}</span>
                {' '}
                <span className="block text-lg leading-[1.375rem]">{wordmarkLines[2]}</span>
              </>
            )}
          </strong>
        </span>
      )}
    </>
  );

  if (!linked) {
    return (
      <div
        aria-label={branding.productName}
        data-compact={compact}
        className={cn(className, animateCollapse && 'brand-collapse', customClassName)}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      aria-label={`${branding.productName} 모니터링으로 이동`}
      data-compact={compact}
      className={cn(className, animateCollapse && 'brand-collapse', customClassName)}
      to={{ pathname: '/control/monitoring', search: siteSelectionSearch }}
      viewTransition={location.pathname !== '/control/monitoring'}
    >
      {content}
    </Link>
  );
}
