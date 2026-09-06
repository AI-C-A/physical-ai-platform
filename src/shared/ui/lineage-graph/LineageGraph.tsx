import { Link } from "react-router-dom";

import { Badge } from "@/shared/ui/badge";
import { Icon } from "@/shared/ui/icon";

interface LineageGraphNode {
  readonly id: string;
  readonly type:
    | "capture"
    | "episode"
    | "drive"
    | "intervention"
    | "dataset"
    | "training"
    | "model"
    | "evaluation"
    | "deployment"
    | "inference";
  readonly label: string;
  readonly detailPath: string;
  readonly status: string;
}

interface LineageGraphProps {
  readonly nodes: readonly LineageGraphNode[];
}

export function LineageGraph({ nodes }: LineageGraphProps) {
  const order: readonly LineageGraphNode["type"][] = [
    "capture",
    "episode",
    "drive",
    "intervention",
    "dataset",
    "training",
    "model",
    "evaluation",
    "deployment",
    "inference",
  ];
  const visible = order.flatMap((type) =>
    nodes.filter((node) => node.type === type).slice(0, 2),
  );
  return (
    <div className="w-0 min-w-full overflow-x-auto pb-3">
      <ol
        aria-label="플라이휠 계보"
        className="flex min-w-max items-stretch gap-2"
      >
        {visible.map((node, index) => (
          <li className="flex items-center gap-2" key={node.id}>
            <Link
              className="ui-focus-inset grid min-h-28 w-48 content-between rounded-[var(--design-radius-surface)] border-0 bg-layer-base p-4 hover:bg-action-secondary-hover"
              to={node.detailPath}
            >
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {node.type}
              </span>
              <strong className="line-clamp-2 text-sm">{node.label}</strong>
              <Badge>{node.status}</Badge>
            </Link>
            {index === visible.length - 1 ? null : (
              <Icon name="chevron-right" />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
