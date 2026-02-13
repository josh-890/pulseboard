"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm">Dark Mode</span>
        <Switch disabled />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">Dark Mode</span>
      <Switch
        checked={theme === "dark"}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      />
    </div>
  );
}
