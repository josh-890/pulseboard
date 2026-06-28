"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import type { ConnectionsData } from "@/lib/services/relationship-service";

type EdgeKind = "personal" | "work" | "claimed";

type GraphNode = SimulationNodeDatum & {
  id: string;
  label: string;
  type: "self" | "person" | "ref";
  navId?: string; // person id for navigation
  edge: EdgeKind;
  roleLabel?: string;
  category?: string;
  weight: number; // for work edge width / ranking
};

type GraphLink = { source: string | GraphNode; target: string | GraphNode; edge: EdgeKind; weight: number };

const MAX_NODES = 70;
const CATEGORY_COLOR: Record<string, string> = {
  familial: "#f59e0b",
  personal: "#ec4899",
  professional: "#3b82f6",
  other: "#94a3b8",
};
const WORK_COLOR = "#64748b";
const CLAIMED_COLOR = "#475569";
const PERSON_FILL = "#8b5cf6";
const SELF_FILL = "#6366f1";

type Agg = {
  id: string;
  label: string;
  type: "person" | "ref";
  navId?: string;
  personal?: { roleLabel: string; category: string };
  sharedSets: number;
  claimed: boolean;
};

function keyFor(kind: "person" | "ref", id: string) {
  return `${kind === "person" ? "p" : "r"}:${id}`;
}

export function ConnectionsGraph({
  data,
  personName,
}: {
  data: ConnectionsData;
  personName: string;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const { nodes, links, viewBox, truncated } = useMemo(() => {
    // Aggregate every counterpart into a single node.
    const byKey = new Map<string, Agg>();
    const ensure = (kind: "person" | "ref", id: string, name: string, navId?: string): Agg => {
      const k = keyFor(kind, id);
      let a = byKey.get(k);
      if (!a) {
        a = { id: k, label: name, type: kind, navId, sharedSets: 0, claimed: false };
        byKey.set(k, a);
      }
      return a;
    };

    for (const r of data.personal) {
      const c = r.counterpart;
      const a = ensure(c.kind, c.id, c.name, c.kind === "person" ? c.id : undefined);
      a.personal = { roleLabel: r.roleLabel, category: r.category };
    }
    for (const w of data.workHeld) {
      const a = ensure("person", w.personId, w.commonAlias ?? w.icgId, w.personId);
      a.sharedSets = Math.max(a.sharedSets, w.sharedSetCount);
    }
    for (const cl of data.claimed) {
      const c = cl.counterpart;
      const a = ensure(c.kind, c.id, c.name, c.kind === "person" ? c.id : undefined);
      a.claimed = true;
    }

    // Rank: personal first, then by shared sets, then claimed-only.
    const ranked = [...byKey.values()].sort((a, b) => {
      const pa = a.personal ? 1 : 0;
      const pb = b.personal ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (a.sharedSets !== b.sharedSets) return b.sharedSets - a.sharedSets;
      return 0;
    });
    const truncated = Math.max(0, ranked.length - MAX_NODES);
    const kept = ranked.slice(0, MAX_NODES);

    const self: GraphNode = { id: "self", label: personName, type: "self", edge: "personal", weight: 0, fx: 0, fy: 0 };
    const nodes: GraphNode[] = [self];
    const links: GraphLink[] = [];

    for (const a of kept) {
      const edge: EdgeKind = a.personal ? "personal" : a.sharedSets > 0 ? "work" : "claimed";
      nodes.push({
        id: a.id,
        label: a.label,
        type: a.type,
        navId: a.navId,
        edge,
        roleLabel: a.personal?.roleLabel,
        category: a.personal?.category,
        weight: a.sharedSets,
      });
      links.push({ source: "self", target: a.id, edge, weight: a.sharedSets });
    }

    const sim = forceSimulation(nodes)
      .force("charge", forceManyBody().strength(-200))
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.edge === "personal" ? 70 : l.edge === "work" ? 95 : 120))
          .strength(0.5),
      )
      .force("collide", forceCollide(24))
      .force("x", forceX(0).strength(0.06))
      .force("y", forceY(0).strength(0.06))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();

    // Fit viewBox to node bounds.
    let minX = -60, maxX = 60, minY = -40, maxY = 40;
    for (const n of nodes) {
      minX = Math.min(minX, (n.x ?? 0) - 40);
      maxX = Math.max(maxX, (n.x ?? 0) + 40);
      minY = Math.min(minY, (n.y ?? 0) - 28);
      maxY = Math.max(maxY, (n.y ?? 0) + 28);
    }
    const viewBox = `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
    return { nodes, links, viewBox, truncated };
  }, [data, personName]);

  function edgeColor(n: GraphNode): string {
    if (n.edge === "personal") return CATEGORY_COLOR[n.category ?? "other"] ?? CATEGORY_COLOR.other;
    if (n.edge === "work") return WORK_COLOR;
    return CLAIMED_COLOR;
  }

  function handleClick(n: GraphNode) {
    if (n.type === "person" && n.navId) router.push(`/people/${n.navId}`);
    else if (n.type === "ref") router.push("/people/contacts");
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

  return (
    <div className="rounded-2xl border border-white/15 bg-card/40 p-2">
      <svg viewBox={viewBox} className="h-[480px] w-full" role="img" aria-label="Connections graph">
        {/* edges */}
        {links.map((l, i) => {
          const t = typeof l.target === "string" ? nodeById.get(l.target) : l.target;
          if (!t) return null;
          const color = edgeColor(t);
          const width = t.edge === "work" ? Math.min(1 + t.weight * 0.4, 4) : 1;
          const dim = hovered && hovered !== t.id;
          return (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={t.x ?? 0}
              y2={t.y ?? 0}
              stroke={color}
              strokeWidth={width}
              strokeDasharray={t.edge === "claimed" ? "3 3" : undefined}
              opacity={dim ? 0.12 : 0.5}
            />
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const isSelf = n.type === "self";
          const r = isSelf ? 14 : 9;
          const fill = isSelf ? SELF_FILL : n.type === "ref" ? "transparent" : PERSON_FILL;
          const dim = hovered && hovered !== n.id && !isSelf;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0}, ${n.y ?? 0})`}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => handleClick(n)}
              style={{ cursor: isSelf ? "default" : "pointer" }}
              opacity={dim ? 0.45 : 1}
            >
              <title>
                {n.label}
                {n.roleLabel ? ` · ${n.roleLabel}` : n.edge === "work" ? ` · ${n.weight} shared sets` : n.edge === "claimed" ? " · claimed" : ""}
              </title>
              <circle
                r={r}
                fill={fill}
                stroke={n.type === "ref" ? "#94a3b8" : edgeColor(n)}
                strokeWidth={n.type === "ref" ? 1.5 : 2}
                strokeDasharray={n.type === "ref" ? "3 2" : undefined}
              />
              <text
                y={r + 9}
                textAnchor="middle"
                fontSize={isSelf ? 9 : 7}
                fill="currentColor"
                className="pointer-events-none select-none fill-foreground"
              >
                {n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 pb-1 pt-2 text-[10px] text-muted-foreground">
        <Legend color={CATEGORY_COLOR.familial} label="Familial" />
        <Legend color={CATEGORY_COLOR.personal} label="Personal" />
        <Legend color={CATEGORY_COLOR.professional} label="Professional" />
        <Legend color={WORK_COLOR} label="Work (held)" />
        <Legend color={CLAIMED_COLOR} label="Claimed" dashed />
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-400" /> Contact
        </span>
        {truncated > 0 && <span className="ml-auto">+{truncated} more (see Lists)</span>}
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-0 w-4 border-t-2"
        style={{ borderColor: color, borderStyle: dashed ? "dashed" : "solid" }}
      />
      {label}
    </span>
  );
}
