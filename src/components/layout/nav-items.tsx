import {
  LayoutDashboard,
  FolderKanban,
  Users,
  ImageIcon,
  Building2,
  Radio,
  Network,
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
} from "lucide-react";
import { getBrowseReturnUrl } from "@/lib/browse-context";

export type NavItem = {
  href: string;
  icon: React.ReactNode;
  label: string;
  /** Optional client-side href resolver (e.g. to restore browse context). */
  resolveHref?: () => string;
};

/**
 * Canonical navigation list — single source of truth for the desktop
 * sidebar, the mobile drawer, and the top bar's section label. Keep this
 * in sync; do not re-declare nav items elsewhere.
 */
export const navItems: NavItem[] = [
  { href: "/", icon: <LayoutDashboard size={20} />, label: "Dashboard" },
  { href: "/sessions", icon: <Clapperboard size={20} />, label: "Sessions" },
  { href: "/sets", icon: <ImageIcon size={20} />, label: "Sets" },
  { href: "/collections", icon: <Library size={20} />, label: "Collections" },
  { href: "/favorites", icon: <Heart size={20} />, label: "Favorites" },
  { href: "/atlas", icon: <LayoutGrid size={20} />, label: "Atlas" },
  { href: "/people", icon: <Users size={20} />, label: "People", resolveHref: getBrowseReturnUrl },
  { href: "/watchlist", icon: <Eye size={20} />, label: "Watchlist" },
  { href: "/projects", icon: <FolderKanban size={20} />, label: "Projects" },
  { href: "/labels", icon: <Building2 size={20} />, label: "Labels" },
  { href: "/channels", icon: <Radio size={20} />, label: "Channels" },
  { href: "/artists", icon: <Palette size={20} />, label: "Artists" },
  { href: "/networks", icon: <Network size={20} />, label: "Networks" },
  { href: "/import", icon: <Upload size={20} />, label: "Import" },
  { href: "/staging-sets", icon: <Layers size={20} />, label: "Staging Sets" },
  { href: "/shopping-list", icon: <HardDrive size={20} />, label: "Shopping List" },
  { href: "/archive", icon: <FolderSearch size={20} />, label: "Archive" },
  { href: "/maintenance", icon: <Wrench size={20} />, label: "Maintenance" },
  { href: "/settings", icon: <Settings size={20} />, label: "Settings" },
];

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
