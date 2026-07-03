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
  Library,
  Lightbulb,
  ListTodo,
  Pencil,
  Plus,
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
  | "topics"
  | "projects"
  | "knowledge"
  // [T-063a] 「库」一级导航(素材+知识+经验三 tab 的资产库)。
  | "library"
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
  topics: ListTodo,
  projects: FolderKanban,
  knowledge: BookOpen,
  library: Library,
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
