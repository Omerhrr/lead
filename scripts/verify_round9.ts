// Round-9 E2E verification: pre-send mailbox verification (module-level
// checks + pool auto-verify + the campaign send-time policy gate), SPF/DKIM/
// DMARC DNS authentication (records + checker + audit), the pre-warmed domain
// store (rent flow, instant capacity), and CSV lead list import (dry-run
// preview + verified commit).
//
// Environment-independent. Re-runnable (cleans up scratch data).
// Run: bun scripts/verify_round9.ts
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
const get = (p: string) => call(p)

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) console.log("  PASS:", label)
  else {
    console.error("  FAIL:", label, extra === undefined ? "" : JSON.stringify(extra))
    process.exitCode = 1
  }
}

async function balance(): Promise<number> {
  const account = await db.billingAccount.findFirst({ where: { user: { email: DEMO_EMAIL } } })
  return account?.prepaidBalanceUsd ?? 0
}

async function ensureSendingCapacity(): Promise<void> {
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const n = await db.sendingDomain.count({
    where: { projectId: project!.id, status: { in: ["active", "warming"] } },
  })
  if (n === 0) {
    const res = await post("/api/domains", { action: "rent_prewarmed", name: "leadrelay.app" })
    if (!res.body.ok) throw new Error("capacity: could not rent a pre-warmed domain")
  }
}

async function main() {
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)

  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })!

  // QA determinism: clear the daily spend accumulator so the budget guards
  // don't block sends in this long-lived demo workspace
  await db.billingAccount.updateMany({
    where: { user: { email: DEMO_EMAIL } },
    data: { spentTodayUsd: 0, spentTodayDate: new Date().toISOString().slice(0, 10) },
  })
  // suite spends real credits (verification checks + a $12 rent) - keep the
  // demo balance workable no matter where in a shared pipeline this runs
  const account0 = await db.billingAccount.findFirst({ where: { user: { email: DEMO_EMAIL } } })
  if (account0 && account0.prepaidBalanceUsd < 20) {
    await db.billingAccount.update({ where: { id: account0.id }, data: { prepaidBalanceUsd: 30 } })
    await db.creditTransaction.create({
      data: {
        accountId: account0.id,
        type: "topup",
        amountUsd: 30 - account0.prepaidBalanceUsd,
        balanceAfter: 30,
        description: "QA top-up (round 9 meters verification + rent charges)",
      },
    })
  }

  // --------------------------- Part A: mailbox verification
  console.log("\nPart A - pre-send mailbox verification")
  const { verifyEmailAddress } = await import("../src/lib/verify-email")

  ok(verifyEmailAddress("valid.qa1@gate-check.example.com").status === "valid", "forced-valid prefix -> valid")
  ok(verifyEmailAddress("risky.qa1@gate-check.example.com").status === "risky" &&
     verifyEmailAddress("risky.qa1@gate-check.example.com").reason === "catch_all", "forced-risky prefix -> risky (catch_all)")
  ok(verifyEmailAddress("invalid.qa1@gate-check.example.com").status === "invalid", "forced-invalid prefix -> invalid")
  ok(verifyEmailAddress("deals@mailinator.com").status === "invalid" &&
     verifyEmailAddress("deals@mailinator.com").reason === "disposable", "disposable domain -> invalid")
  ok(verifyEmailAddress("info@acme.com").status === "risky" &&
     verifyEmailAddress("info@acme.com").reason === "role_account", "role account -> risky")
  ok(verifyEmailAddress("not-an-email").status === "invalid" &&
     verifyEmailAddress("not-an-email").reason === "syntax", "broken syntax -> invalid")
  // deterministic per address: same input, same verdict
  const a1 = verifyEmailAddress("m.case@example-corp.io")
  const a2 = verifyEmailAddress("m.case@example-corp.io")
  ok(a1.status === a2.status && a1.reason === a2.reason, "verification is deterministic per address")

  // pool auto-verify: creating a campaign through the API verifies every pool lead
  const before = await balance()
  const created = await post("/api/campaigns", {
    name: "Round9 verification demo",
    offer: "AI scheduling assistant for clinics",
    customerProblem: "No-shows waste chair time",
    targetRole: "Office manager",
    targetGeography: "United States",
    targetCompanySize: "11-50",
  })
  ok(created.status === 200, "campaign created -> pool generated + auto-verified")
  const campA = created.body.campaign.id
  const poolLeads = await db.lead.findMany({ where: { campaignId: campA, status: "pool" } })
  ok(poolLeads.length > 0, `pool has ${poolLeads.length} leads`)
  ok(poolLeads.every((l) => l.verifyStatus !== "unknown"), "every pool lead was verified at creation", poolLeads[0]?.verifyStatus)
  ok(poolLeads.every((l) => !!l.verifiedAt), "verifiedAt stamped on all pool leads")
  const expectedCharge = Math.round(poolLeads.length * 0.005 * 10000) / 10000
  const afterPool = await balance()
  ok(Math.abs(before - afterPool - expectedCharge) < 1e-9,
    `verification charged ${expectedCharge} USD (${poolLeads.length} x 0.005)`, { before, afterPool })
  const verTx = await db.creditTransaction.findFirst({ where: { campaignId: campA, type: "verification" } })
  ok(!!verTx && verTx.amountUsd === -expectedCharge, "ledger has the campaign-attributed verification charge", verTx?.amountUsd)

  // re-verify action: reset two leads to unknown, then verify_pool re-checks only those
  const unknownTwo = poolLeads.slice(0, 2)
  await db.lead.updateMany({
    where: { id: { in: unknownTwo.map((l) => l.id) } },
    data: { verifyStatus: "unknown", verifyReason: null, verifiedAt: null },
  })
  const beforeReverify = await balance()
  const rv = await post(`/api/campaigns/${campA}/actions`, { action: "verify_pool" })
  ok(rv.status === 200 && rv.body.checked === 2, "verify_pool action re-checks unknown leads only", rv.body)
  const afterReverify = await balance()
  ok(Math.abs(beforeReverify - afterReverify - 0.01) < 1e-9, "re-verification charged 2 x 0.005")
  const audited = await db.auditEvent.findFirst({ where: { userId: user.id, action: "campaign.verified" } })
  ok(!!audited, "audit records campaign.verified", audited?.detail)

  // send-time policy gate: invalid mailboxes never get a send
  await ensureSendingCapacity()
  const scratch = await db.campaign.create({
    data: {
      projectId: (await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } }))!.id,
      name: "Round9 policy gate",
      offer: "Compliance autopilot for fintech",
      customerProblem: "Manual KYC checks are slow",
      targetRole: "Head of Compliance", targetGeography: "United States", targetCompanySize: "51-200",
      language: "English", verifyPolicy: "skip_invalid",
      state: "approved", nextAction: "Start when ready",
      autopilotEnabled: false, autoReplyEnabled: false,
      copySubject: "Round9 gate check",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  const gateLeads: Array<{ email: string; verifyStatus: string }> = [
    { email: "valid.gate1@gate-check.example.com", verifyStatus: "valid" },
    { email: "valid.gate2@gate-check.example.com", verifyStatus: "valid" },
    { email: "risky.gate1@gate-check.example.com", verifyStatus: "risky" },
    { email: "risky.gate2@gate-check.example.com", verifyStatus: "risky" },
    { email: "invalid.gate1@gate-check.example.com", verifyStatus: "invalid" },
    { email: "invalid.gate2@gate-check.example.com", verifyStatus: "invalid" },
  ]
  for (const gl of gateLeads) {
    await db.lead.create({
      data: {
        campaignId: scratch.id, name: `Gate ${gl.verifyStatus}`, title: "VP Ops",
        company: "Gatecheck", companyDomain: "gate-check.example.com", industry: "software",
        companySize: "51-200", country: "United States", email: gl.email, score: 70,
        status: "approved", verifyStatus: gl.verifyStatus, verifyReason: "qa",
        reasons: "compliance automation",
      },
    })
  }
  const started = await post(`/api/campaigns/${scratch.id}/actions`, { action: "start" })
  ok(started.status === 200, "gate campaign started", started.body)
  for (let i = 0; i < 4; i++) await post("/api/tick", {})
  const touched = await db.message.findMany({ where: { campaignId: scratch.id, direction: "out" }, select: { leadId: true } })
  const touchedLeadIds = new Set(touched.map((m) => m.leadId))
  const gateRows = await db.lead.findMany({ where: { campaignId: scratch.id } })
  const invalidTouched = gateRows.filter((l) => l.verifyStatus === "invalid" && touchedLeadIds.has(l.id))
  const validTouched = gateRows.filter((l) => l.verifyStatus === "valid" && touchedLeadIds.has(l.id))
  ok(invalidTouched.length === 0, "skip_invalid policy: no invalid mailbox received a touch", invalidTouched.map((l) => l.email))
  ok(validTouched.length >= 1, "skip_invalid policy: valid mailboxes sent", validTouched.map((l) => l.email))

  // tightening the policy stops risky mailboxes too (their earlier touch under
  // the looser policy stands - but no new one may land)
  const tightened = await patch(`/api/campaigns/${scratch.id}`, { verifyPolicy: "skip_invalid_risky" })
  ok(tightened.status === 200, "verifyPolicy patched to skip_invalid_risky")
  const riskyBefore = await db.lead.findMany({
    where: { campaignId: scratch.id, verifyStatus: "risky" },
    select: { id: true, touchCount: true },
  })
  for (let i = 0; i < 3; i++) await post("/api/tick", {})
  const riskyAfter = await db.lead.findMany({
    where: { campaignId: scratch.id, verifyStatus: "risky" },
    select: { id: true, touchCount: true },
  })
  const beforeById = new Map(riskyBefore.map((l) => [l.id, l.touchCount]))
  ok(riskyAfter.every((l) => l.touchCount === beforeById.get(l.id)),
    "skip_invalid_risky: risky mailboxes receive no further touches",
    { before: riskyBefore.map((l) => l.touchCount), after: riskyAfter.map((l) => l.touchCount) })
  const policyAudit = await db.auditEvent.findFirst({
    where: { userId: user.id, action: "campaign.updated", detail: { contains: "verification policy" } },
  })
  ok(!!policyAudit, "audit records the verification policy change", policyAudit?.detail)

  // --------------------------- Part B: SPF/DKIM/DMARC authentication
  console.log("\nPart B - SPF/DKIM/DMARC DNS authentication")
  const domainsResp = await get("/api/domains")
  ok(domainsResp.status === 200 && Array.isArray(domainsResp.body.domains), "GET /api/domains lists domains")
  ok(Array.isArray(domainsResp.body.store) && domainsResp.body.store.length === 6, "store catalog has 6 listings")

  // a fresh BYOD domain starts pending with the three expected records exposed
  const byodAdd = await post("/api/domains", { action: "byod", domain: "auth-check.example.com" })
  ok(byodAdd.status === 200, "BYOD domain added")
  const listed = await get("/api/domains")
  const freshDomain = listed.body.domains.find((d: any) => d.domain === "auth-check.example.com")
  ok(freshDomain.spfStatus === "pending" && freshDomain.dkimStatus === "pending" && freshDomain.dmarcStatus === "pending",
    "fresh BYOD domain starts pending auth")
  ok(freshDomain.dnsRecords?.spf?.host && freshDomain.dnsRecords?.dkim?.host && freshDomain.dnsRecords?.dmarc?.host,
    "expected DNS records exposed (spf/dkim/dmarc hosts)", freshDomain.dnsRecords?.spf?.host)
  ok(String(freshDomain.dnsRecords.spf.value).includes("v=spf1") &&
     String(freshDomain.dnsRecords.dmarc.value).includes("v=DMARC1") &&
     String(freshDomain.dnsRecords.dkim.value).includes("v=DKIM1"), "record values carry the right prefixes")

  const checkOk = await post("/api/domains", { action: "dns_check", domainId: freshDomain.id })
  ok(checkOk.status === 200 && checkOk.body.result.spf === "pass" && checkOk.body.result.dkim === "pass" && checkOk.body.result.dmarc === "pass",
    "dns_check on a healthy domain passes all three records", checkOk.body.result)
  ok(checkOk.body.domain.dnsCheckedAt !== null, "dnsCheckedAt stamped")
  ok(checkOk.body.domain.status === "warming", "authenticated BYOD domain starts its warming ramp", checkOk.body.domain.status)

  const byod = await post("/api/domains", { action: "byod", domain: "mail.fail-gate.example.com" })
  ok(byod.status === 200, "BYOD domain added for the failure path")
  const failCheck = await post("/api/domains", { action: "dns_check", domainId: byod.body.domain.id })
  ok(failCheck.body.result?.spf === "fail" && failCheck.body.result?.dkim === "fail" && failCheck.body.result?.dmarc === "fail",
    "dns_check on fail-gate domain fails all three records (simulation)", failCheck.body.result)
  const dnsAudit = await db.auditEvent.findFirst({
    where: { userId: user.id, action: "domain.dns_checked", target: "mail.fail-gate.example.com" },
  })
  ok(!!dnsAudit && dnsAudit.detail?.includes("dkim fail"), "audit records domain.dns_checked with the per-record verdict", dnsAudit?.detail)

  // --------------------------- Part C: pre-warmed domain store
  console.log("\nPart C - pre-warmed domain store")
  const store = domainsResp.body.store
  ok(store.every((s: any) => s.reputation >= 90 && s.warmedDays >= 20 && s.priceUsd === 12), "store listings carry reputation, warming age and price", store[0])
  const beforeRent = await balance()
  const rent = await post("/api/domains", { action: "rent_prewarmed", name: "warmreach-out.com" })
  ok(rent.status === 200 && rent.body.ok, "rented warmreach-out.com", rent.body)
  const rentedDomain = await db.sendingDomain.findFirst({ where: { domain: "warmreach-out.com" } })
  ok(rentedDomain?.preWarmed === true && rentedDomain?.status === "active" && rentedDomain?.emailsPerDay === 40,
    "rented domain is pre-warmed, active, at full daily cap", { status: rentedDomain?.status, epd: rentedDomain?.emailsPerDay })
  ok(rentedDomain?.spfStatus === "pass" && rentedDomain?.dmarcStatus === "pass", "rented domain arrives fully authenticated")
  const afterRent = await balance()
  ok(Math.abs(beforeRent - afterRent - 12) < 1e-9, "rent charged exactly 12 USD", { beforeRent, afterRent })
  const rentTx = await db.creditTransaction.findFirst({ where: { type: "prewarmed_rent" }, orderBy: { createdAt: "desc" } })
  ok(!!rentTx && rentTx.amountUsd === -12, "ledger records the prewarmed_rent charge")
  const rentAudit = await db.auditEvent.findFirst({ where: { userId: user.id, action: "domain.rented" } })
  ok(!!rentAudit, "audit records domain.rented", rentAudit?.detail)

  const rentUnknown = await post("/api/domains", { action: "rent_prewarmed", name: "not-in-store.com" })
  ok(rentUnknown.status === 400, "renting a non-store domain -> 400")
  const rentDupe = await post("/api/domains", { action: "rent_prewarmed", name: "warmreach-out.com" })
  ok(rentDupe.status === 400, "renting the same domain twice -> 400")

  // --------------------------- Part D: CSV lead import
  console.log("\nPart D - CSV lead list import")
  const csvCampaign = await db.campaign.create({
    data: {
      projectId: (await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } }))!.id,
      name: "Round9 CSV import demo",
      offer: "Workflow automation for agencies",
      customerProblem: "Manual client reporting eats hours",
      targetRole: "Agency owner", targetGeography: "United States", targetCompanySize: "11-50",
      state: "draft", autopilotEnabled: false, autoReplyEnabled: false,
      copySubject: "Round9 import check", copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  const existingEmail = poolLeads[0]?.email ?? "taken@example.com"
  const csv = [
    "email,name,title,company,country,linkedin_url",
    "valid.csv1@acme-agency.com,Dana Voss,Founder,Acme Agency,United States,https://linkedin.com/in/dana-voss",
    "valid.csv2@acme-agency.com,Liam Park,Ops Director,Acme Agency,United States,",
    "valid.csv2@acme-agency.com,Liam Again,Ops Director,Acme Agency,United States,",
    `${existingEmail},Dupe Test,Copy,Acme Agency,United States,`,
    "not-an-email,Bad Row,Broken,Acme Agency,United States,",
    "valid.csv3@blocked-supplier.com,Blocked Lead,Ops,Blocked Supplier,United States,",
    "risky.csv1@acme-agency.com,Risky Row,Ops,Acme Agency,United States,",
  ].join("\n")
  await db.suppressEntry.create({
    data: { userId: user.id, type: "domain", value: "blocked-supplier.com", reason: "manual" },
  })

  const preview = await post(`/api/campaigns/${csvCampaign.id}/import-csv`, { csv })
  ok(preview.status === 200 && preview.body.preview, "dry-run preview returned", preview.body)
  const pv = preview.body.preview
  ok(pv.importable === 3, "3 rows importable", pv.importable)
  ok(pv.duplicateInFile === 1, "1 duplicate-in-file row detected", pv.duplicateInFile)
  ok(pv.malformed.length === 1, "1 malformed row (bad syntax)", pv.malformed)
  ok(pv.skipped.length === 2 &&
     pv.skipped.some((s: any) => s.reason === "on suppression list") &&
     pv.skipped.some((s: any) => s.reason === "already in workspace"),
    "suppressed domain + workspace duplicate skipped", pv.skipped)
  ok(pv.sample[0]?.email === "valid.csv1@acme-agency.com", "preview sample lists the importable rows")

  const beforeImport = await balance()
  const commit = await post(`/api/campaigns/${csvCampaign.id}/import-csv`, { csv, commit: true })
  ok(commit.status === 200 && commit.body.imported === 3, "commit imported 3 leads", commit.body)
  const imported = await db.lead.findMany({ where: { campaignId: csvCampaign.id, source: "csv" } })
  ok(imported.length === 3, "imported leads carry source=csv", imported.length)
  ok(imported.every((l) => l.verifyStatus === "valid" || l.verifyStatus === "risky"), "imported mailboxes verified on entry", imported.map((l) => l.verifyStatus))
  const riskyImported = imported.find((l) => l.email === "risky.csv1@acme-agency.com")
  ok(riskyImported?.verifyStatus === "risky" && riskyImported?.verifyReason === "catch_all", "risky.csv1 verified risky (catch_all)")
  ok(imported.some((l) => l.linkedinUrl === "https://linkedin.com/in/dana-voss"), "linkedin_url column mapped")
  const afterImport = await balance()
  ok(Math.abs(beforeImport - afterImport - 0.015) < 1e-9, "import verification charged 3 x 0.005")
  const importAudit = await db.auditEvent.findFirst({
    where: { userId: user.id, action: "campaign.imported", target: "Round9 CSV import demo" },
  })
  ok(!!importAudit && importAudit.detail?.includes("3 leads"), "audit records campaign.imported", importAudit?.detail)

  const rejectSending = await post(`/api/campaigns/${scratch.id}/import-csv`, { csv: "email\nx@y.com" })
  ok(rejectSending.status === 400, "import into a sending campaign -> 400")

  // --------------------------- cleanup
  await db.campaign.delete({ where: { id: campA } })
  await db.campaign.delete({ where: { id: scratch.id } })
  await db.campaign.delete({ where: { id: csvCampaign.id } })
  await db.suppressEntry.deleteMany({ where: { userId: user.id, value: "blocked-supplier.com" } })
  // scratch domains (rented/bought for the suite) so re-runs start clean
  await db.sendingDomain.deleteMany({
    where: {
      domain: { in: ["warmreach-out.com", "auth-check.example.com", "mail.fail-gate.example.com", "leadrelay.app"] },
      project: { userId: user.id },
    },
  })
  await db.auditEvent.deleteMany({
    where: {
      userId: user.id,
      action: { in: ["campaign.verified", "campaign.imported", "domain.rented", "domain.dns_checked", "campaign.updated"] },
    },
  })

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
