"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { getEntityKeyForPath } from "@/lib/constants/entity-theme";

type NavLinkProps = {
  href: string;
  /** Optional client-side href resolver (e.g. to restore browse context from sessionStorage) */
  resolveHref?: () => string;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  onClick?: () => void;
};

/** Map entity key → Tailwind active-state classes */
const ENTITY_ACTIVE_CLASSES: Record<string, string> = {
  session: "bg-entity-session/10 font-medium text-entity-session",
  set: "bg-entity-set/10 font-medium text-entity-set",
  person: "bg-entity-person/10 font-medium text-entity-person",
  collection: "bg-entity-collection/10 font-medium text-entity-collection",
  project: "bg-entity-project/10 font-medium text-entity-project",
  label: "bg-entity-label/10 font-medium text-entity-label",
  channel: "bg-entity-channel/10 font-medium text-entity-channel",
  network: "bg-entity-network/10 font-medium text-entity-network",
};

export function NavLink({ href, resolveHref, icon, label, collapsed, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  const entityKey = getEntityKeyForPath(href);
  const activeClass = entityKey
    ? ENTITY_ACTIVE_CLASSES[entityKey]
    : "bg-primary/10 font-medium text-primary";

  function handleClick(e: React.MouseEvent) {
    if (resolveHref) {
      e.preventDefault();
      router.push(resolveHref());
    }
    onClick?.();
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-xl py-2 transition-all duration-200",
        collapsed ? "justify-center px-2" : "gap-3 px-3",
        isActive
          ? activeClass
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
