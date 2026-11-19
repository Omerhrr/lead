import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Lead-level campaign report as CSV: every lead with its variant attribution,
// engagement counters (touches, opens, clicks), outcome and meeting info.
// Downloaded from the campaign header ("Export CSV").

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replaceAll("\"", "\"\"")}"` : s
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campaign"
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { project: true, variants: true },
  })
  if (!campaign || campaign.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }

  const [leads, messages] = await Promise.all([
    db.lead.findMany({
      where: { campaignId: id },
      orderBy: [{ status: "asc" }, { score: "desc" }],
    }),
    db.message.findMany({
      where: { campaignId: id, direction: "out", kind: { in: ["touch", "autopilot"] } },
      select: { leadId: true, opens: true, clicks: true, kind: true },
    }),
  ])

  const variantLabel = new Map(campaign.variants.map((v) => [v.id, v.label]))
  const openByLead = new Map<string, number>()
  const clickByLead = new Map<string, number>()
  for (const m of messages) {
    openByLead.set(m.leadId, (openByLead.get(m.leadId) ?? 0) + m.opens)
    clickByLead.set(m.leadId, (clickByLead.get(m.leadId) ?? 0) + m.clicks)
  }

  const header = [
    "Lead", "Title", "Company", "Company domain", "Email", "Country",
    "Company size", "Score", "Status", "Variant", "Conversation",
    "Touches", "Opens", "Clicks", "Replied", "Hot", "Booked",
    "Meeting at", "Sentiment", "Hook",
  ]
  const rows = leads.map((l) => {
    const inbound = l.convStatus !== null // lead spoke back
    return [
      l.name, l.title, l.company, l.companyDomain, l.email, l.country,
      l.companySize, l.score, l.status,
      l.variantId ? variantLabel.get(l.variantId) ?? "" : "",
      l.convStatus ?? (l.status === "pool" ? "pool" : ""),
      l.touchCount,
      openByLead.get(l.id) ?? 0,
      clickByLead.get(l.id) ?? 0,
      inbound ? "yes" : "no",
      l.isHot ? "yes" : "no",
      l.convStatus === "booked" ? "yes" : "no",
      l.meetingAt ? l.meetingAt.toISOString().slice(0, 10) : "",
      l.sentiment ?? "",
      l.reasons ?? "",
    ].map(csvCell).join(",")
  })

  const csv = [header.join(","), ...rows].join("\r\n")
  const filename = `jidout-report-${slug(campaign.name)}.csv`
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
