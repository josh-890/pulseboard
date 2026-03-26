"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: string;
  /** Optional client-side href resolver (e.g. to restore browse context from sessionStorage) */
  resolveHref?: () => string;
  icon: React.ReactNode;
  label: string;
  collapsed?: boolean;
  onClick?: () => void;
};

export function NavLink({ href, resolveHref, icon, label, collapsed, onClick }: NavLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

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
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
