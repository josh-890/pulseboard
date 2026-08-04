/**
 * Adding a participant to a StagingSet.
 *
 * Extracted from `addStagingSetParticipantAction` so the archive develop path
 * (plan slice 6) writes participants through exactly the same code rather than a
 * second implementation. A staging set carries four derived fields that must stay
 * in step — `participants`, `participantStatuses`, `participantIcgIds` and
 * `participantNamesNorm` — and having two places compute them is how they drift.
 */
import { prisma } from '@/lib/db'
import { normalizeForSearch } from '@/lib/normalize'

export type StagingParticipantInput = {
  name: string
  icgId?: string
  personId?: string
}

export type AddParticipantResult = { added: boolean; reason?: 'not-found' | 'duplicate' }

export async function addStagingSetParticipant(
  stagingSetId: string,
  participant: StagingParticipantInput,
): Promise<AddParticipantResult> {
  const ss = await prisma.stagingSet.findUnique({
    where: { id: stagingSetId },
    select: { participants: true, participantStatuses: true },
  })
  if (!ss) return { added: false, reason: 'not-found' }

  const participants = (ss.participants as { name: string; icgId: string }[]) ?? []
  const statuses =
    (ss.participantStatuses as { name: string; icgId?: string; status?: string; personId?: string }[]) ?? []
  const icg = participant.icgId ?? ''

  const dup = participant.personId
    ? statuses.some((p) => p.personId === participant.personId)
    : participants.some((p) => p.name === participant.name && (p.icgId ?? '') === icg)
  if (dup) return { added: false, reason: 'duplicate' }

  const newParticipants = [...participants, { name: participant.name, icgId: icg }]
  const newStatuses = [
    ...statuses,
    {
      name: participant.name,
      icgId: icg,
      status: participant.personId ? ('known' as const) : ('candidate' as const),
      ...(participant.personId ? { personId: participant.personId } : {}),
    },
  ]

  await prisma.stagingSet.update({
    where: { id: stagingSetId },
    data: {
      participants: newParticipants,
      participantStatuses: newStatuses,
      participantIcgIds: newParticipants.filter((p) => p.icgId).map((p) => p.icgId),
      participantNamesNorm: newParticipants.map((p) => normalizeForSearch(p.name)).join(' '),
    },
  })
  return { added: true }
}
