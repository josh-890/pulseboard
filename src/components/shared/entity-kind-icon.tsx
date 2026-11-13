import {
  BookUser,
  Building2,
  Clapperboard,
  FolderKanban,
  ImageIcon,
  Library,
  Palette,
  Radio,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrailEntityType } from "@/lib/browse-trail";

/** One kind of detail page: the sidebar's icon, its colour and a singular name */
export const ENTITY_KIND: Record<TrailEntityType, { icon: LucideIcon; label: string; plural: string; tint: string }> = {
  person: { icon: Users, label: "Person", plural: "People", tint: "bg-entity-person/15 text-entity-person" },
  set: { icon: ImageIcon, label: "Set", plural: "Sets", tint: "bg-entity-set/15 text-entity-set" },
  session: { icon: Clapperboard, label: "Session", plural: "Sessions", tint: "bg-entity-session/15 text-entity-session" },
  channel: { icon: Radio, label: "Channel", plural: "Channels", tint: "bg-entity-channel/15 text-entity-channel" },
  label: { icon: Building2, label: "Label", plural: "Labels", tint: "bg-entity-label/15 text-entity-label" },
  artist: { icon: Palette, label: "Artist", plural: "Artists", tint: "bg-violet-500/15 text-violet-500" },
  project: { icon: FolderKanban, label: "Project", plural: "Projects", tint: "bg-entity-project/15 text-entity-project" },
  collection: { icon: Library, label: "Collection", plural: "Collections", tint: "bg-entity-collection/15 text-entity-collection" },
  contact: { icon: BookUser, label: "Contact", plural: "Contacts", tint: "bg-entity-person/10 text-entity-person/80" },
};

type EntityKindIconProps = {
  type: TrailEntityType;
  className?: string;
};

/** A small tinted square with the kind's icon, as in Recent and quick jump */
export function EntityKindIcon({ type, className }: EntityKindIconProps) {
  const { icon: Icon, tint } = ENTITY_KIND[type];
  return (
    <span className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", tint, className)} aria-hidden="true">
      <Icon size={14} />
    </span>
  );
}
