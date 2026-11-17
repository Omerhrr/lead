// Shared opt-out suppression logic (used by the public /api/unsubscribe/[token]
// route and by the engine's reply-based unsubscribe outcome).
import { db } from "@/lib/db"

export async function unsubscribeByToken(
  token: string
): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
  if (!token || !/^[a-f0-9]{32}$/.test(token)) return { ok: false, status: 404 }
  const lead = await db.lead.findUnique({
    where: { unsubToken: token },
    select: {
      id: true, email: true,
      campaign: { select: { project: { select: { userId: true } } } },
    },
  })
  if (!lead) return { ok: false, status: 404 }
  await suppressLeadOptOut(lead.id, lead.email, lead.campaign.project.userId)
  return { ok: true, email: lead.email }
}

// Opt-out suppression: lead flips to suppressed/unsubscribed (pending timers
// cleared) and the account-wide SuppressEntry is upserted so pool generation
// and future sends skip the address. Bounces/complaints use the webhook's own
// path (they don't mark the conversation unsubscribed).
export async function suppressLeadOptOut(
  leadId: string,
  email: string,
  userId: string
) {
  await db.lead.updateMany({
    where: { id: leadId, status: { not: "suppressed" } },
    data: { status: "suppressed", convStatus: "unsubscribed", replyDueAt: null, agentDueAt: null },
  })
  const value = email.toLowerCase()
  if (value) {
    await db.suppressEntry.upsert({
      where: { userId_type_value: { userId, type: "person", value } },
      create: { userId, type: "person", value, reason: "unsubscribe" },
      update: { reason: "unsubscribe" },
    })
  }
}
