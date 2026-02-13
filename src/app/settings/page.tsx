"use client";

import { ThemeToggle } from "@/components/settings/theme-toggle";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Settings</h1>

      <div className="rounded-2xl border border-white/30 bg-card/70 p-4 shadow-lg backdrop-blur-md md:p-6 dark:border-white/10">
        <h2 className="mb-4 text-lg font-semibold">Appearance</h2>
        <ThemeToggle />
      </div>
    </div>
  );
}
