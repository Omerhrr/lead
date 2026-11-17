import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { providerStatus, deliverOutreach } from "@/lib/email-provider"

export const dynamic = "force-dynamic"

// Email delivery configuration + lifetime delivery counts for the user's campaigns.
export async function GET(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const campaigns = await db.campaign.findMany({
    where: { project: { userId: user.id } },
    select: { id: true },
  })
  const ids = campaigns.map((c) => c.id)
  const grouped = ids.length
    ? await db.message.groupBy({
        by: ["deliveryStatus"],
        where: { campaignId: { in: ids }, kind: "touch", channel: "email" },
        _count: { _all: true },
      })
    : []
  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.deliveryStatus] = g._count._all

  return Response.json({
    ...providerStatus(),
    counts: {
      simulated: counts.simulated ?? 0,
      delivered: counts.delivered ?? 0,
      failed: counts.failed ?? 0,
    },
  })
}

// Send a test email through the configured provider to verify credentials.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()

  const body = (await req.json().catch(() => ({}))) as { to?: string }
  const to = (body.to ?? "").trim()
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return Response.json({ error: "A valid recipient email is required" }, { status: 400 })
  }
  const st = providerStatus()
  if (!st.configured) {
    return Response.json(
      { error: "No provider configured — set RESEND_API_KEY or SMTP_HOST and restart" },
      { status: 400 }
    )
  }

  const result = await deliverOutreach({
    to,
    fromName: "AutoGTM",
    fromEmail: st.fromEmail ?? to,
    subject: "AutoGTM test email — delivery hook works",
    text: [
      "Hi,",
      "",
      `This is a test email from AutoGTM, delivered through the "${st.provider}" provider.`,
      "If you received it, your outbound delivery hook is configured correctly —",
      "first touches and follow-ups will go out through the same path.",
      "",
      "— AutoGTM",
    ].join("\n"),
  })

  return Response.json(result)
}
