import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { PaletteProvider } from "@/components/layout/palette-provider";
import { DensityProvider } from "@/components/layout/density-provider";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulseboard",
  description: "Personal dashboard UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <PaletteProvider>
            <DensityProvider>
              <SidebarProvider>
                <AppShell>{children}</AppShell>
                <Toaster richColors />
              </SidebarProvider>
            </DensityProvider>
          </PaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
