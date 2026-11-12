"use client";

import { cn } from "@/lib/utils";
import { NavLink } from "./nav-link";
import { navSections } from "./nav-items";

type NavSectionsProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  /** "main": the scrolling groups; "bottom": the pinned system pages */
  part: "main" | "bottom";
};

/**
 * The sidebar's grouped links. Each group has a clear heading with a rule
 * running out to the edge and real space above it; on the icon rail the
 * heading becomes a divider line.
 */
export function NavSections({ collapsed, onNavigate, part }: NavSectionsProps) {
  const sections = navSections.filter((s) => (part === "bottom" ? s.pin === "bottom" : s.pin !== "bottom"));
  return (
    <>
      {sections.map((section, i) => {
        const headingId = section.title ? `nav-section-${section.title.toLowerCase()}` : undefined;
        return (
          <div
            key={section.title ?? `untitled-${part}-${i}`}
            role="group"
            aria-labelledby={headingId}
            className={cn("flex flex-col gap-0.5", i > 0 && (collapsed ? "mt-2" : "mt-3"))}
          >
            {section.title &&
              (collapsed ? (
                <>
                  <span id={headingId} className="sr-only">
                    {section.title}
                  </span>
                  <span aria-hidden="true" className="mx-1 mb-2 border-t border-foreground/20" />
                </>
              ) : (
                <div className="mb-0.5 flex items-center gap-2 px-3">
                  <span
                    id={headingId}
                    className="text-[11px] font-semibold uppercase tracking-wider text-foreground/60"
                  >
                    {section.title}
                  </span>
                  <span aria-hidden="true" className="flex-1 border-t border-foreground/15" />
                </div>
              ))}
            {section.items.map((item) => (
              <NavLink key={item.href} {...item} collapsed={collapsed} onClick={onNavigate} />
            ))}
          </div>
        );
      })}
    </>
  );
}
