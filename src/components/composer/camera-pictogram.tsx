import type { ReactNode } from "react";

// Built-in pictograms for the Camera path (ADR-0042, S4) — the one place where a
// diagram says more than a photo: where the camera is, and how much of the
// person the frame holds. Drawn on a 48×48 grid in currentColor, so they follow
// the theme. Tags without one fall back to their example or their text.

function Figure({ faint = false }: { faint?: boolean }) {
  return (
    <g opacity={faint ? 0.35 : 1}>
      <circle cx="24" cy="9" r="4" />
      <path d="M24 13v15M24 17l-7 6M24 17l7 6M24 28l-5 12M24 28l5 12" />
    </g>
  );
}

const frame = (x: number, y: number, w: number, h: number) => (
  <>
    <Figure faint />
    <rect x={x} y={y} width={w} height={h} rx="1.5" strokeWidth="2.25" />
  </>
);

function Camera({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-4" y="-3" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
      <path d="M4 -2l3 -1.5v7L4 2" fill="currentColor" stroke="none" />
    </g>
  );
}

const sight = (d: string) => <path d={d} strokeDasharray="2 2" opacity={0.6} />;

/** Seen from above: shoulders, head and where the face looks — turned `deg` away from the camera below */
function TopDown({ deg }: { deg: number }) {
  return (
    <>
      <g transform={`rotate(${deg} 24 18)`}>
        {/* where the face looks: a wedge, so front and back read apart at a glance */}
        <path d="M24 21l-6 10h12z" fill="currentColor" stroke="none" opacity={0.85} />
        <ellipse cx="24" cy="18" rx="11" ry="4" />
        <circle cx="24" cy="18" r="4.5" fill="currentColor" stroke="none" opacity={0.2} />
        <circle cx="24" cy="18" r="4.5" />
      </g>
      <Camera x={24} y={42} rotate={-90} />
    </>
  );
}

const PICTOGRAMS: Record<string, ReactNode> = {
  // Framing — how much of the person the frame holds
  "close-up": frame(18, 3, 12, 12),
  portrait: frame(15, 2, 18, 19),
  "upper-body": frame(13, 2, 22, 27),
  "cowboy-shot": frame(12, 2, 24, 34),
  "full-body": frame(11, 1, 26, 44),
  "wide-shot": (
    <>
      <g transform="translate(14 14) scale(0.42)">
        <Figure />
      </g>
      <rect x="3" y="5" width="42" height="38" rx="1.5" strokeWidth="2.25" />
    </>
  ),
  "lower-body": frame(14, 26, 20, 19),
  detail: frame(27, 18, 9, 9),
  // Camera angle — where the camera is
  "eye-level": (
    <>
      <Figure />
      <Camera x={6} y={9} />
      {sight("M11 9h8")}
    </>
  ),
  "from-above": (
    <>
      <Figure />
      <Camera x={7} y={4} rotate={35} />
      {sight("M11 7l8 8")}
    </>
  ),
  "from-below": (
    <>
      <Figure />
      <Camera x={7} y={44} rotate={-40} />
      {sight("M11 41l9 -10")}
    </>
  ),
  "dutch-angle": (
    <>
      <Figure faint />
      <rect x="11" y="4" width="26" height="40" rx="1.5" strokeWidth="2.25" transform="rotate(-14 24 24)" />
    </>
  ),
  // Facing — the body turned to the camera (seen from above)
  "facing-viewer": <TopDown deg={0} />,
  "three-quarter-view": <TopDown deg={45} />,
  "from-side": <TopDown deg={90} />,
  "facing-away": <TopDown deg={150} />,
  "from-behind": <TopDown deg={180} />,
};

export type CameraPictogramProps = { tagName: string; className?: string };

/** True when the tag has a built-in pictogram */
export function hasCameraPictogram(tagName: string): boolean {
  return tagName in PICTOGRAMS;
}

export function CameraPictogram({ tagName, className }: CameraPictogramProps) {
  const art = PICTOGRAMS[tagName];
  if (!art) return null;
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-testid="camera-pictogram"
    >
      {art}
    </svg>
  );
}
