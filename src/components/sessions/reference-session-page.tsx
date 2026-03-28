"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { ImageIcon, BookOpen, Plus, Upload } from "lucide-react";
import { cn, getInitialsFromName } from "@/lib/utils";
import { MediaManager } from "@/components/media/media-manager";
import { BatchUploadZone } from "@/components/media/batch-upload-zone";
import type { MediaItemWithLinks } from "@/lib/services/media-service";
import type { ProfileImageLabel } from "@/lib/services/setting-service";
import type { CollectionSummary } from "@/lib/services/collection-service";
import type { CategoryWithGroup } from "@/components/gallery/gallery-info-panel";

type EntityOption = { id: string; name: string };
type PersonaOption = { id: string; label: string; date: string | null };
type SkillEventOption = { id: string; skillName: string; eventType: string; date: string | null };

type TabId = "media" | "biographies";

type ReferenceSessionPageProps = {
  personId: string;
  personName: string;
  personThumbUrl: string | null;
  sessionId: string;
  mediaCount: number;
  items: MediaItemWithLinks[];
  slotLabels: ProfileImageLabel[];
  collections: CollectionSummary[];
  categories: CategoryWithGroup[];
  bodyMarks: EntityOption[];
  bodyModifications: EntityOption[];
  cosmeticProcedures: EntityOption[];
  personas: PersonaOption[];
  skillEvents: SkillEventOption[];
  filledHeadshotSlots: number[];
  initialTab?: string;
};

export function ReferenceSessionPage({
  personId,
  personName,
  personThumbUrl,
  sessionId,
  mediaCount,
  items,
  slotLabels,
  collections,
  categories,
  bodyMarks,
  bodyModifications,
  cosmeticProcedures,
  personas,
  skillEvents,
  filledHeadshotSlots,
  initialTab,
}: ReferenceSessionPageProps) {
  const [activeTab, setActiveTabRaw] = useState<TabId>(
    initialTab === "biographies" ? "biographies" : "media",
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const addFilesRef = useRef<((files: FileList | File[]) => void) | null>(null);
  const mediaPanelRef = useRef<HTMLDivElement>(null);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabRaw(tab);
    const url = new URL(window.location.href);
    if (tab === "media") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", url.toString());
  }, []);

  // Drag-anywhere overlay: listen on the media panel for file drags
  useEffect(() => {
    const el = mediaPanelRef.current;
    if (!el) return;

    function handleDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.types.includes("Files")) {
        setIsDragOver(true);
      }
    }

    function handleDragOver(e: DragEvent) {
      e.preventDefault();
    }

    function handleDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDragOver(false);
      }
    }

    function handleDrop(e: DragEvent) {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer?.files.length) {
        addFilesRef.current?.(e.dataTransfer.files);
      }
    }

    el.addEventListener("dragenter", handleDragEnter);
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);

    return () => {
      el.removeEventListener("dragenter", handleDragEnter);
      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);
    };
  }, [activeTab]);

  const initials = getInitialsFromName(personName);

  const tabs: { id: TabId; label: string; badge?: number; icon: React.ReactNode }[] = [
    { id: "media", label: "Media", badge: mediaCount, icon: <ImageIcon size={14} /> },
    { id: "biographies", label: "Biographies", icon: <BookOpen size={14} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Context strip */}
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-card/50 px-5 py-3 backdrop-blur-sm">
        <Link
          href={`/people/${personId}`}
          className="inline-flex shrink-0 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Back to ${personName}`}
        >
          <span aria-hidden="true">&larr;</span>
        </Link>

        {/* Avatar */}
        <Link href={`/people/${personId}`} className="shrink-0">
          {personThumbUrl ? (
            <img
              src={personThumbUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-white/15"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-entity-person/15 text-entity-person text-xs font-medium">
              {initials}
            </div>
          )}
        </Link>

        {/* Person name */}
        <Link
          href={`/people/${personId}`}
          className="min-w-0 truncate text-sm font-medium text-foreground/80 transition-colors hover:text-entity-person"
        >
          {personName}
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Item count */}
        <span className="shrink-0 text-sm text-muted-foreground">
          {mediaCount} {mediaCount === 1 ? "item" : "items"}
        </span>

        {/* Upload button */}
        <button
          type="button"
          onClick={() => {
            // Ensure media tab is active, then trigger file picker
            if (activeTab !== "media") setActiveTab("media");
            // Small delay to let the BatchUploadZone mount if switching tabs
            setTimeout(() => {
              const input = document.querySelector<HTMLInputElement>(
                'input[type="file"][accept*="image"]',
              );
              input?.click();
            }, activeTab !== "media" ? 100 : 0);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-card/60 text-muted-foreground transition-all hover:border-entity-person/30 hover:bg-entity-person/10 hover:text-entity-person focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Upload photos"
          title="Upload photos"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 overflow-x-auto rounded-xl border border-white/15 bg-card/50 p-1 scrollbar-none"
        role="tablist"
        aria-label="Reference sections"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/60 text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        id="tabpanel-media"
        role="tabpanel"
        aria-labelledby="tab-media"
        hidden={activeTab !== "media"}
        ref={mediaPanelRef}
        className="relative"
      >
        {activeTab === "media" && (
          <>
            <MediaManager
              items={items}
              personId={personId}
              sessionId={sessionId}
              slotLabels={slotLabels}
              collections={collections}
              categories={categories}
              bodyMarks={bodyMarks}
              bodyModifications={bodyModifications}
              cosmeticProcedures={cosmeticProcedures}
              personas={personas}
              skillEvents={skillEvents}
              anchor="reference"
            />
            {/* Headless upload engine — no visible dropzone */}
            <BatchUploadZone
              sessionId={sessionId}
              personId={personId}
              filledHeadshotSlots={filledHeadshotSlots}
              totalHeadshotSlots={slotLabels.length || 5}
              hideDropzone
              addFilesRef={addFilesRef}
            />

            {/* Drag-anywhere overlay */}
            {isDragOver && (
              <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-entity-person/50 bg-entity-person/5 backdrop-blur-[2px] transition-all">
                <div className="flex flex-col items-center gap-2">
                  <Upload size={28} className="text-entity-person/60" />
                  <p className="text-sm font-medium text-entity-person/80">
                    Drop to upload
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div
        id="tabpanel-biographies"
        role="tabpanel"
        aria-labelledby="tab-biographies"
        hidden={activeTab !== "biographies"}
      >
        {activeTab === "biographies" && (
          <div className="rounded-2xl border border-white/20 bg-card/70 p-8 shadow-md backdrop-blur-sm">
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <BookOpen size={24} className="text-muted-foreground/30" />
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground/50">No biographies added yet</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
