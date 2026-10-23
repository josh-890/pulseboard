import {
  actValue,
  effectiveExtras,
  explainActValue,
  sessionIntensity,
  type ActExtraOverride,
} from "@/lib/intensity";
import type { SessionIntensity } from "@/lib/services/intensity-service";
import type { SessionIntensityCatalog } from "./types";

// The intensity panel's state (ADR-0036): per contribution its extras and its
// acts. Changes apply optimistically and are saved behind them; the same
// reducer mirrors what the server does, so the screen and the store agree.

export type PanelAct = { id: string | null; actId: string; notes: string | null; overrides: ActExtraOverride[]; mediaIds: string[] };
export type PersonState = { extraIds: string[]; acts: PanelAct[] };
export type PanelState = Record<string, PersonState>;

export type RestoreItem = { contributionId: string; actId: string; notes: string | null; overrides: ActExtraOverride[]; mediaIds: string[] };

export type PanelChange =
  | { kind: "extras"; entries: { contributionId: string; extraIds: string[] }[] }
  | { kind: "tick"; contributionIds: string[]; actId: string; ticked: boolean }
  | { kind: "actExtras"; contributionId: string; actId: string; overrides: ActExtraOverride[] }
  | { kind: "note"; contributionId: string; actId: string; notes: string | null }
  | { kind: "evidence"; contributionId: string; actId: string; mediaIds: string[] }
  | { kind: "restore"; items: RestoreItem[] }
  | { kind: "copy"; fromId: string; toId: string };

export function initialPanelState(contributions: SessionIntensity): PanelState {
  return Object.fromEntries(
    contributions.map((c) => [c.id, { extraIds: c.extraIds, acts: c.acts.map((a) => ({ ...a })) }]),
  );
}

function withPerson(state: PanelState, id: string, fn: (p: PersonState) => PersonState): PanelState {
  const p = state[id];
  return p ? { ...state, [id]: fn(p) } : state;
}

export function reducePanel(state: PanelState, change: PanelChange): PanelState {
  switch (change.kind) {
    case "extras":
      return change.entries.reduce((s, e) => withPerson(s, e.contributionId, (p) => ({ ...p, extraIds: e.extraIds })), state);
    case "tick":
      return change.contributionIds.reduce(
        (s, id) =>
          withPerson(s, id, (p) => {
            const has = p.acts.some((a) => a.actId === change.actId);
            if (change.ticked) return has ? p : { ...p, acts: [...p.acts, { id: null, actId: change.actId, notes: null, overrides: [], mediaIds: [] }] };
            return { ...p, acts: p.acts.filter((a) => a.actId !== change.actId) };
          }),
        state,
      );
    case "actExtras":
      return withPerson(state, change.contributionId, (p) => ({
        ...p,
        acts: p.acts.map((a) => (a.actId === change.actId ? { ...a, overrides: change.overrides } : a)),
      }));
    case "note":
      return withPerson(state, change.contributionId, (p) => ({
        ...p,
        acts: p.acts.map((a) => (a.actId === change.actId ? { ...a, notes: change.notes } : a)),
      }));
    case "evidence":
      return withPerson(state, change.contributionId, (p) => ({
        ...p,
        acts: p.acts.map((a) => (a.actId === change.actId ? { ...a, mediaIds: change.mediaIds } : a)),
      }));
    case "restore":
      return change.items.reduce(
        (s, it) =>
          withPerson(s, it.contributionId, (p) => ({
            ...p,
            acts: [
              ...p.acts.filter((a) => a.actId !== it.actId),
              { id: null, actId: it.actId, notes: it.notes, overrides: it.overrides, mediaIds: it.mediaIds },
            ],
          })),
        state,
      );
    case "copy": {
      const from = state[change.fromId];
      if (!from) return state;
      return withPerson(state, change.toId, (p) => {
        const has = new Set(p.acts.map((a) => a.actId));
        const added = from.acts
          .filter((a) => !has.has(a.actId))
          .map((a) => ({ id: null, actId: a.actId, notes: null, overrides: a.overrides, mediaIds: [] }));
        return { extraIds: from.extraIds, acts: [...p.acts, ...added] };
      });
    }
  }
}

export type ActInfo = { level: number; name: string };

/** One person's computed view: each ticked act with its extras, value and explanation; the session's value */
export function personView(p: PersonState, catalog: SessionIntensityCatalog, acts: Map<string, ActInfo>) {
  const byId = new Map(catalog.extras.map((e) => [e.id, e]));
  const inherited = p.extraIds.map((id) => byId.get(id)).filter((e) => e !== undefined);
  const ticked = new Map(
    p.acts.map((a) => {
      const info = acts.get(a.actId) ?? { level: 0, name: "?" };
      const effective = effectiveExtras(inherited, a.overrides, byId);
      return [
        a.actId,
        {
          ...a,
          effective: effective.map((e) => e.id),
          value: actValue(info.level, effective, catalog.max),
          explain: explainActValue(info.name, info.level, effective, catalog.max),
        },
      ] as const;
    }),
  );
  const values = [...ticked.values()];
  const total = sessionIntensity(
    values.map((t) => t.value),
    inherited,
    catalog.max,
  );
  const top = values.reduce<(typeof values)[number] | null>((best, t) => (best === null || t.value > best.value ? t : best), null);
  const maxExtra = inherited.find((e) => e.isMax);
  const totalExplain = maxExtra
    ? `${maxExtra.name} in this session → ${catalog.max}`
    : top
      ? `Highest act: ${top.explain}`
      : "No acts ticked";
  return { ticked, total, totalExplain };
}
