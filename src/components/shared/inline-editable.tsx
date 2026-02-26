"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type InlineEditableProps = {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  type?: "text" | "textarea";
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  children: React.ReactNode;
};

export function InlineEditable({
  value,
  onSave,
  type = "text",
  placeholder = "Click to edit…",
  className,
  inputClassName,
  children,
}: InlineEditableProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      // Place cursor at end
      const len = editValue.length;
      inputRef.current.setSelectionRange(len, len);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on edit mode change, not on every keystroke
  }, [isEditing]);

  // Sync external value changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  const handleSave = useCallback(async () => {
    const trimmed = editValue.trim();
    if (trimmed === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await onSave(trimmed);
      setIsEditing(false);
    } catch {
      // Keep editing on error
    } finally {
      setIsSaving(false);
    }
  }, [editValue, value, onSave]);

  const handleCancel = useCallback(() => {
    setEditValue(value);
    setIsEditing(false);
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
      if (type === "text" && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (type === "textarea" && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    },
    [type, handleSave, handleCancel],
  );

  if (isEditing) {
    const sharedProps = {
      value: editValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setEditValue(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: handleSave,
      disabled: isSaving,
      placeholder,
      className: cn(
        "w-full rounded-md border border-primary/30 bg-background px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary/50",
        isSaving && "opacity-60",
        inputClassName,
      ),
    };

    return (
      <div className={cn("relative", className)}>
        {type === "textarea" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            {...sharedProps}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            {...sharedProps}
          />
        )}
        {isSaving && (
          <Loader2
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
        {type === "textarea" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Cmd+Enter to save, Escape to cancel
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      className={cn(
        "group relative cursor-pointer rounded-md transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <Pencil
        size={12}
        className="absolute -right-1 -top-1 opacity-0 transition-opacity group-hover:opacity-60 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}
