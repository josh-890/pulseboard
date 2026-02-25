import { PrismaClient } from "@/generated/prisma/client";

const softDeleteOverrides = {
  async findMany({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async findFirst({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async findUnique({ args, query }: { args: { where: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
  async count({ args, query }: { args: { where?: Record<string, unknown> }; query: (args: unknown) => Promise<unknown> }) {
    args.where = { ...args.where, deletedAt: null };
    return query(args);
  },
};

export function withSoftDelete(prisma: PrismaClient) {
  return prisma.$extends({
    query: {
      person: softDeleteOverrides,
      personAlias: softDeleteOverrides,
      persona: softDeleteOverrides,
      personRelationship: softDeleteOverrides,
      bodyMark: softDeleteOverrides,
      bodyMarkEvent: softDeleteOverrides,
      personDigitalIdentity: softDeleteOverrides,
      personSkill: softDeleteOverrides,
      network: softDeleteOverrides,
      label: softDeleteOverrides,
      channel: softDeleteOverrides,
      project: softDeleteOverrides,
      session: softDeleteOverrides,
      set: softDeleteOverrides,
      setContribution: softDeleteOverrides,
      activity: softDeleteOverrides,
      photo: softDeleteOverrides,
      bodyModification: softDeleteOverrides,
      bodyModificationEvent: softDeleteOverrides,
      cosmeticProcedure: softDeleteOverrides,
      cosmeticProcedureEvent: softDeleteOverrides,
      personEducation: softDeleteOverrides,
      personAward: softDeleteOverrides,
      personInterest: softDeleteOverrides,
      relationshipEvent: softDeleteOverrides,
      mediaItem: softDeleteOverrides,
      setCreditRaw: softDeleteOverrides,
      personMediaLink: softDeleteOverrides,
      // Setting, LabelNetwork, ProjectLabel, PersonaPhysical, SetMediaItem, SessionParticipant,
      // SetParticipant, ChannelLabelMap, SetLabelEvidence intentionally excluded — no deletedAt field
    },
  });
}
