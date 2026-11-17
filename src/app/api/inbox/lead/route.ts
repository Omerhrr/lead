import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Lead operations from the inbox: notes, suppress (mirrors their suppress list
// + erased-leads GDPR semantics).
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const leadId = String(body?.leadId ?? "")
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { campaign: { include: { project: true } } },
  })
  if (!lead || lead.campaign.project.userId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  if (typeof body.notes === "string") {
    await db.lead.update({ where: { id: leadId }, data: { notes: body.notes } })
  }

  if (body.suppress) {
    await db.suppressEntry.upsert({
      where: {
        userId_type_value: { userId: user.id, type: "person", value: lead.email },
      },
      update: {},
      create: { userId: user.id, type: "person", value: lead.email },
    })
    await db.suppressEntry.upsert({
      where: {
        userId_type_value: { userId: user.id, type: "domain", value: lead.companyDomain },
      },
      update: {},
      create: { userId: user.id, type: "domain", value: lead.companyDomain },
    })
    await db.lead.update({
      where: { id: leadId },
      data: { status: "suppressed", convStatus: "unsubscribed" },
    })
  }

  return Response.json({ ok: true })
}
