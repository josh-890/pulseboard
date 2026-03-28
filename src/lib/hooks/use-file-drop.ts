import { useCallback, useRef, useState } from "react";

/**
 * Hook for adding file drop-zone behavior to any element.
 * Returns a ref to attach to the drop target + isDragOver state.
 */
export function useFileDrop(onDrop?: (files: FileList) => void) {
  const [isDragOver, setIsDragOver] = useState(false);
  const counterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!onDrop) return;
      e.preventDefault();
      e.stopPropagation();
      counterRef.current++;
      if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
    },
    [onDrop],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onDrop) return;
      e.preventDefault();
      e.stopPropagation();
    },
    [onDrop],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!onDrop) return;
      e.preventDefault();
      e.stopPropagation();
      counterRef.current--;
      if (counterRef.current <= 0) {
        counterRef.current = 0;
        setIsDragOver(false);
      }
    },
    [onDrop],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onDrop) return;
      e.preventDefault();
      e.stopPropagation();
      counterRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files);
    },
    [onDrop],
  );

  const dropProps = onDrop
    ? {
        onDragEnter: handleDragEnter,
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
      }
    : {};

  return { isDragOver, dropProps };
}
