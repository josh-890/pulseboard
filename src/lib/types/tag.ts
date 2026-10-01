/** A tag as displayed on a chip/dot: name plus its group's colour. */
export type TagChipData = {
  id: string;
  name: string;
  group: { name: string; color: string };
};
