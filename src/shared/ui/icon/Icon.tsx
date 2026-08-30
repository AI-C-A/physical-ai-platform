import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileChartColumn,
  GitBranch,
  LayoutGrid,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Minimize2,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Radio,
  Route,
  Search,
  Square,
  TableProperties,
  X,
} from 'lucide-react';

export type IconName =
  | 'activity'
  | 'analytics'
  | 'apps'
  | 'back'
  | 'check'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'database'
  | 'download'
  | 'events'
  | 'intervention'
  | 'location'
  | 'map'
  | 'maximize'
  | 'menu'
  | 'minimize'
  | 'mlops'
  | 'more'
  | 'panel-close'
  | 'panel-open'
  | 'play'
  | 'radio'
  | 'report'
  | 'robot'
  | 'route'
  | 'search'
  | 'stop'
  | 'table';

interface IconProps {
  readonly label?: string;
  readonly name: IconName;
  readonly size?: 'sm' | 'md';
}

const icons = {
  activity: Activity,
  analytics: BarChart3,
  apps: LayoutGrid,
  back: ChevronLeft,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  close: X,
  database: Database,
  download: Download,
  events: CircleAlert,
  intervention: BellRing,
  location: MapPin,
  map: Map,
  maximize: Maximize2,
  menu: Menu,
  minimize: Minimize2,
  mlops: GitBranch,
  more: MoreHorizontal,
  'panel-close': PanelLeftClose,
  'panel-open': PanelLeftOpen,
  play: Play,
  radio: Radio,
  report: FileChartColumn,
  robot: Bot,
  route: Route,
  search: Search,
  stop: Square,
  table: TableProperties,
} as const;

export function Icon({ label, name, size = 'sm' }: IconProps) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden={label === undefined}
      aria-label={label}
      size={size === 'sm' ? 16 : 20}
      strokeWidth={1.8}
    />
  );
}
