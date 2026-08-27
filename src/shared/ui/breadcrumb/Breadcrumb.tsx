import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  readonly label: string;
  readonly to?: string;
}

interface BreadcrumbProps { readonly items: readonly BreadcrumbItem[] }

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="현재 위치">
      <ol className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
        {items.map((item, index) => (
          <li className="flex items-center gap-2" key={`${item.label}-${String(index)}`}>
            {index === 0 ? null : <span aria-hidden="true">/</span>}
            {item.to === undefined ? <span aria-current="page">{item.label}</span> : <Link className="hover:text-neutral-950 hover:underline" to={item.to}>{item.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
