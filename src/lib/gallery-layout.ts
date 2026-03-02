/**
 * Shared justified gallery layout algorithm.
 *
 * Items must expose `originalWidth` and `originalHeight` so the algorithm
 * can compute aspect ratios. The generic parameter lets every consumer
 * keep its own item type without mapping.
 */

export const GALLERY_GAP = 8;
export const TARGET_ROW_HEIGHT = 220;
export const MAX_ROW_HEIGHT = 280;
export const MIN_ROW_HEIGHT = 160;
export const MOBILE_TARGET = 160;

export type RowLayout<T> = {
  items: T[];
  height: number;
};

type Measurable = { originalWidth: number; originalHeight: number };

export function computeRows<T extends Measurable>(
  items: T[],
  containerWidth: number,
  targetHeight: number,
): RowLayout<T>[] {
  if (containerWidth <= 0 || items.length === 0) return [];

  const rows: RowLayout<T>[] = [];
  let currentRow: T[] = [];
  let currentRatioSum = 0;

  for (const item of items) {
    const aspect = item.originalWidth / (item.originalHeight || 1);
    currentRow.push(item);
    currentRatioSum += aspect;

    const availableWidth = containerWidth - GALLERY_GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;

    if (rowHeight <= targetHeight) {
      const clampedHeight = Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, rowHeight));
      rows.push({ items: currentRow, height: clampedHeight });
      currentRow = [];
      currentRatioSum = 0;
    }
  }

  // Last incomplete row — cap at target to avoid stretching
  if (currentRow.length > 0) {
    const availableWidth = containerWidth - GALLERY_GAP * (currentRow.length - 1);
    const rowHeight = availableWidth / currentRatioSum;
    const clampedHeight = Math.min(targetHeight, Math.max(MIN_ROW_HEIGHT, rowHeight));
    rows.push({ items: currentRow, height: clampedHeight });
  }

  return rows;
}
