import { NextRequest } from "next/server"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { manualReply } from "@/lib/engine"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const leadId = String(body?.leadId ?? "")
  const text = String(body?.body ?? "").trim()
  if (!leadId || !text) {
    return Response.json({ error: "leadId and body are required" }, { status: 400 })
  }
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: { campaign: { include: { project: true } } },
  })
  if (!lead || lead.campaign.project.userId !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  const result = await manualReply(leadId, text)
  return Response.json(result)
}
