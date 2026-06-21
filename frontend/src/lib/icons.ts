import {
  ArrowUpDown,
  Bell,
  BookOpen,
  Check,
  ChevronRight,
  Crosshair,
  Ellipsis,
  FolderKanban,
  Funnel,
  Images,
  LayoutDashboard,
  Lightbulb,
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
  | "projects"
  | "knowledge"
  | "assets"
  | "publishing"
  | "monetization"
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
  projects: FolderKanban,
  knowledge: BookOpen,
  assets: Images,
  publishing: Send,
  monetization: Funnel,
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
