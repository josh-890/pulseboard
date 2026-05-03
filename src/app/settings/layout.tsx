import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full gap-8">
      <SettingsSidebar />
      <div className="min-w-0 flex-1">
        {children}
      </div>
    </div>
  );
}
