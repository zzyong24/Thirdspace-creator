import {
  ArrowUpDown,
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  Crosshair,
  Ellipsis,
  FolderKanban,
  Funnel,
  Images,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  Pencil,
  Plus,
  Radar,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

export type CreatorIconKey =
  | "dashboard"
  | "positioning"
  | "radar"
  | "topics"
  | "projects"
  | "knowledge"
  | "assets"
  | "publishing"
  | "automations"
  | "experience"
  | "settings"
  | "search"
  | "notifications"
  | "add"
  | "more"
  | "share"
  | "edit"
  | "filter"
  | "sort"
  | "chevronRight"
  | "close"
  | "check"
  | "sparkles";

export const creatorIcons = Object.freeze({
  dashboard: LayoutDashboard,
  positioning: Crosshair,
  radar: Radar,
  topics: ListTodo,
  projects: FolderKanban,
  knowledge: BookOpen,
  assets: Images,
  publishing: Send,
  automations: CalendarClock,
  experience: Lightbulb,
  settings: Settings,
  search: Search,
  notifications: Bell,
  add: Plus,
  more: Ellipsis,
  share: Share2,
  edit: Pencil,
  filter: Funnel,
  sort: ArrowUpDown,
  chevronRight: ChevronRight,
  close: X,
  check: Check,
  sparkles: Sparkles,
} satisfies Readonly<Record<CreatorIconKey, LucideIcon>>);
