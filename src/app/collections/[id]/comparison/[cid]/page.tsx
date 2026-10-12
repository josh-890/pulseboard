import { redirect } from "next/navigation";

// A comparison opens in its collection's viewer (ADR-0015 amendment, 2026-10-12);
// this route only keeps old links working — they meant the editor, so compose mode.
export default async function ComparisonPage({ params }: { params: Promise<{ id: string; cid: string }> }) {
  const { id, cid } = await params;
  redirect(`/collections/${id}?c=${cid}&edit=1`);
}
