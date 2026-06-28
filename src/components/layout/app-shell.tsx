"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";
import { BackToTop } from "./back-to-top";
import { APP_SCROLL_ID } from "@/lib/scroll-container";

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

  // App-shell with independent scroll regions: the outer row is locked to
  // the viewport height and the chrome (sidebar + top bar) never moves.
  // Only <main id="app-scroll"> scrolls — it is the single scroll
  // container for all page content (see lib/scroll-container.ts). Because
  // it has `overflow-y: auto`, it is also the containing block for
  // `position: sticky` descendants (toolbar, group/year headers), which
  // now stick relative to the content region top.
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/*
          No top padding: the sticky filter toolbar must be able to stick
          flush against the top bar. Any top padding here would leave a band
          above the stuck toolbar where scrolling content peeks through.
          Breathing room above the first content element comes from the top
          bar's border; the toolbar itself carries vertical padding.
        */}
        <main
          id={APP_SCROLL_ID}
          className="w-full flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6 md:px-8 md:pb-8"
        >
          {children}
        </main>
        <BackToTop />
      </div>
    </div>
  );
}
