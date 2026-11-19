import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { parseLeadCsv } from "@/lib/csv"
import { verifyCampaignLeads } from "@/lib/verify-email"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

// CSV lead list import: POST { csv, commit?: true }. Without commit the body
// is parsed dry-run and returned as a preview (valid rows + per-row errors +
// duplicates already known to the workspace); with commit the rows become
// pool leads on the campaign (source "csv") and the pool is auto-verified.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const campaign = await db.campaign.findUnique({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!campaign || campaign.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }
  const body = await req.json().catch(() => null)
  const csv = String(body?.csv ?? "")
  const commit = !!body?.commit
  if (!csv.trim()) {
    return Response.json({ error: "Empty CSV - paste rows or pick a file" }, { status: 400 })
  }
  if (campaign.state === "sending") {
    return Response.json({ error: "Stop the campaign before importing leads" }, { status: 400 })
  }

  const parsed = parseLeadCsv(csv)
  if (parsed.rows.length === 0) {
    return Response.json({ error: "No valid rows found", errors: parsed.errors }, { status: 400 })
  }

  // duplicates + suppression checks against the workspace
  const existingLeads = await db.lead.findMany({
    where: { campaign: { project: { userId: user.id } } },
    select: { email: true },
  })
  const suppress = await db.suppressEntry.findMany({
    where: { userId: user.id, type: { in: ["person", "domain"] } },
    select: { type: true, value: true },
  })
  const suppressedEmails = new Set(suppress.filter((s) => s.type === "person").map((s) => s.value.toLowerCase()))
  const suppressedDomains = new Set(suppress.filter((s) => s.type === "domain").map((s) => s.value.toLowerCase()))
  const existingEmails = new Set(existingLeads.map((l) => l.email.toLowerCase()))

  const creatable: Array<{
    email: string
    name: string
    company: string
    title: string
    country: string
    linkedinUrl: string
  }> = []
  const skipped: Array<{ email: string; reason: string }> = []
  for (const row of parsed.rows) {
    if (existingEmails.has(row.email)) {
      skipped.push({ email: row.email, reason: "already in workspace" })
      continue
    }
    const domain = row.email.split("@")[1]
    if (suppressedEmails.has(row.email) || suppressedDomains.has(domain)) {
      skipped.push({ email: row.email, reason: "on suppression list" })
      continue
    }
    creatable.push(row)
  }

  if (!commit) {
    return Response.json({
      ok: true,
      preview: {
        headers: parsed.headers,
        totalRows: parsed.rows.length + parsed.errors.length,
        importable: creatable.length,
        duplicateInFile: parsed.errors.filter((e) => e.reason === "duplicate in file").length,
        malformed: parsed.errors.filter((e) => e.reason !== "duplicate in file"),
        skipped,
        sample: creatable.slice(0, 8),
      },
    })
  }

  if (creatable.length === 0) {
    return Response.json({ error: "Nothing to import - every row is a duplicate or suppressed" }, { status: 400 })
  }

  await db.lead.createMany({
    data: creatable.map((r) => ({
      campaignId: id,
      name: r.name,
      title: r.title || "Contact",
      company: r.company || r.email.split("@")[1],
      companyDomain: r.email.split("@")[1],
      industry: "csv import",
      companySize: "-",
      country: r.country || "-",
      email: r.email,
      linkedinUrl: r.linkedinUrl || null,
      score: 60,
      reasons: "Imported from your list",
      status: "pool",
      source: "csv",
    })),
  })
  const verification = await verifyCampaignLeads(id)
  await db.campaign.update({
    where: { id },
    data: {
      state: campaign.state === "draft" ? "pool_ready" : campaign.state,
      nextAction: `${creatable.length} imported lead${creatable.length === 1 ? "" : "s"} in the pool - review and approve`,
    },
  })
  await logAudit({
    ownerId: user.id,
    actorEmail: user.email,
    actorName: user.name ?? "",
    action: "campaign.imported",
    target: campaign.name,
    detail: `${creatable.length} lead${creatable.length === 1 ? "" : "s"} from CSV · ${skipped.length} skipped · ${parsed.errors.length} malformed`,
  })
  return Response.json({
    ok: true,
    imported: creatable.length,
    skipped,
    verification,
  })
}
