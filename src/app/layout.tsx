import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PaletteProvider } from "@/components/layout/palette-provider";
import { DensityProvider } from "@/components/layout/density-provider";
import { BrowserLayoutProvider } from "@/components/layout/browser-layout-provider";
import { HeroLayoutProvider } from "@/components/layout/hero-layout-provider";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { AppShell } from "@/components/layout/app-shell";
import { CompareTrayProvider } from "@/components/collections/compare-tray-provider";
import { CompareTrayBar } from "@/components/collections/compare-tray-bar";
import { Toaster } from "@/components/ui/sonner";
import { getCurrentTenantConfig } from "@/lib/tenant-context";
import { isSingleTenantMode } from "@/lib/tenants";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulseboard",
  description: "Personal dashboard UI",
};

function getMinioUrlForClient(): string {
  if (isSingleTenantMode()) {
    return process.env.NEXT_PUBLIC_MINIO_URL ?? "";
  }
  const baseUrl = process.env.MINIO_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_MINIO_URL ?? "";
  try {
    const url = new URL(baseUrl);
    const bucket = getCurrentTenantConfig().minioBucket;
    return `${url.origin}/${bucket}`;
  } catch {
    return baseUrl;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__MINIO_URL__=${JSON.stringify(getMinioUrlForClient())};`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <PaletteProvider>
            <DensityProvider>
              <BrowserLayoutProvider>
              <HeroLayoutProvider>
                <SidebarProvider>
                  <CompareTrayProvider>
                    <AppShell>{children}</AppShell>
                    <CompareTrayBar />
                  </CompareTrayProvider>
                  <Toaster richColors />
                </SidebarProvider>
              </HeroLayoutProvider>
              </BrowserLayoutProvider>
            </DensityProvider>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
