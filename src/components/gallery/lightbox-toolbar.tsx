"use client";

import type { ReactNode } from "react";
import { Columns2, Crosshair, FolderPlus, HelpCircle, ImagePlus, PanelRight, PanelRightClose, Rows3, X } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { SlotState } from "@/components/tags/tag-slot-bar";
import type { MarkKey } from "@/lib/media-mark-tiers";
import type { PaletteTag } from "@/lib/services/tag-service";
import type { MediaItemOrigin } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LightboxMarkLadder } from "./lightbox-mark-ladder";
import { LightboxMoreMenu, type ToolbarToggle } from "./lightbox-more-menu";
import { LightboxOriginLink } from "./lightbox-origin-link";
import { LightboxTagPill } from "./lightbox-tag-pill";
import { LightboxToolbarButton } from "./lightbox-toolbar-button";

// The viewer's top bar (2026-10-17), in three zones so nothing covers the photo
// and nothing moves:
//   left    where you are — position, where the photo comes from, file name
//   centre  the work on this photo — the mark ladder, then organize
//   right   how you look at it — view toggles, ?, ⋯ and, alone at the edge, ✕
// Every button always renders; one that doesn't apply is dimmed with a reason.
// On a phone the organize and view buttons move into ⋯.

export type LightboxToolbarProps = {
  position: string;
  filename: string;
  /** Where the photo comes from — set only in galleries gathered from everywhere */
  origin?: { value: MediaItemOrigin | null | undefined };
  /** While zoomed into the photo the bar steps back (dimmed, full again on hover) */
  zoomed: boolean;
  marks: Record<MarkKey, boolean>;
  tagMarksReady: boolean;
  onMark: (key: MarkKey) => void;
  onCollection: () => void;
  onTag: () => void;
  onArm: () => void;
  onCategory: () => void;
  armedTag: PaletteTag | null;
  onApplySlot: (tag: PaletteTag) => void;
  slotStateOf: (tagId: string) => SlotState;
  compare: ToolbarToggle;
  focal: ToolbarToggle;
  filmstrip: ToolbarToggle;
  info: ToolbarToggle;
  onShortcuts: () => void;
  copy: { unavailable: string | null; busy: boolean; onCopy: () => void };
  copyPicker?: ReactNode;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
  onClose: () => void;
  /** Which of the bar's own menus is open — the viewer leaves the keyboard to it */
  openMenu: "more" | "slots" | null;
  onOpenMenuChange: (menu: "more" | "slots" | null) => void;
};

function Divider({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("mx-1 h-5 w-px shrink-0 bg-white/15", className)} />;
}

export function LightboxToolbar(props: LightboxToolbarProps) {
  const { compare, focal, filmstrip, info, openMenu, onOpenMenuChange } = props;
  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="toolbar"
        aria-label="Photo tools"
        className={cn(
          "grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] items-center gap-2 border-b border-white/5 px-3 py-1.5 transition-opacity duration-200 sm:px-4",
          props.zoomed && "opacity-40 focus-within:opacity-100 hover:opacity-100",
        )}
      >
        {/* Left — where you are */}
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-sm text-white/70 tabular-nums">{props.position}</span>
          {props.origin && (
            <span className="flex min-w-0 shrink self-center">
              <LightboxOriginLink origin={props.origin.value} />
            </span>
          )}
          {/* The file name gives way first — the way back to the set matters more */}
          <span className="hidden min-w-0 shrink-[10] truncate text-xs text-white/50 md:block" title={props.filename}>
            {props.filename}
          </span>
        </div>

        {/* Centre — the work on this photo */}
        <div className="flex items-center justify-center">
          <LightboxMarkLadder marks={props.marks} tagMarksReady={props.tagMarksReady} onMark={props.onMark} />
          <Divider className="mx-2 hidden sm:block" />
          <div role="group" aria-label="Organize" className="hidden items-center gap-1 sm:flex">
            <LightboxToolbarButton label="Add to collection" shortcut="collection" onClick={props.onCollection} className="bg-white/10">
              <FolderPlus size={16} />
            </LightboxToolbarButton>
            <LightboxTagPill
              armedTag={props.armedTag}
              onOpenTags={props.onTag}
              onArmRequest={() => {
                onOpenMenuChange(null);
                props.onArm();
              }}
              onApplySlot={props.onApplySlot}
              slotStateOf={props.slotStateOf}
              slotsOpen={openMenu === "slots"}
              onSlotsOpenChange={(open) => onOpenMenuChange(open ? "slots" : null)}
            />
            <LightboxToolbarButton label="Assign to a detail category" shortcut="category" onClick={props.onCategory} className="bg-white/10">
              <ImagePlus size={16} />
            </LightboxToolbarButton>
            <LightboxToolbarButton
              label="Compare tray"
              shortcut="compare"
              pressed={compare.on}
              onClick={compare.toggle}
              className="bg-white/10"
            >
              <Columns2 size={16} />
            </LightboxToolbarButton>
          </div>
        </div>

        {/* Right — how you look at it, then more and close */}
        <div className="flex items-center justify-end gap-1">
          <div role="group" aria-label="View" className="hidden items-center gap-1 sm:flex">
            <LightboxToolbarButton
              label="Focal point overlay"
              shortcut="focal"
              pressed={focal.on}
              unavailable={focal.unavailable}
              onClick={focal.toggle}
              className="bg-white/10"
            >
              <Crosshair size={16} />
            </LightboxToolbarButton>
            <LightboxToolbarButton
              label="Filmstrip"
              shortcut="filmstrip"
              pressed={filmstrip.on}
              unavailable={filmstrip.unavailable}
              onClick={filmstrip.toggle}
              className="bg-white/10"
            >
              <Rows3 size={16} />
            </LightboxToolbarButton>
            <LightboxToolbarButton label="Info panel" shortcut="info" pressed={info.on} onClick={info.toggle} className="bg-white/10">
              {info.on ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </LightboxToolbarButton>
            <Divider />
            <LightboxToolbarButton label="Keyboard shortcuts" shortcut="help" onClick={props.onShortcuts} className="bg-white/10">
              <HelpCircle size={16} />
            </LightboxToolbarButton>
          </div>
          <LightboxMoreMenu
            open={openMenu === "more"}
            onOpenChange={(open) => onOpenMenuChange(open ? "more" : null)}
            copy={props.copy}
            copyPicker={props.copyPicker}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
            organize={{ onCollection: props.onCollection, onTag: props.onTag, onArm: props.onArm, onCategory: props.onCategory, compare }}
            view={{ focal, filmstrip, info }}
          />
          <Divider className="mx-1.5" />
          <LightboxToolbarButton label="Close" shortcut="close" onClick={props.onClose} className="bg-white/10">
            <X size={16} />
          </LightboxToolbarButton>
        </div>
      </div>
    </TooltipProvider>
  );
}
