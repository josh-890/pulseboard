"use client";

import { createContext, useContext } from "react";
import type { TagExampleThumb } from "@/lib/tag-example";

// What a tag's card needs from the workbench around it (ADR-0042, S4): the photo
// on screen (to make it an example), the tile shape of a tag, and a way to tell
// the workbench a tag's tile image changed.

export type ComposerCardPhoto = { id: string; viewUrl: string | null; width: number; height: number; filename: string };

export type ComposerCardContextValue = {
  photo: ComposerCardPhoto | null;
  tileAspectOf: (tagId: string) => string;
  onTitleChanged: (tagId: string, example: TagExampleThumb | null) => void;
};

export const ComposerCardContext = createContext<ComposerCardContextValue | null>(null);

export function useComposerCard(): ComposerCardContextValue | null {
  return useContext(ComposerCardContext);
}
