// Seed scratch data for the round-8 screenshots: a campaign with LinkedIn-
// profiled leads, ticked until the engine delivers a LinkedIn touch through
// the real adapter (dev server must run with LINKEDIN_ACCESS_TOKEN set and
// LINKEDIN_API_URL pointed at scripts/linkedin_mock.py on :8788).
// Run: bun scripts/seed_round8_shots.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const BASE = "http://localhost:3000"

async function main() {
  // tick requires a session
  const login = await fetch(BASE + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "riley@brightpath.io" }),
  })
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]
  if (!cookie) {
    console.error("login failed")
    process.exitCode = 1
    return
  }
  const project = await db.project.findFirst({ where: { user: { email: "riley@brightpath.io" } } })!
  const template = await db.campaign.findFirst({ where: { projectId: project!.id } })!

  // fresh scratch campaign (name doubles as the UI handle for the screenshot)
  await db.campaign.deleteMany({ where: { name: "Round8 LinkedIn adapter demo" } })
  const c = await db.campaign.create({
    data: {
      projectId: project!.id,
      name: "Round8 LinkedIn adapter demo",
      offer: template!.offer, customerProblem: template!.customerProblem,
      targetRole: template!.targetRole, targetGeography: template!.targetGeography,
      targetCompanySize: template!.targetCompanySize,
      maxTouches: 5, state: "sending", sendingNow: true,
      autopilotEnabled: false, autoReplyEnabled: false,
      linkedinEnabled: true,
      copySubject: "Quick question about {{company}}",
      copyBody: "Hi {{first_name}}, quick note for {{company}}.",
    },
  })
  for (let i = 0; i < 12; i++) {
    await db.lead.create({
      data: {
        campaignId: c.id, name: `Jordan Blake ${i}`, title: "VP Growth", company: `BrightPath Demo ${i}`,
        companyDomain: `demo-${i}.example.com`, industry: "software", companySize: "51-200",
        country: "United States", email: `j${i}@demo-${i}.example.com`, score: 70,
        status: "approved", linkedinUrl: `https://linkedin.com/in/demo-${i}`,
        reasons: "scaling outbound", nextTouchAt: new Date(Date.now() - 60_000),
      },
    })
  }

  // tick until a delivered LinkedIn touch exists (max ~40s)
  for (let i = 0; i < 10; i++) {
    await db.lead.updateMany({
      where: { campaignId: c.id, convStatus: null, touchCount: { lt: 5 } },
      data: { nextTouchAt: new Date(Date.now() - 60_000) },
    })
    const t0 = Date.now()
    const tr = await fetch(BASE + "/api/tick", { method: "POST", headers: { "Content-Type": "application/json", cookie }, body: "{}" })
    const trBody = await tr.text().catch(() => "")
    const n = await db.message.count({ where: { campaignId: c.id, channel: "linkedin", deliveryStatus: "delivered" } })
    const anyLi = await db.message.count({ where: { campaignId: c.id, channel: "linkedin" } })
    const msgs = await db.message.count({ where: { campaignId: c.id } })
    console.log(`tick ${i + 1}: http ${tr.status} in ${Date.now() - t0}ms | messages ${msgs} | linkedin(any) ${anyLi} | delivered ${n} | ${trBody.slice(0, 80)}`)
    if (n > 0) {
      console.log(`delivered LinkedIn touches: ${n} (after tick ${i + 1})`)
      return
    }
  }
  console.error("no delivered LinkedIn touch produced — check the mock + server env")
  process.exitCode = 1
}

main().finally(() => db.$disconnect())
