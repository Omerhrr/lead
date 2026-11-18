// Round-7 E2E verification: campaign-level LinkedIn toggle (channel control +
// metering), team/workspace seats (invite, accept, LinkedIn seat assignment,
// owner-only guards), and deployable-template packaging files.
// Dev server on :3000. Re-runnable (cleans up scratch campaigns + members).
// Run: bun scripts/verify_round7.ts
import { PrismaClient } from "@prisma/client"
import { readFileSync, existsSync } from "node:fs"

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

function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) console.log("  PASS:", label)
  else {
    console.error("  FAIL:", label, extra === undefined ? "" : JSON.stringify(extra))
    process.exitCode = 1
  }
}

const past = () => new Date(Date.now() - 60_000)

async function main() {
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })!
  ok(!!project, "project available")

  // --------------------------- Part A: LinkedIn touches — campaign-level toggle
  console.log("\nPart A — LinkedIn touches: campaign-level channel control")
  const template = await db.campaign.findFirst({ where: { projectId: project!.id } })!
  const usageBefore = await db.usageDaily.findUnique({
    where: { accountId_date: { accountId: (await db.billingAccount.findUnique({ where: { userId: user!.id } }))!.id, date: new Date().toISOString().slice(0, 10) } },
  })
  const liBefore = usageBefore?.linkedinTouches ?? 0

  const scratch = await db.campaign.create({
    data: {
      projectId: project!.id,
      name: "Round7 linkedin toggle demo",
      offer: template.offer, customerProblem: template.customerProblem,
      targetRole: template.targetRole, targetGeography: template.targetGeography,
      targetCompanySize: template.targetCompanySize,
      maxTouches: 5, state: "sending", sendingNow: true,
      autopilotEnabled: false, autoReplyEnabled: false,
      linkedinEnabled: false,
      copySubject: "Round7 channel check",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })

  // A1: PATCH roundtrip — the toggle persists through the campaign API
  const patchOn = await patch(`/api/campaigns/${scratch.id}`, { linkedinEnabled: true })
  ok(patchOn.status === 200 && patchOn.body.campaign.linkedinEnabled === true, "PATCH linkedinEnabled=true persists")
  const patchOff = await patch(`/api/campaigns/${scratch.id}`, { linkedinEnabled: false })
  ok(patchOff.status === 200 && patchOff.body.campaign.linkedinEnabled === false, "PATCH linkedinEnabled=false persists")

  // A2: OFF gate is deterministic — first touch + forced follow-up are BOTH email
  const gateLead = await db.lead.create({
    data: {
      campaignId: scratch.id, name: "QA Channel", title: "Tester", company: "Round7 QA",
      companyDomain: "round7-qa.example.com", industry: "software", companySize: "11-50",
      country: "United States", email: "channel@round7-qa.example.com", score: 50,
      status: "approved", linkedinUrl: "https://linkedin.com/in/qa-channel",
      reasons: "scaling support", nextTouchAt: past(),
    },
  })
  await post("/api/tick", {})
  const touch1 = await db.message.findFirst({
    where: { leadId: gateLead.id, direction: "out", kind: "touch" }, orderBy: { createdAt: "asc" },
  })
  ok(!!touch1 && touch1.channel === "email", "touch 1 is email with toggle off", touch1?.channel)
  await db.lead.update({ where: { id: gateLead.id }, data: { nextTouchAt: past() } })
  await post("/api/tick", {})
  const touch2 = await db.message.findFirst({
    where: { leadId: gateLead.id, direction: "out", kind: "touch", touchIndex: 2 },
  })
  ok(!!touch2 && touch2.channel === "email", "forced follow-up is email with toggle off", touch2?.channel)

  // A3: ON — batch follow-ups across 12 LinkedIn-profiled leads produce
  // channel="linkedin" touches (30% per follow-up; loop makes failure ~impossible)
  const patchOn2 = await patch(`/api/campaigns/${scratch.id}`, { linkedinEnabled: true })
  ok(patchOn2.status === 200, "toggle re-enabled for the batch check")
  const leadIds: string[] = []
  for (let i = 0; i < 12; i++) {
    const l = await db.lead.create({
      data: {
        campaignId: scratch.id, name: `QA LinkedIn ${i}`, title: "VP Growth", company: `Round7 Batch ${i}`,
        companyDomain: `round7-batch-${i}.example.com`, industry: "software", companySize: "51-200",
        country: "United States", email: `li${i}@round7-batch.example.com`, score: 60,
        status: "approved", linkedinUrl: `https://linkedin.com/in/qa-li-${i}`,
        reasons: "expanding apac", nextTouchAt: past(),
      },
    })
    leadIds.push(l.id)
  }
  let linkedinMsg: { id: string; body: string; subject: string | null } | null = null
  for (let attempt = 0; attempt < 10 && !linkedinMsg; attempt++) {
    await db.lead.updateMany({
      where: { id: { in: leadIds }, convStatus: null, touchCount: { lt: 5 } },
      data: { nextTouchAt: past() },
    })
    await post("/api/tick", {})
    linkedinMsg = await db.message.findFirst({
      where: { campaignId: scratch.id, direction: "out", kind: "touch", channel: "linkedin" },
    })
  }
  ok(!!linkedinMsg, "LinkedIn touch delivered when the toggle is on")
  if (linkedinMsg) {
    ok(linkedinMsg.subject === null, "LinkedIn touch has no subject line (DM shape)")
    ok(!linkedinMsg.body.includes("One click to opt out"), "LinkedIn touch carries no email unsubscribe footer")
  }

  // A4: channel-mix counts on the campaign API match the database
  const detail = await call(`/api/campaigns/${scratch.id}`)
  const liCount = await db.message.count({ where: { campaignId: scratch.id, direction: "out", kind: "touch", channel: "linkedin" } })
  const emCount = await db.message.count({ where: { campaignId: scratch.id, direction: "out", kind: "touch", channel: "email" } })
  ok(detail.body.campaign.linkedinTouches === liCount && detail.body.campaign.emailTouches === emCount,
    `campaign API channel mix matches db (${emCount} email / ${liCount} LinkedIn)`)

  // A5: metering — usage row grew and the ledger shows the LinkedIn touch line
  const usageAfter = await db.usageDaily.findUnique({
    where: { accountId_date: { accountId: (await db.billingAccount.findUnique({ where: { userId: user!.id } }))!.id, date: new Date().toISOString().slice(0, 10) } },
  })
  ok((usageAfter?.linkedinTouches ?? 0) > liBefore, `UsageDaily.linkedinTouches ${liBefore} -> ${usageAfter?.linkedinTouches}`)
  const seatTx = await db.creditTransaction.findFirst({
    where: { accountId: (await db.billingAccount.findUnique({ where: { userId: user!.id } }))!.id, description: { contains: "LinkedIn touch" } },
    orderBy: { createdAt: "desc" },
  })
  ok(!!seatTx, "ledger bills LinkedIn touches", seatTx?.description)

  // cleanup: scratch campaign cascades leads/messages
  await db.campaign.delete({ where: { id: scratch.id } })

  // --------------------------- Part B: team / workspace seats
  console.log("\nPart B — team seats (invite, accept, LinkedIn seat, owner guards)")
  await db.teamMember.deleteMany({ where: { owner: { email: DEMO_EMAIL } } })
  const team0 = await call("/api/team")
  ok(team0.status === 200 && team0.body.owner.email === DEMO_EMAIL, "GET /api/team returns the owner workspace")
  ok(team0.body.seats.linkedinSeats === 1 && team0.body.seats.seatsUsed === 0, "seat summary starts 0/1", team0.body.seats)

  const badInvite = await post("/api/team", { email: "riley@brightpath.io", name: "Self" })
  ok(badInvite.status === 400, "inviting yourself rejected")
  const badEmail = await post("/api/team", { email: "not-an-email", name: "X" })
  ok(badEmail.status === 400, "invalid email rejected")
  const noName = await post("/api/team", { email: "a@brightpath.io", name: "" })
  ok(noName.status === 400, "missing name rejected")

  const inv = await post("/api/team", { email: "Jordan@BrightPath.io", name: "Jordan Blake", role: "member" })
  ok(inv.status === 200 && inv.body.member.status === "invited" && inv.body.member.email === "jordan@brightpath.io",
    "invite created (email normalized, status invited)")
  const dupe = await post("/api/team", { email: "jordan@brightpath.io", name: "Jordan" })
  ok(dupe.status === 400, "duplicate invite rejected")
  const inv2 = await post("/api/team", { email: "kate@brightpath.io", name: "Kate Lin", role: "viewer" })
  ok(inv2.status === 200, "second invite created")

  const acc = await patch("/api/team", { id: inv.body.member.id, action: "accept" })
  ok(acc.status === 200 && acc.body.member.status === "active", "invite accepted -> active")
  const acc2 = await patch("/api/team", { id: inv.body.member.id, action: "accept" })
  ok(acc2.status === 400, "double accept rejected")

  const seatOn = await patch("/api/team", { id: inv.body.member.id, action: "seat_on" })
  ok(seatOn.status === 200 && seatOn.body.member.linkedinSeat === true, "LinkedIn seat assigned to Jordan")
  const seatFull = await patch("/api/team", { id: inv2.body.member.id, action: "seat_on" })
  ok(seatFull.status === 400 && String(seatFull.body.error).includes("No LinkedIn seats"),
    "over-assigning the single seat rejected", seatFull.body)
  const teamMid = await call("/api/team")
  ok(teamMid.body.seats.seatsUsed === 1 && teamMid.body.seats.seatsAvailable === 0, "seat summary reflects 1/1 in use")
  const seatOff = await patch("/api/team", { id: inv.body.member.id, action: "seat_off" })
  ok(seatOff.status === 200 && seatOff.body.member.linkedinSeat === false, "seat freed")
  const seatOn2 = await patch("/api/team", { id: inv2.body.member.id, action: "seat_on" })
  ok(seatOn2.status === 200, "freed seat re-assignable to Kate")

  const role = await patch("/api/team", { id: inv2.body.member.id, role: "member" })
  ok(role.status === 200 && role.body.member.role === "member", "role change viewer -> member")
  const badRole = await patch("/api/team", { id: inv2.body.member.id, role: "owner" })
  ok(badRole.status === 400, "owner role is reserved (not assignable)")
  const badAction = await patch("/api/team", { id: inv.body.member.id })
  ok(badAction.status === 400, "PATCH without action/role rejected")

  const rm = await del(`/api/team?id=${inv.body.member.id}`)
  ok(rm.status === 200, "member removed")
  const rm404 = await del("/api/team?id=does-not-exist")
  ok(rm404.status === 404, "removing unknown member -> 404")
  const anon = await fetch(BASE + "/api/team")
  ok(anon.status === 401, "team API without session -> 401")

  // cleanup: leave the workspace as we found it
  await db.teamMember.deleteMany({ where: { owner: { email: DEMO_EMAIL } } })

  // --------------------------- Part C: deployable-template packaging
  console.log("\nPart C — deployable-template packaging")
  const envExample = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : ""
  ok(envExample.includes("DATABASE_URL="), ".env.example documents DATABASE_URL")
  ok(envExample.includes("RESEND_API_KEY=") && envExample.includes("RESEND_WEBHOOK_SECRET="), ".env.example documents Resend vars")
  ok(envExample.includes("SMTP_HOST=") && envExample.includes("SMTP_PASS="), ".env.example documents SMTP vars")
  ok(envExample.includes("APP_URL=") && envExample.includes("REPORT_INTERVAL_MS="), ".env.example documents APP_URL + digest interval")

  const dockerfile = existsSync("Dockerfile") ? readFileSync("Dockerfile", "utf8") : ""
  ok(dockerfile.includes("oven/bun"), "Dockerfile builds on oven/bun")
  ok(dockerfile.includes("prisma generate") && dockerfile.includes("prisma db push"), "Dockerfile runs prisma generate + first-run db push")
  ok(dockerfile.includes(".next/standalone") && dockerfile.includes("EXPOSE 3000"), "Dockerfile ships the standalone server on :3000")

  const dockerignore = existsSync(".dockerignore") ? readFileSync(".dockerignore", "utf8") : ""
  ok(dockerignore.includes("node_modules") && dockerignore.includes(".env"), ".dockerignore excludes node_modules + .env")

  const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : ""
  ok(readme.includes("## Quickstart") && readme.includes("## Deploy"), "root README has Quickstart + Deploy")
  ok(readme.includes("docker build") && readme.includes("riley@brightpath.io"), "README covers docker deploy + demo login")

  const pkg = JSON.parse(readFileSync("package.json", "utf8"))
  ok(pkg.scripts["db:seed"] === "bun scripts/seed_db.ts", "package.json exposes db:seed")

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
