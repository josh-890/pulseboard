"use client";

import type { ReactNode } from "react";
import {
  Columns2,
  Copy,
  Crosshair,
  FolderPlus,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Paintbrush,
  PanelRight,
  Pencil,
  Rows3,
  Tag,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { shortcutLabel } from "./lightbox-shortcuts";

// The viewer's ⋯ menu (2026-10-17): the rarer actions on the file, with Delete
// last, in red, behind a divider — never beside Close. On a phone the organize
// and view buttons live here too, so the bar fits the screen.

export type ToolbarToggle = { on: boolean; toggle: () => void; unavailable?: string | null };

export type LightboxMoreMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  copy: { unavailable: string | null; busy: boolean; onCopy: () => void };
  /** The participant picker for a copy with several targets — anchored under ⋯ */
  copyPicker?: ReactNode;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
  /** Phone only: the toolbar's organize and view buttons */
  organize: { onCollection: () => void; onTag: () => void; onArm: () => void; onCategory: () => void; compare: ToolbarToggle };
  view: { focal: ToolbarToggle; filmstrip: ToolbarToggle; info: ToolbarToggle };
};

const PHONE_ONLY = "sm:hidden";

function Reason({ children }: { children: ReactNode }) {
  return <span className="block text-[10px] text-muted-foreground">{children}</span>;
}

export function LightboxMoreMenu({ open, onOpenChange, copy, copyPicker, onEdit, onDelete, organize, view }: LightboxMoreMenuProps) {
  return (
    <div className="relative">
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More photo actions"
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  open && "bg-white/25 text-white",
                )}
              >
                {copy.busy ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6} className="dark">
            More — copy, edit, delete
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="dark z-[120] w-64"
          // Esc closes the menu only — it must not travel on and close the viewer
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <DropdownMenuLabel className={cn(PHONE_ONLY, "text-xs text-muted-foreground")}>Organize</DropdownMenuLabel>
          <DropdownMenuItem className={PHONE_ONLY} onSelect={organize.onCollection}>
            <FolderPlus /> Add to collection <DropdownMenuShortcut>{shortcutLabel("collection")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className={PHONE_ONLY} onSelect={organize.onTag}>
            <Tag /> Tag this photo <DropdownMenuShortcut>{shortcutLabel("tag")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className={PHONE_ONLY} onSelect={organize.onArm}>
            <Paintbrush /> Arm a tag to paint <DropdownMenuShortcut>{shortcutLabel("arm")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem className={PHONE_ONLY} onSelect={organize.onCategory}>
            <ImagePlus /> Assign to detail category <DropdownMenuShortcut>{shortcutLabel("category")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem className={PHONE_ONLY} checked={organize.compare.on} onCheckedChange={organize.compare.toggle}>
            <Columns2 /> Compare tray <DropdownMenuShortcut>{shortcutLabel("compare")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuLabel className={cn(PHONE_ONLY, "text-xs text-muted-foreground")}>View</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            className={PHONE_ONLY}
            checked={view.focal.on}
            disabled={!!view.focal.unavailable}
            onCheckedChange={view.focal.toggle}
          >
            <Crosshair /> Focal point <DropdownMenuShortcut>{shortcutLabel("focal")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            className={PHONE_ONLY}
            checked={view.filmstrip.on}
            disabled={!!view.filmstrip.unavailable}
            onCheckedChange={view.filmstrip.toggle}
          >
            <Rows3 /> Filmstrip <DropdownMenuShortcut>{shortcutLabel("filmstrip")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem className={PHONE_ONLY} checked={view.info.on} onCheckedChange={view.info.toggle}>
            <PanelRight /> Info panel <DropdownMenuShortcut>{shortcutLabel("info")}</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator className={PHONE_ONLY} />

          <DropdownMenuItem disabled={!!copy.unavailable || copy.busy} onSelect={copy.onCopy}>
            <Copy />
            <span className="flex-1">
              Copy to reference session…
              {copy.unavailable && <Reason>{copy.unavailable}</Reason>}
            </span>
            <DropdownMenuShortcut>{shortcutLabel("copy")}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!onEdit} onSelect={() => onEdit?.()}>
            <Pencil />
            <span className="flex-1">
              Edit / annotate
              {!onEdit && <Reason>Not available in this gallery</Reason>}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!onDelete} onSelect={() => onDelete?.()}>
            <Trash2 />
            <span className="flex-1">
              Delete…
              {!onDelete && <Reason>Not available in this gallery</Reason>}
            </span>
            <DropdownMenuShortcut>{shortcutLabel("delete")}</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {copyPicker}
    </div>
  );
}
