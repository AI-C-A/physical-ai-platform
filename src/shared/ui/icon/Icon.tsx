import {
  Activity,
  BarChart3,
  BellRing,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
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
  Pause,
  Play,
  Radio,
  RotateCcw,
  Route,
  Search,
  Settings as SettingsIcon,
  Square,
  TableProperties,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';

export type IconName =
  | 'activity'
  | 'analytics'
  | 'apps'
  | 'back'
  | 'charging'
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
  | 'pause'
  | 'play'
  | 'radio'
  | 'record'
  | 'report'
  | 'restart'
  | 'robot'
  | 'route'
  | 'search'
  | 'settings'
  | 'stop'
  | 'table'
  | 'wifi-off';

interface IconProps {
  readonly filled?: boolean;
  readonly label?: string;
  readonly name: IconName;
  readonly size?: 'sm' | 'md';
}

const icons = {
  activity: Activity,
  analytics: BarChart3,
  apps: LayoutGrid,
  back: ChevronLeft,
  charging: Zap,
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
  pause: Pause,
  play: Play,
  radio: Radio,
  record: Circle,
  report: FileChartColumn,
  restart: RotateCcw,
  robot: Bot,
  route: Route,
  search: Search,
  settings: SettingsIcon,
  stop: Square,
  table: TableProperties,
  'wifi-off': WifiOff,
} as const;

export function Icon({ filled = false, label, name, size = 'sm' }: IconProps) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden={label === undefined}
      aria-label={label}
      fill={filled ? 'currentColor' : 'none'}
      size={size === 'sm' ? 16 : 20}
      strokeWidth={1.8}
    />
  );
}
