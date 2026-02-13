"use client";

import { Sidebar } from "./sidebar";
import { MobileDrawer } from "./mobile-drawer";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-white/20 px-4 py-3 md:hidden">
          <MobileDrawer />
          <span className="text-lg font-bold">Pulseboard</span>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
