// Round-10 E2E verification: 30-language campaign copy (localized engine
// follow-ups + language persistence), calendar booking (autopilot negotiation
// creates confirmed Meetings with booking links + .ics download), the public
// v1 API (Bearer keys, read endpoints, 401s, rate limit), cost-per-warm-lead
// reporting (campaign-attributed spend in API, CSV, PDF) and per-result
// pricing (success fee charged exactly once per warm lead).
//
// Environment-independent. Re-runnable (cleans up scratch data).
// Run: bun scripts/verify_round10.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000"
const DEMO_EMAIL = "riley@brightpath.io"
let cookie = ""

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any; res: Response }> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
  })
  const sc = res.headers.get("set-cookie")
  if (sc) cookie = sc.split(";")[0]
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, res }
}
const post = (p: string, b: unknown) => call(p, { method: "POST", body: JSON.stringify(b) })
const patch = (p: string, b: unknown) => call(p, { method: "PATCH", body: JSON.stringify(b) })
const del = (p: string) => call(p, { method: "DELETE" })
const get = (p: string) => call(p)

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) console.log("  PASS:", label)
  else {
    console.error("  FAIL:", label, extra === undefined ? "" : JSON.stringify(extra))
    process.exitCode = 1
  }
}

async function accountId(): Promise<string> {
  return (await db.billingAccount.findFirst({ where: { user: { email: DEMO_EMAIL } } }))!.id
}

async function ensureSendingCapacity(): Promise<void> {
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const n = await db.sendingDomain.count({
    where: { projectId: project!.id, status: { in: ["active", "warming"] } },
  })
  if (n === 0) {
    const res = await post("/api/domains", { action: "rent_prewarmed", name: "goldenhelm.com" })
    if (!res.body.ok) throw new Error("capacity: could not rent a pre-warmed domain")
  }
}

// scratch campaign with a single approved, verified, ready-to-fire lead
async function makeScratch(name: string, opts: { language?: string; autopilot?: boolean } = {}) {
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const campaign = await db.campaign.create({
    data: {
      projectId: project.id,
      name,
      offer: "AI receptionist for dental clinics",
      customerProblem: "Missed calls cost bookings",
      targetRole: "Owner", targetGeography: "United States", targetCompanySize: "1-10",
      language: opts.language ?? "English",
      verifyPolicy: "skip_invalid",
      state: "sending", sendingNow: true,
      autopilotEnabled: opts.autopilot ?? true, autoReplyEnabled: opts.autopilot ?? true,
      autoReplyDelayMinutes: 10,
      copySubject: "Round10 check",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  return campaign
}

async function addLead(campaignId: string, i: number, extra: Record<string, unknown> = {}) {
  return db.lead.create({
    data: {
      campaignId, name: `Round10 Lead ${i}`, title: "Owner",
      company: `Clinic ${i}`, companyDomain: `clinic-${i}.example.com`, industry: "healthcare",
      companySize: "1-10", country: "United States", email: `valid.r10-${i}@round10.example.com`,
      score: 75, status: "approved", verifyStatus: "valid", verifyReason: "verified",
      reasons: "growing practice", ...extra,
    },
  })
}

async function main() {
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })!
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  await ensureSendingCapacity()

  // QA determinism: clear the daily spend accumulator so the budget guards
  // don't block sends in this long-lived demo workspace
  await db.billingAccount.updateMany({
    where: { user: { email: DEMO_EMAIL } },
    data: { spentTodayUsd: 0, spentTodayDate: new Date().toISOString().slice(0, 10) },
  })
  // suite spends real credits (sends + the $9 success fee) - keep the demo
  // balance workable no matter where in a shared pipeline this runs
  const account0 = await db.billingAccount.findFirst({ where: { user: { email: DEMO_EMAIL } } })
  if (account0 && account0.prepaidBalanceUsd < 20) {
    await db.billingAccount.update({ where: { id: account0.id }, data: { prepaidBalanceUsd: 30 } })
    await db.creditTransaction.create({
      data: {
        accountId: account0.id,
        type: "topup",
        amountUsd: 30 - account0.prepaidBalanceUsd,
        balanceAfter: 30,
        description: "QA top-up (round 10 meters sends + success fees)",
      },
    })
  }

  // --------------------------- Part A: 30-language campaign copy
  console.log("\nPart A - campaign languages")
  const { LANGUAGES } = await import("../src/lib/constants")
  const { LANG_LOCALIZED } = await import("../src/lib/i18n-copy")
  ok(Array.isArray(LANGUAGES) && LANGUAGES.length === 30, "30 languages offered", LANGUAGES.length)
  ok(LANGUAGES.includes("Arabic") && LANGUAGES.includes("Japanese") && LANGUAGES.includes("Chinese (Simplified)"),
    "language list spans scripts (Arabic, Japanese, Chinese)")

  const langCampaign = await makeScratch("Round10 German followups", { language: "German", autopilot: false })
  await addLead(langCampaign.id, 1, { touchCount: 1, nextTouchAt: new Date(Date.now() - 60_000) })
  for (let i = 0; i < 3 && (await db.message.count({ where: { campaignId: langCampaign.id, direction: "out" } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const followup = await db.message.findFirst({ where: { campaignId: langCampaign.id, direction: "out", kind: "touch" } })
  ok(!!followup, "German campaign produced a follow-up touch")
  ok(!!followup && followup.body.includes("meine Nachricht nochmal nach oben"),
    "follow-up body rendered in German", followup?.body.slice(0, 60))
  ok(!!followup && (followup.subject?.startsWith("AW:") || followup.subject?.includes("Nachfrage")),
    "follow-up subject localized (AW: prefix)", followup?.subject)

  const detail = await get(`/api/campaigns/${langCampaign.id}`)
  ok(detail.body.campaign.language === "German", "language persists on the campaign detail")
  ok(detail.body.campaign.stats !== undefined && detail.body.campaign.stats.cplUsd !== undefined,
    "campaign detail now carries the stats block (spend/warm/cpl)")

  // non-localized language falls back to English engine copy
  const csCampaign = await makeScratch("Round10 Czech fallback", { language: "Czech", autopilot: false })
  await addLead(csCampaign.id, 2, { touchCount: 1, nextTouchAt: new Date(Date.now() - 60_000) })
  for (let i = 0; i < 3 && (await db.message.count({ where: { campaignId: csCampaign.id, direction: "out" } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const csMsg = await db.message.findFirst({ where: { campaignId: csCampaign.id, direction: "out", kind: "touch" } })
  ok(!!csMsg && csMsg.body.includes("just floating this back to the top of your inbox"),
    "Czech (unmapped) falls back to the English engine template", csMsg?.body.slice(0, 60))
  ok(Object.keys(LANG_LOCALIZED).length >= 12, `${Object.keys(LANG_LOCALIZED).length} languages have localized engine templates`)

  // --------------------------- Part B: calendar booking + meetings
  console.log("\nPart B - calendar booking, meetings and .ics")
  const bookCampaign = await makeScratch("Round10 booking demo", { autopilot: true })
  const bookLead = await addLead(bookCampaign.id, 3, {
    convStatus: "negotiating",
    agentDueAt: new Date(Date.now() - 30_000),
    agentStage: "confirm",
    meetingAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
  })
  const ticks = 3
  for (let i = 0; i < ticks && (await db.meeting.count({ where: { campaignId: bookCampaign.id } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const meeting = await db.meeting.findFirst({ where: { campaignId: bookCampaign.id } })
  ok(!!meeting, "autopilot confirm stage created a Meeting row")
  ok(meeting?.status === "confirmed" && meeting.source === "autopilot", "meeting confirmed, source autopilot", meeting?.status)
  ok(meeting?.bookingUrl === project.bookingUrl, "meeting carries the workspace booking URL", meeting?.bookingUrl)
  ok(meeting && meeting.startsAt.getTime() > Date.now(), "meeting startsAt is in the future")
  const agentMsg = await db.message.findFirst({ where: { campaignId: bookCampaign.id, kind: "autopilot", direction: "out" } })
  ok(!!agentMsg && agentMsg.body.includes(project.bookingUrl), "autopilot reply contains the booking link", agentMsg?.body.slice(-80))
  const bookedLead = await db.lead.findUnique({ where: { id: bookLead.id } })
  ok(bookedLead?.convStatus === "booked", "lead flipped to booked")

  const ics = await fetch(`${BASE}/api/meetings/${meeting!.id}/ics`, { headers: { cookie } })
  ok(ics.status === 200 && (ics.headers.get("content-type") ?? "").includes("text/calendar"), "ICS download served as text/calendar")
  const icsText = await ics.text()
  ok(icsText.includes("BEGIN:VCALENDAR") && icsText.includes("BEGIN:VEVENT") && icsText.includes("SUMMARY:"), "ICS body has VEVENT + SUMMARY")
  ok(icsText.includes(`ATTENDEE;CN=Round10 Lead 3:mailto:valid.r10-3@round10.example.com`), "ICS carries the attendee")
  const anonIcs = await fetch(`${BASE}/api/meetings/${meeting!.id}/ics`)
  ok(anonIcs.status === 401, "ICS without session -> 401")

  const overview = await get("/api/overview")
  ok(Array.isArray(overview.body.meetings) && overview.body.meetings.some((m: any) => m.id === meeting!.id),
    "overview exposes the upcoming meeting")
  const meetingsApi = await get("/api/meetings")
  ok(meetingsApi.status === 200 && meetingsApi.body.meetings.length >= 1, "GET /api/meetings lists the meeting")

  // --------------------------- Part C: public API v1
  console.log("\nPart C - public API v1")
  const anonList = await fetch(`${BASE}/api/public/v1/campaigns`)
  ok(anonList.status === 401, "public API without key -> 401")
  const badList = await fetch(`${BASE}/api/public/v1/campaigns`, { headers: { Authorization: "Bearer jd_live_wrong" } })
  ok(badList.status === 401, "public API with wrong key -> 401")

  const keyRes = await post("/api/apikeys", { name: "Round10 QA key" })
  ok(keyRes.status === 200 && keyRes.body.key.raw.startsWith("jd_live_"), "key created, raw shown once with jd_live_ prefix")
  ok(keyRes.body.key.prefix.length === 16, "prefix stored for display", keyRes.body.key.prefix)
  const rawKey: string = keyRes.body.key.raw
  const authHeaders = { Authorization: `Bearer ${rawKey}` }

  const pubCampaigns = await fetch(`${BASE}/api/public/v1/campaigns`, { headers: authHeaders })
  ok(pubCampaigns.status === 200, "GET /api/public/v1/campaigns with Bearer key -> 200")
  ok((pubCampaigns.headers.get("x-ratelimit-limit") ?? "") === "60", "rate limit headers present", pubCampaigns.headers.get("x-ratelimit-limit"))
  const pubBody = await pubCampaigns.json()
  ok(Array.isArray(pubBody.campaigns) && pubBody.campaigns.length >= 1, "campaigns listed")
  ok("stats" in pubBody.campaigns[0] && "cplUsd" in pubBody.campaigns[0].stats, "campaign list includes stats + cplUsd")

  const pubOne = await fetch(`${BASE}/api/public/v1/campaigns/${bookCampaign.id}`, { headers: authHeaders })
  ok(pubOne.status === 200, "GET /api/public/v1/campaigns/[id] -> 200")
  const oneBody = await pubOne.json()
  ok(oneBody.stats.warm >= 1, "booked lead counted as warm", oneBody.stats)
  ok(typeof oneBody.stats.spendUsd === "number", "spendUsd exposed")

  const pubLeads = await fetch(`${BASE}/api/public/v1/leads?verify=valid&take=20`, { headers: authHeaders })
  const leadsBody = await pubLeads.json()
  ok(pubLeads.status === 200 && leadsBody.leads.every((l: any) => l.verifyStatus === "valid"),
    "GET /api/public/v1/leads?verify=valid filters by verification status")
  const pubMeetings = await fetch(`${BASE}/api/public/v1/meetings`, { headers: authHeaders })
  const meetingsBody = await pubMeetings.json()
  ok(pubMeetings.status === 200 && meetingsBody.meetings.some((m: any) => m.id === meeting!.id), "GET /api/public/v1/meetings lists meetings")

  // revoke -> 401
  const revoked = await del(`/api/apikeys?id=${keyRes.body.key.id}`)
  ok(revoked.status === 200, "key revoked")
  const afterRevoke = await fetch(`${BASE}/api/public/v1/campaigns`, { headers: authHeaders })
  ok(afterRevoke.status === 401, "revoked key -> 401")
  const revokeAudit = await db.auditEvent.findFirst({ where: { userId: user.id, action: "apikey.revoked" } })
  ok(!!revokeAudit, "audit records apikey.created/revoked", revokeAudit?.target)

  // rate limit: fresh key, burst past 60 requests/min
  const rlKey = await post("/api/apikeys", { name: "Round10 rate limit" })
  const rlHeaders = { Authorization: `Bearer ${rlKey.body.key.raw}` }
  let saw429 = false
  for (let i = 0; i < 62; i++) {
    const r = await fetch(`${BASE}/api/public/v1/meetings`, { headers: rlHeaders })
    if (r.status === 429) { saw429 = true; break }
  }
  ok(saw429, "61st+ request inside a minute -> 429")

  // --------------------------- Part D: cost per warm lead reporting
  console.log("\nPart D - cost-per-warm-lead reporting")
  const reportKey = await post("/api/apikeys", { name: "Round10 report key" })
  ok(reportKey.status === 200, "report key created for the public endpoints")
  const reportAuth = { Authorization: `Bearer ${reportKey.body.key.raw}` }
  const cplCampaign = await makeScratch("Round10 CPL demo", { autopilot: false })
  await addLead(cplCampaign.id, 4)
  await addLead(cplCampaign.id, 5)
  for (let i = 0; i < 6 && (await db.message.count({ where: { campaignId: cplCampaign.id, direction: "out" } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const spendRows = await db.creditTransaction.findMany({ where: { campaignId: cplCampaign.id, type: "spend" } })
  ok(spendRows.length >= 1, "send charges attributed to the campaign", spendRows.length)
  const spendUsd = Math.round(spendRows.reduce((s, r) => s + Math.abs(r.amountUsd), 0) * 10000) / 10000
  ok(spendUsd > 0, "campaign spend computed from the ledger", spendUsd)
  const oneRes = await fetch(`${BASE}/api/public/v1/campaigns/${cplCampaign.id}`, { headers: reportAuth })
  const one = await oneRes.json()
  ok(oneRes.status === 200 && one.stats.spendUsd === spendUsd, "public API spendUsd matches the ledger sum exactly", { api: one.stats?.spendUsd, ledger: spendUsd })
  ok(one.stats.cplUsd === null, "no warm leads yet -> cplUsd null")

  // make one lead warm -> CPL = spend / 1
  const firstLead = await db.lead.findFirst({ where: { campaignId: cplCampaign.id } })
  await db.lead.update({ where: { id: firstLead!.id }, data: { isHot: true, convStatus: "negotiating" } })
  const oneWarmRes = await fetch(`${BASE}/api/public/v1/campaigns/${cplCampaign.id}`, { headers: reportAuth })
  const oneWarm = await oneWarmRes.json()
  const expectedCpl = Math.round((spendUsd / 1) * 100) / 100
  ok(oneWarm.stats.cplUsd === expectedCpl, "cplUsd = spend / warm leads (exact)", { got: oneWarm.stats.cplUsd, expected: expectedCpl })
  ok(oneWarm.stats.warm === 1, "warm count = 1")

  const csvRes = await fetch(`${BASE}/api/campaigns/${cplCampaign.id}/report`, { headers: { cookie } })
  const csvText = await csvRes.text()
  ok(csvRes.status === 200 && csvText.includes("Cost per warm lead USD"), "CSV report carries the CPL column")
  ok(csvText.includes(`${expectedCpl.toFixed(2)}`), "CSV CPL value matches", expectedCpl.toFixed(2))
  ok(csvText.includes("Verification"), "CSV carries per-lead verification verdicts")

  const pdfRes = await fetch(`${BASE}/api/campaigns/${cplCampaign.id}/report-pdf`, { headers: { cookie } })
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer())
  ok(pdfRes.status === 200 && pdfBuf.subarray(0, 4).toString() === "%PDF", "PDF report downloads")
  ok(pdfBuf.length > 2500, "PDF has content", pdfBuf.length)

  const digest = await get("/api/overview")
  const cplRow = digest.body.campaigns.find((c: any) => c.id === cplCampaign.id)
  ok(cplRow && cplRow.cplUsd === expectedCpl, "overview campaign row shows the CPL", cplRow?.cplUsd)

  // --------------------------- Part E: per-result pricing (success fee)
  console.log("\nPart E - per-result pricing")
  const fee = await patch("/api/billing", { pricingModel: "per_result", warmLeadFeeUsd: 9 })
  ok(fee.status === 200, "billing switched to per_result")
  const pricingAudit = await db.auditEvent.findFirst({
    where: { userId: user.id, action: "billing.pricing_changed" },
  })
  ok(!!pricingAudit && pricingAudit.detail?.includes("per_result"), "audit records pricing_changed", pricingAudit?.detail)

  const feeCampaign = await makeScratch("Round10 success fee", { autopilot: true })
  const feeLead = await addLead(feeCampaign.id, 6, {
    convStatus: "negotiating",
    agentDueAt: new Date(Date.now() - 30_000),
    agentStage: "confirm",
    meetingAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
  })
  for (let i = 0; i < 3 && (await db.meeting.count({ where: { campaignId: feeCampaign.id } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const feeTx = await db.creditTransaction.findMany({ where: { campaignId: feeCampaign.id, type: "warm_lead_fee" } })
  ok(feeTx.length === 1, "exactly one warm_lead_fee charge", feeTx.length)
  ok(feeTx[0]?.amountUsd === -9, "fee amount is -9 USD", feeTx[0]?.amountUsd)
  ok(feeTx[0]?.description.includes("Round10 Lead 6"), "fee names the warm lead", feeTx[0]?.description)
  const chargedLead = await db.lead.findUnique({ where: { id: feeLead.id } })
  ok(chargedLead?.successFeeCharged === true, "lead flagged successFeeCharged")

  const feeOneRes = await fetch(`${BASE}/api/public/v1/campaigns/${feeCampaign.id}`, { headers: reportAuth })
  const feeOne = await feeOneRes.json()
  ok(feeOne.stats.warm === 1, "fee-charged lead counts as warm")
  const ledgerSpend = Math.round(
    (await db.creditTransaction.findMany({ where: { campaignId: feeCampaign.id, amountUsd: { lt: 0 } } }))
      .reduce((s, r) => s + Math.abs(r.amountUsd), 0) * 10000
  ) / 10000
  ok(feeOne.stats.spendUsd === ledgerSpend, "CPL spend includes the success fee", { api: feeOne.stats.spendUsd, ledger: ledgerSpend })

  // back to per-action: a new warm lead triggers no fee. The campaign flipped
  // to "completed" when lead 6 booked, so revive it before adding lead 7.
  await patch("/api/billing", { pricingModel: "per_action" })
  await db.campaign.update({ where: { id: feeCampaign.id }, data: { state: "sending", sendingNow: true } })
  const feeLead2 = await addLead(feeCampaign.id, 7, {
    convStatus: "negotiating",
    agentDueAt: new Date(Date.now() - 30_000),
    agentStage: "confirm",
    meetingAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
  })
  for (let i = 0; i < 3 && (await db.meeting.count({ where: { campaignId: feeCampaign.id, leadId: feeLead2.id } })) === 0; i++) {
    await post("/api/tick", {})
  }
  const feeTx2 = await db.creditTransaction.findMany({ where: { campaignId: feeCampaign.id, type: "warm_lead_fee" } })
  ok(feeTx2.length === 1, "per_action pricing: no further success fees", feeTx2.length)
  const charged2 = await db.lead.findUnique({ where: { id: feeLead2.id } })
  ok(charged2?.convStatus === "booked" && charged2?.successFeeCharged === false, "second lead booked without a fee")

  // --------------------------- cleanup
  for (const id of [langCampaign.id, csCampaign.id, bookCampaign.id, cplCampaign.id, feeCampaign.id]) {
    await db.campaign.delete({ where: { id } })
  }
  await db.apiKey.deleteMany({ where: { userId: user.id, name: { startsWith: "Round10" } } })
  await db.meeting.deleteMany({ where: { campaign: { project: { userId: user.id } } } })
  await db.auditEvent.deleteMany({
    where: {
      userId: user.id,
      action: { in: ["apikey.created", "apikey.revoked", "billing.pricing_changed", "campaign.created", "campaign.updated", "domain.rented"] },
    },
  })
  await db.sendingDomain.deleteMany({
    where: { domain: "goldenhelm.com", project: { userId: user.id } },
  })

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
