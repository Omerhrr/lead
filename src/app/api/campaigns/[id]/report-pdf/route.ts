import { NextRequest } from "next/server"
import PDFDocument from "pdfkit"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { campaignSpendUsd } from "@/lib/billing-ops"

export const dynamic = "force-dynamic"

// Campaign summary report as a one-page PDF (funnel, per-variant table,
// tracked links). Downloaded from the campaign header ("Export PDF").

const EMERALD = "#059669"
const INK = "#0f172a"
const MUTED = "#64748b"

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
    include: { project: true, variants: { orderBy: { label: "asc" } } },
  })
  if (!campaign || campaign.project.userId !== user.id) {
    return Response.json({ error: "Campaign not found" }, { status: 404 })
  }

  const [leads, touches, inbound, linkGroups, spendUsd] = await Promise.all([
    db.lead.findMany({ where: { campaignId: id } }),
    db.message.findMany({
      where: { campaignId: id, direction: "out", kind: "touch", channel: "email" },
      select: { opens: true, clicks: true, variantId: true, status: true },
    }),
    db.message.findMany({
      where: { campaignId: id, direction: "in" },
      select: { leadId: true },
    }),
    db.clickEvent.groupBy({
      by: ["url"],
      where: { campaignId: id },
      _count: { _all: true },
      orderBy: { _count: { url: "desc" } },
      take: 6,
    }),
    campaignSpendUsd(id),
  ])

  const approved = leads.filter((l) => l.status === "approved").length
  const bounced = touches.filter((m) => m.status === "bounced").length
  const opened = touches.filter((m) => m.opens > 0).length
  const clicked = touches.filter((m) => m.clicks > 0).length
  const inboundLeadIds = new Set(inbound.map((m) => m.leadId))
  const replied = leads.filter((l) => inboundLeadIds.has(l.id)).length
  const hot = leads.filter((l) => l.isHot).length
  const booked = leads.filter((l) => l.convStatus === "booked").length
  const warm = leads.filter((l) => l.isHot || l.convStatus === "booked").length
  const cplUsd = warm > 0 ? Math.round((spendUsd / warm) * 100) / 100 : null
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "-")

  // ------------------------------------------------------------ build PDF
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Jidout report - ${campaign.name}` } })
  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const rendered = new Promise<void>((res) => doc.on("end", () => res()))

  const W = doc.page.width - 96
  let y = 0

  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK)
    .text("Jidout campaign report", 48, 48)
  doc.font("Helvetica").fontSize(10).fillColor(MUTED)
    .text(`Generated ${new Date().toISOString().slice(0, 10)}`, 48, doc.y + 2)
  y = doc.y + 14

  doc.font("Helvetica-Bold").fontSize(14).fillColor(INK).text(campaign.name, 48, y)
  doc.font("Helvetica").fontSize(9).fillColor(MUTED)
    .text(
      `${campaign.project.companyName} · ${campaign.state} · target: ${campaign.targetRole || "-"} in ${campaign.targetGeography || "-"} (${campaign.targetCompanySize || "-"})`,
      48, doc.y + 2, { width: W }
    )
  y = doc.y + 18

  // funnel tiles - two rows of four plus a cost row
  const tiles: Array<[string, string]> = [
    ["Approved leads", String(approved)],
    ["Email touches", `${touches.length}${bounced > 0 ? ` (${bounced} bounced)` : ""}`],
    ["Open rate", pct(opened, touches.length)],
    ["Click rate", pct(clicked, touches.length)],
    ["Replies", String(replied)],
    ["Reply rate", pct(replied, approved || leads.length)],
    ["Hot leads", String(hot)],
    ["Booked", String(booked)],
    ["Campaign spend", `$${spendUsd.toFixed(2)}`],
    ["Cost per warm lead", cplUsd === null ? "-" : `$${cplUsd.toFixed(2)}`],
  ]
  const tileW = (W - 24) / 4
  const tileH = 44
  tiles.forEach(([k, v], i) => {
    const cx = 48 + (i % 4) * (tileW + 8)
    const cy = y + Math.floor(i / 4) * (tileH + 8)
    doc.roundedRect(cx, cy, tileW, tileH, 6).lineWidth(0.75).strokeColor("#d1d5db").stroke()
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(k.toUpperCase(), cx + 8, cy + 8)
    doc.font("Helvetica-Bold").fontSize(13).fillColor(EMERALD).text(v, cx + 8, cy + 22)
  })
  y += 2 * tileH + 26

  // per-variant table
  if (campaign.variants.length > 0) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Split-test arms", 48, y)
    y = doc.y + 6
    const cols: Array<[string, number, number]> = [
      ["Arm", 48, 60], ["Leads", 108, 50], ["Sent", 158, 50], ["Opens", 208, 60],
      ["Clicks", 268, 60], ["Replies", 328, 55], ["Reply %", 383, 60], ["Hot", 443, 40], ["Booked", 483, 55],
    ]
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED)
    for (const [label, x] of cols) doc.text(label, x, y)
    y += 12
    doc.moveTo(48, y - 3).lineTo(48 + W, y - 3).lineWidth(0.75).strokeColor("#e5e7eb").stroke()
    doc.font("Helvetica").fontSize(8.5).fillColor(INK)
    for (const v of campaign.variants) {
      const vLeads = leads.filter((l) => l.variantId === v.id)
      const vTouches = touches.filter((m) => m.variantId === v.id)
      const vOpen = vTouches.filter((m) => m.opens > 0).length
      const vClick = vTouches.filter((m) => m.clicks > 0).length
      const vReplied = vLeads.filter((l) => inboundLeadIds.has(l.id)).length
      const vSent = vLeads.filter((l) => l.touchCount > 0).length
      const row = [
        v.label, String(vLeads.length), String(vSent),
        pct(vOpen, vTouches.length), pct(vClick, vTouches.length), String(vReplied),
        pct(vReplied, vSent),
        String(vLeads.filter((l) => l.isHot).length),
        String(vLeads.filter((l) => l.convStatus === "booked").length),
      ]
      row.forEach((cell, i) => doc.text(cell, cols[i][1], y, { width: cols[i][2] }))
      y += 15
    }
    y += 10
  }

  // tracked links
  if (linkGroups.length > 0) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text("Tracked links", 48, y)
    y = doc.y + 6
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED)
    doc.text("URL", 48, y)
    doc.text("CLICKS", 400, y)
    y += 12
    doc.moveTo(48, y - 3).lineTo(48 + W, y - 3).lineWidth(0.75).strokeColor("#e5e7eb").stroke()
    doc.font("Helvetica").fontSize(8.5).fillColor(INK)
    for (const g of linkGroups) {
      doc.text(g.url.length > 82 ? `${g.url.slice(0, 82)}…` : g.url, 48, y, { width: 340, ellipsis: true })
      doc.text(String(g._count._all), 400, y)
      y += 14
    }
    y += 8
  }

  // next action + footer
  if (campaign.nextAction) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Next action", 48, y)
    doc.font("Helvetica").fontSize(9).fillColor(MUTED)
      .text(campaign.nextAction, 48, doc.y + 2, { width: W })
  }
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED)
    .text(
      "Jidout - AI outbound agent · opens measured by tracking pixel, clicks by tracked CTA links, bounces auto-suppressed",
      48, doc.page.height - 60, { width: W }
    )

  doc.end()
  await rendered

  return new Response(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="jidout-report-${slug(campaign.name)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
