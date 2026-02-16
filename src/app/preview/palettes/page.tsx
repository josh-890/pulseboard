import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { palettes } from "@/lib/palettes";
import { PalettePanel } from "@/components/preview";

export default function PalettePreviewPage() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8 lg:p-10">
      <div className="mx-auto max-w-7xl space-y-10">
        {/* Page header */}
        <header>
          <Link
            href="/settings"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to Settings
          </Link>
          <h1 className="text-3xl font-bold text-foreground">
            Color Palette Preview
          </h1>
          <p className="mt-1 max-w-prose text-base text-muted-foreground">
            Compare 3 alternative palettes side-by-side. Each row shows light
            and dark mode with real UI elements so you can evaluate contrast,
            readability, and visual tone.
          </p>
        </header>

        {/* Palette sections — grouped by palette for scannable hierarchy */}
        {palettes.filter((p) => p.name !== "Default").map((palette, index) => (
          <section key={palette.name} aria-labelledby={`palette-${index}`}>
            <h2
              id={`palette-${index}`}
              className="mb-4 text-xl font-semibold text-foreground"
            >
              {palette.name}
            </h2>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <PalettePanel palette={palette} mode="light" />
              <PalettePanel palette={palette} mode="dark" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
