import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ImageIcon,
  Building2,
  Radio,
  Settings,
  Clapperboard,
  Library,
  LayoutGrid,
  Layers,
  Upload,
  Palette,
  HardDrive,
  FolderSearch,
  Wrench,
  Eye,
  Heart,
  BookUser,
  Tag,
} from "lucide-react";
import { getBrowseReturnUrl } from "@/lib/browse-context";

export type NavItem = {
  href: string;
  icon: React.ReactNode;
  label: string;
  /** Optional client-side href resolver (e.g. to restore browse context). */
  resolveHref?: () => string;
};

export type NavSection = {
  /** Heading above the group; none for the top and bottom rows */
  title?: string;
  /** "bottom": pinned to the foot of the sidebar, above Sign out */
  pin?: "bottom";
  items: NavItem[];
};

/**
 * Canonical navigation — single source of truth for the desktop sidebar, the
 * mobile drawer, and the top bar's section label. Grouped by job (2026-11-12):
 * the library first, the makers, curating, discovering new people, the import
 * pipeline; the system pages are pinned to the foot of the sidebar. Do not re-declare nav items elsewhere.
 */
export const navSections: NavSection[] = [
  { items: [{ href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" }] },
  {
    title: "Library",
    items: [
      { href: "/people", icon: <Users size={20} />, label: "People", resolveHref: getBrowseReturnUrl },
      { href: "/sets", icon: <ImageIcon size={20} />, label: "Sets" },
      { href: "/sessions", icon: <Clapperboard size={20} />, label: "Sessions" },
    ],
  },
  {
    title: "Makers",
    items: [
      { href: "/channels", icon: <Radio size={20} />, label: "Channels" },
      { href: "/labels", icon: <Building2 size={20} />, label: "Labels" },
      { href: "/artists", icon: <Palette size={20} />, label: "Artists" },
      { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
    ],
  },
  {
    title: "Curate",
    items: [
      { href: "/favorites", icon: <Heart size={20} />, label: "Favorites" },
      { href: "/collections", icon: <Library size={20} />, label: "Collections" },
      { href: "/tags", icon: <Tag size={20} />, label: "Tags" },
      { href: "/atlas", icon: <LayoutGrid size={20} />, label: "Atlas" },
    ],
  },
  {
    title: "Discover",
    items: [
      { href: "/people/contacts", icon: <BookUser size={20} />, label: "Contacts" },
      { href: "/watchlist", icon: <Eye size={20} />, label: "Watchlist" },
      { href: "/shopping-list", icon: <HardDrive size={20} />, label: "Shopping List" },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { href: "/import", icon: <Upload size={20} />, label: "Import" },
      { href: "/staging-sets", icon: <Layers size={20} />, label: "Staging Sets" },
      { href: "/archive", icon: <FolderSearch size={20} />, label: "Archive" },
    ],
  },
  {
    pin: "bottom",
    items: [
      { href: "/maintenance", icon: <Wrench size={20} />, label: "Maintenance" },
      { href: "/settings", icon: <Settings size={20} />, label: "Settings" },
    ],
  },
];

/** Every nav item, flat (active-state and section-label lookups) */
export const navItems: NavItem[] = navSections.flatMap((s) => s.items);

/**
 * Resolve the current section label for a pathname (longest href-prefix
 * match), so the top bar can show context even on detail routes like
 * `/people/[id]`. Falls back to "Pulseboard".
 */
export function getSectionLabel(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  const match = navItems
    .filter((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Pulseboard";
}
