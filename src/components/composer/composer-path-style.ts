// One colour per Composer path (ADR-0042) — tabs, coverage dots and tiles agree.
// Tailwind classes spelled out in full so the compiler keeps them.

export type PathStyle = { dot: string; ring: string; on: string; text: string };

const STYLES: Record<string, PathStyle> = {
  Figure: { dot: "bg-violet-500", ring: "ring-violet-500/60", on: "bg-violet-500/15 border-violet-500/60", text: "text-violet-700 dark:text-violet-300" },
  Clothing: { dot: "bg-pink-500", ring: "ring-pink-500/60", on: "bg-pink-500/15 border-pink-500/60", text: "text-pink-700 dark:text-pink-300" },
  Camera: { dot: "bg-indigo-500", ring: "ring-indigo-500/60", on: "bg-indigo-500/15 border-indigo-500/60", text: "text-indigo-700 dark:text-indigo-300" },
  Expression: { dot: "bg-amber-500", ring: "ring-amber-500/60", on: "bg-amber-500/15 border-amber-500/60", text: "text-amber-700 dark:text-amber-300" },
};

const FALLBACK: PathStyle = { dot: "bg-primary", ring: "ring-primary/60", on: "bg-primary/15 border-primary/60", text: "text-primary" };

export function pathStyle(name: string): PathStyle {
  return STYLES[name] ?? FALLBACK;
}

const ASPECT_CLASS: Record<string, string> = { "3:4": "aspect-[3/4]", "1:1": "aspect-square" };

/** The Tailwind aspect class for a path's tile shape ("3:4", "1:1") */
export function tileAspectClass(tileAspect: string): string {
  return ASPECT_CLASS[tileAspect] ?? "aspect-square";
}
