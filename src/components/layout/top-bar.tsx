"use client";

import { usePathname } from "next/navigation";
import { MobileDrawer } from "./mobile-drawer";
import { getSectionLabel } from "./nav-items";

/**
 * Persistent top bar that lives outside the scrolling content region, so
 * it stays in view at every scroll depth. Holds the mobile drawer trigger
 * (md:hidden), the current section label (derived from the route), and a
 * right-aligned slot for future global actions.
 */
export function TopBar() {
  const pathname = usePathname();
  const section = getSectionLabel(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/20 bg-card/40 px-4 backdrop-blur-sm md:px-8">
      <MobileDrawer />
      <span className="text-base font-semibold text-foreground md:text-lg">
        {section}
      </span>
      {/* Right-aligned slot for future global/page actions */}
      <div className="ml-auto flex items-center gap-2" />
    </header>
  );
}
