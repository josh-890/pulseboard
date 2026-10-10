"use client";

import Link from "next/link";
import { CornerDownRight, FolderInput, GitMerge, MoreHorizontal, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TagRowMenuProps = {
  tagId: string;
  tagName: string;
  /** Controlled, so a right-click on the row can open it too */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
  onMove: () => void;
  onParent: () => void;
  onMerge: () => void;
  onDelete: () => void;
};

// Every action on one tag, always visible (never hover-only): the ⋯ button, a
// right-click on the row, or F2 / Del on a focused row.
export function TagRowMenu({ tagId, tagName, open, onOpenChange, onRename, onMove, onParent, onMerge, onDelete }: TagRowMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Actions for ${tagName}`}
        >
          <MoreHorizontal size={14} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil size={13} /> Rename <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/tags/${tagId}?edit=1`}>
            <SlidersHorizontal size={13} /> Edit details…
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMove}>
          <FolderInput size={13} /> Move to group…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onParent}>
          <CornerDownRight size={13} /> Sub-tag of…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onMerge}>
          <GitMerge size={13} /> Merge into…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 size={13} /> Delete… <DropdownMenuShortcut>Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
