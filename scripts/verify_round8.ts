// Round-8 E2E verification: real LinkedIn API adapter behind the simulated
// touches (module-level adapter tests + engine E2E against a local mock API),
// per-member workspace audit trail (team/campaign/billing actions), and the
// CI workflow wiring.
//
// Part B needs the dev server restarted with LINKEDIN_ACCESS_TOKEN set and
// LINKEDIN_API_URL=http://127.0.0.1:8788 (this script hosts the mock). Parts
// A/C/D are environment-independent. Re-runnable (cleans up scratch data).
// Run: bun scripts/verify_round8.ts
import { PrismaClient } from "@prisma/client"
import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"

const db = new PrismaClient()
const BASE = "http://localhost:3000"
const DEMO_EMAIL = "riley@brightpath.io"
const MOCK_PORT = 8788
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

// ------------------------------------------------------- local LinkedIn mock

const mockRequests: Array<{ recipient: string; text: string; author: string }> = []
let mockStatus = 201

function startMock() {
  return Bun.serve({
    port: MOCK_PORT,
    async fetch(req) {
      const body = (await req.json().catch(() => ({}))) as Record<string, string>
      mockRequests.push({
        recipient: body.recipient ?? "",
        text: body.text ?? "",
        author: body.author ?? "",
      })
      return mockStatus === 201
        ? Response.json({ id: `urn:li:mock:${mockRequests.length}` }, { status: 201 })
        : Response.json({ message: "boom" }, { status: mockStatus })
    },
  })
}

const SKIP = (process.env.R8_SKIP ?? "").split(",").filter(Boolean) // e.g. R8_SKIP=B
async function main() {
  // session first - every authenticated part below depends on it
  const login = await post("/api/auth/login", { email: DEMO_EMAIL })
  ok(login.status === 200, "login", login.body)

  // --------------------------- Part A: LinkedIn API adapter (module level)
  console.log("\nPart A - LinkedIn API adapter (module level)")
  delete process.env.LINKEDIN_ACCESS_TOKEN
  delete process.env.LINKEDIN_API_URL

  const { getLinkedinProvider, isLinkedinConfigured, deliverLinkedInTouch } = await import(
    "../src/lib/linkedin-provider"
  )
  ok(getLinkedinProvider() === null && !isLinkedinConfigured(), "no token -> adapter not configured")
  const sim = await deliverLinkedInTouch({ memberUrl: "https://linkedin.com/in/x", senderName: "R", text: "hi" })
  ok(sim.deliveryStatus === "simulated" && sim.provider === null, "no token -> touch stays simulated")

  const mock = startMock()
  process.env.LINKEDIN_ACCESS_TOKEN = "qa-token"
  process.env.LINKEDIN_API_URL = `http://127.0.0.1:${MOCK_PORT}`

  const sent = await deliverLinkedInTouch({
    memberUrl: "https://linkedin.com/in/qa-mock",
    senderName: "Riley Chen",
    text: "Round8 adapter check",
  })
  ok(sent.deliveryStatus === "delivered" && sent.provider === "linkedin", "token + mock -> delivered via linkedin", sent)
  ok(!!sent.id && sent.id.startsWith("urn:li:mock:"), "provider message id comes from the API response", sent.id)
  const last = mockRequests[mockRequests.length - 1]
  ok(last && last.recipient === "https://linkedin.com/in/qa-mock" && last.text === "Round8 adapter check",
    "request payload carries recipient + DM text", last)
  ok(last.author === "Riley Chen", "request payload carries the sender identity")

  mockStatus = 500
  const failed = await deliverLinkedInTouch({ memberUrl: "https://linkedin.com/in/qa-mock", senderName: "R", text: "hi" })
  ok(failed.deliveryStatus === "failed" && failed.provider === "linkedin", "API 500 -> deliveryStatus failed")
  mockStatus = 201

  delete process.env.LINKEDIN_ACCESS_TOKEN
  delete process.env.LINKEDIN_API_URL
  mock.stop(true)

  // --------------------------- Part B: engine sends LinkedIn touches for real
  console.log("\nPart B - engine E2E: LinkedIn touches delivered through the adapter")
  if (SKIP.includes("B")) { console.log("  (skipped via R8_SKIP=B)") }
  else {
  ok(existsSync(".env"), "dev .env present (server harness sets LINKEDIN_* vars)")
  const serverEnvOk = !process.env.LINKEDIN_ACCESS_TOKEN // script env clean; the server env is what matters

  const mock2 = startMock()
  const project = await db.project.findFirst({ where: { user: { email: DEMO_EMAIL } } })!
  const template = await db.campaign.findFirst({ where: { projectId: project!.id } })!

  const scratch = await db.campaign.create({
    data: {
      projectId: project!.id,
      name: "Round8 linkedin adapter demo",
      offer: template!.offer, customerProblem: template!.customerProblem,
      targetRole: template!.targetRole, targetGeography: template!.targetGeography,
      targetCompanySize: template!.targetCompanySize,
      maxTouches: 5, state: "sending", sendingNow: true,
      autopilotEnabled: false, autoReplyEnabled: false,
      linkedinEnabled: true,
      copySubject: "Round8 adapter check",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  const leadIds: string[] = []
  for (let i = 0; i < 12; i++) {
    const l = await db.lead.create({
      data: {
        campaignId: scratch.id, name: `QA Adapter ${i}`, title: "VP Growth", company: `Round8 Batch ${i}`,
        companyDomain: `round8-batch-${i}.example.com`, industry: "software", companySize: "51-200",
        country: "United States", email: `ad${i}@round8-batch.example.com`, score: 60,
        status: "approved", linkedinUrl: `https://linkedin.com/in/qa-adapter-${i}`,
        reasons: "scaling ops", nextTouchAt: new Date(Date.now() - 60_000),
      },
    })
    leadIds.push(l.id)
  }
  let liMsg: { id: string; deliveryStatus: string; provider: string | null; providerMessageId: string | null; status: string } | null = null
  let emMsg: { deliveryStatus: string; provider: string | null } | null = null
  for (let attempt = 0; attempt < 10 && (!liMsg || !emMsg); attempt++) {
    await db.lead.updateMany({
      where: { id: { in: leadIds }, convStatus: null, touchCount: { lt: 5 } },
      data: { nextTouchAt: new Date(Date.now() - 60_000) },
    })
    await post("/api/tick", {})
    if (!liMsg) {
      liMsg = await db.message.findFirst({
        where: { campaignId: scratch.id, channel: "linkedin", direction: "out", kind: "touch" },
      })
    }
    if (!emMsg) {
      emMsg = await db.message.findFirst({
        where: { campaignId: scratch.id, channel: "email", direction: "out", kind: "touch" },
      })
    }
  }
  ok(!!liMsg, "engine produced a LinkedIn touch")
  if (liMsg) {
    ok(liMsg.deliveryStatus === "delivered", "LinkedIn touch delivered through the API", liMsg)
    ok(liMsg.provider === "linkedin", "message row records provider=linkedin", liMsg.provider)
    ok(!!liMsg.providerMessageId && liMsg.providerMessageId.startsWith("urn:li:mock:"),
      "provider message id persisted", liMsg.providerMessageId)
    ok(liMsg.status === "sent", "delivered LinkedIn touch stays status=sent")
  }
  ok(!!emMsg, "engine produced an email touch in the same run")
  if (emMsg) {
    ok(emMsg.deliveryStatus === "simulated" && emMsg.provider === null,
      "email touches stay simulated (no email provider configured)", emMsg)
  }
  ok(mockRequests.length >= 1, "mock API received the engine's LinkedIn DMs", mockRequests.length)
  ok(serverEnvOk, "script env stayed clean (server env carries the QA token)")

  await db.campaign.delete({ where: { id: scratch.id } })
  mock2.stop(true)
  }

  // --------------------------- Part C: workspace audit trail
  console.log("\nPart C - workspace audit trail")
  const user = await db.user.findUnique({ where: { email: DEMO_EMAIL } })!
  await db.teamMember.deleteMany({ where: { owner: { email: DEMO_EMAIL } } })
  await db.auditEvent.deleteMany({ where: { userId: user.id } })

  const anon = await fetch(BASE + "/api/audit")
  ok(anon.status === 401, "audit API without session -> 401")

  const inv = await post("/api/team", { email: "auditor@brightpath.io", name: "Auditor Check", role: "viewer" })
  ok(inv.status === 200, "invite created for audit trail")
  await patch("/api/team", { id: inv.body.member.id, action: "accept" })
  await patch("/api/team", { id: inv.body.member.id, action: "seat_on" })
  await patch("/api/team", { id: inv.body.member.id, action: "seat_off" })
  await patch("/api/team", { id: inv.body.member.id, role: "member" })
  await del(`/api/team?id=${inv.body.member.id}`)

  const account = await db.billingAccount.findUnique({ where: { userId: user.id } })!
  await patch("/api/billing", { linkedinSeats: 2 })
  await patch("/api/billing", { linkedinSeats: 1 })

  const events = await call("/api/audit?limit=50")
  ok(events.status === 200 && Array.isArray(events.body.events), "GET /api/audit returns events")
  const actions = events.body.events.map((e: { action: string }) => e.action)
  for (const a of ["team.invited", "team.accepted", "team.seat_assigned", "team.seat_freed", "team.role_changed", "team.removed", "billing.seats_changed"]) {
    ok(actions.includes(a), `audit records ${a}`)
  }
  const invited = events.body.events.find((e: { action: string }) => e.action === "team.invited")
  ok(invited && invited.actorEmail === DEMO_EMAIL && invited.target === "auditor@brightpath.io",
    "invited event carries actor + target", invited)
  const roleEv = events.body.events.find((e: { action: string }) => e.action === "team.role_changed")
  ok(roleEv && roleEv.detail === "role viewer -> member", "role change detail captures the transition", roleEv?.detail)
  const seatEvents = events.body.events.filter((e: { action: string }) => e.action === "billing.seats_changed")
  ok(seatEvents.length === 2, "both seat changes audited", seatEvents.map((e: { detail: string }) => e.detail))
  ok(seatEvents.some((e: { detail: string }) => e.detail === "1 -> 2 seats"), "billing seats event captures 1 -> 2", seatEvents.map((e: { detail: string }) => e.detail))
  const times: number[] = events.body.events.map((e: { createdAt: string }) => new Date(e.createdAt).getTime())
  ok(times.every((t: number, i: number) => i === 0 || times[i - 1] >= t), "events ordered newest-first")

  // campaign lifecycle: create (API), start/stop (actions), toggle LinkedIn off (PATCH)
  const created = await post("/api/campaigns", {
    name: "Round8 audit campaign",
    offer: "AI receptionist for med spas", customerProblem: "Missed after-hours calls",
    targetRole: "Owner", targetGeography: "United States", targetCompanySize: "11-50",
  })
  ok(created.status === 200, "campaign created through the API")
  const campaignId = created.body.campaign.id
  const start = await post(`/api/campaigns/${campaignId}/actions`, { action: "start" })
  ok(start.status === 200, "campaign start action ok")
  const stop = await post(`/api/campaigns/${campaignId}/actions`, { action: "stop" })
  ok(stop.status === 200, "campaign stop action ok")
  const toggle = await patch(`/api/campaigns/${campaignId}`, { linkedinEnabled: false })
  ok(toggle.status === 200, "LinkedIn toggle patched off")

  const ev2 = await call("/api/audit?limit=50")
  const a2 = ev2.body.events.map((e: { action: string; detail: string | null; target: string | null }) => `${e.action}|${e.detail ?? ""}`)
  ok(a2.some((s: string) => s.startsWith("campaign.created|")), "audit records campaign.created")
  ok(a2.includes("campaign.updated|action start"), "audit records campaign lifecycle start", a2.slice(0, 6))
  ok(a2.includes("campaign.updated|action stop"), "audit records campaign lifecycle stop")
  ok(a2.includes("campaign.updated|LinkedIn touches disabled"), "audit records the LinkedIn channel toggle")

  // limit is respected
  const limited = await call("/api/audit?limit=3")
  ok(limited.body.events.length === 3, "limit param respected", limited.body.events.length)

  // cleanup: scratch campaign + fresh audit slate for the demo
  await db.campaign.delete({ where: { id: campaignId } })
  await db.teamMember.deleteMany({ where: { owner: { email: DEMO_EMAIL } } })
  await db.auditEvent.deleteMany({ where: { userId: user.id } })

  // --------------------------- Part D: CI workflow + docs
  console.log("\nPart D - CI workflow + docs")
  const ci = existsSync(".github/workflows/ci.yml") ? readFileSync(".github/workflows/ci.yml", "utf8") : ""
  ok(ci.includes("on:") && ci.includes("push") && ci.includes("pull_request"), "CI triggers on push + PR")
  ok(ci.includes("oven-sh/setup-bun@v2"), "CI sets up bun")
  ok(ci.includes("tsc --noEmit") && ci.includes("eslint src"), "CI type-checks + lints")
  for (const r of [3, 4, 5, 6, 7, 8]) {
    ok(ci.includes(`verify_round${r}.ts`), `CI runs verify_round${r}.ts`)
  }
  ok(ci.includes("prisma db push") && ci.includes("db:seed"), "CI pushes schema + seeds")
  try {
    execFileSync("python3", ["-c", "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"], { cwd: process.cwd(), stdio: "pipe" })
    ok(true, "ci.yml parses as valid YAML")
  } catch {
    ok(false, "ci.yml parses as valid YAML")
  }

  const envExample = existsSync(".env.example") ? readFileSync(".env.example", "utf8") : ""
  ok(envExample.includes("LINKEDIN_ACCESS_TOKEN=") && envExample.includes("LINKEDIN_API_URL="),
    ".env.example documents the LinkedIn adapter vars")
  const readme = existsSync("README.md") ? readFileSync("README.md", "utf8") : ""
  ok(readme.includes("LINKEDIN_ACCESS_TOKEN") && readme.includes("verify_round8.ts"),
    "README documents the adapter var + round-8 suite")

  console.log("\nDone. exitCode =", process.exitCode ?? 0)
}

main()
  .catch((e) => { console.error("SCRIPT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
