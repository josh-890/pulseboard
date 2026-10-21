import { SettingsSidebar } from "@/components/settings/settings-sidebar";
import { SettingsNavProvider } from "@/components/settings/settings-nav-provider";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SettingsNavProvider>
      <div className="flex min-h-full gap-4 sm:gap-8">
        <SettingsSidebar />
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </SettingsNavProvider>
  );
}
