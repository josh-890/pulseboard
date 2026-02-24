"use client";

import { useRouter, useSearchParams } from "next/navigation";

type LabelFilterProps = {
  labels: { id: string; name: string }[];
};

export function LabelFilter({ labels }: LabelFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentLabelId = searchParams.get("labelId") ?? "";

  function handleChange(labelId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (labelId) {
      params.set("labelId", labelId);
    } else {
      params.delete("labelId");
    }
    router.replace(`/channels?${params.toString()}`);
  }

  return (
    <select
      value={currentLabelId}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Filter by label"
      className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <option value="">All labels</option>
      {labels.map((label) => (
        <option key={label.id} value={label.id}>
          {label.name}
        </option>
      ))}
    </select>
  );
}
