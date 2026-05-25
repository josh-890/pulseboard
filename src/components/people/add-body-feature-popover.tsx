"use client";

import { useEffect, useRef } from "react";
import type { BodyMarkType, BodyModificationType } from "@/generated/prisma/client";
import { BODY_MARK_TYPES, BODY_MODIFICATION_TYPES } from "@/lib/constants/body";

// Phase G Slice 11 / project_identity_bearing_ui: type picker for the
// unified Body Features card's [+ Add] affordance. Lists every type grouped
// by category; click → opens the matching Add sheet pre-selected.

export type BodyFeatureChoice =
  | { kind: "mark"; type: BodyMarkType }
  | { kind: "modification"; type: BodyModificationType };

type Props = {
  anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (choice: BodyFeatureChoice) => void;
  onClose: () => void;
};

export function AddBodyFeaturePopover({ anchorRef, onSelect, onClose }: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside-click or Escape.
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!popoverRef.current || !anchorRef.current) return;
      const target = e.target as Node;
      if (popoverRef.current.contains(target)) return;
      if (anchorRef.current.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [anchorRef, onClose]);

  return (
    <div
      ref={popoverRef}
      role="menu"
      className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-white/15 bg-popover p-1.5 shadow-lg"
    >
      <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Body Marks
      </div>
      {BODY_MARK_TYPES.map((t) => (
        <button
          key={`mark-${t}`}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect({ kind: "mark", type: t });
            onClose();
          }}
          className="block w-full rounded-md px-2 py-1.5 text-left text-sm capitalize transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          {t}
        </button>
      ))}
      <div className="my-1 border-t border-white/10" />
      <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Body Modifications
      </div>
      {BODY_MODIFICATION_TYPES.map((t) => (
        <button
          key={`mod-${t}`}
          type="button"
          role="menuitem"
          onClick={() => {
            onSelect({ kind: "modification", type: t });
            onClose();
          }}
          className="block w-full rounded-md px-2 py-1.5 text-left text-sm capitalize transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
        >
          {t}
        </button>
      ))}
    </div>
  );
}
