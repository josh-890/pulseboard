"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileDrawer } from "./mobile-drawer";

// Routes that render without the app shell (sidebar, header)
const SHELL_EXCLUDED_PATHS = ["/login"];

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  if (SHELL_EXCLUDED_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/20 px-4 py-3 md:hidden">
          <MobileDrawer />
          <span className="text-lg font-bold">Pulseboard</span>
        </header>
        {/*
          `overflow-x: clip` (not `hidden`) prevents horizontal bleed
          without turning <main> into a CSS scroll container. Per CSS spec,
          `overflow-x: hidden` implicitly sets `overflow-y: auto`, which
          would make <main> the containing block for `position: sticky`
          descendants — breaking sticky year headers etc. since the actual
          scroll happens on the document.
        */}
        <main className="w-full flex-1 overflow-x-clip px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
