// Round 9+10 demo-state seed: verified pool badges, DNS-authenticated domains,
// a rented pre-warmed domain, an upcoming meeting, a workspace API key and
// per-campaign CPL attribution - everything the evidence screenshots show.
// Run: bun scripts/seed_round10_shots.ts
import { PrismaClient } from "@prisma/client"
import { createHash } from "crypto"
import { expectedRecords } from "../src/lib/dns-auth"
import { DOMAIN_PRICE_USD, PREWARMED_STORE } from "../src/lib/constants"

const db = new PrismaClient()

async function main() {
  const user = await db.user.findUnique({ where: { email: "riley@brightpath.io" } })
  if (!user) throw new Error("demo user missing")
  const project = await db.project.findFirst({ where: { userId: user.id } })
  if (!project) throw new Error("demo project missing")

  // QA determinism: clear the daily spend accumulator and restore a sane
  // demo balance (suite runs meter real charges against the trial credits)
  const account0 = await db.billingAccount.findUnique({ where: { userId: user.id } })!
  await db.billingAccount.updateMany({
    where: { userId: user.id },
    data: {
      spentTodayUsd: 0,
      spentTodayDate: new Date().toISOString().slice(0, 10),
      prepaidBalanceUsd: account0.prepaidBalanceUsd < 10 ? 30 : account0.prepaidBalanceUsd,
    },
  })
  if (account0.prepaidBalanceUsd < 10) {
    await db.creditTransaction.create({
      data: {
        accountId: account0.id,
        type: "topup",
        amountUsd: 30 - account0.prepaidBalanceUsd,
        balanceAfter: 30,
        description: "QA demo top-up (suite runs metered real charges)",
      },
    })
  }

  // 1) campaign language variety + verification on the lead pool
  const campaigns = await db.campaign.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
  })
  const main = campaigns[0]
  if (main) {
    await db.campaign.update({ where: { id: main.id }, data: { language: "German" } })
    const pool = await db.lead.findMany({ where: { campaignId: main.id, status: "pool" } })
    const verdicts = ["valid", "valid", "risky", "valid", "invalid", "valid", "risky", "valid"]
    for (let i = 0; i < pool.length; i++) {
      const v = verdicts[i % verdicts.length]
      await db.lead.update({
        where: { id: pool[i].id },
        data: {
          verifyStatus: v,
          verifyReason: v === "valid" ? "verified" : v === "risky" ? "catch_all" : "no_mx",
          verifiedAt: new Date(),
        },
      })
    }
    console.log(`main campaign "${main.name}": language German, ${pool.length} pool leads verified`)
  }

  // 1b) a pool-ready demo campaign: fresh pool, auto-verified, language set
  const demoExists = await db.campaign.findFirst({ where: { projectId: project.id, name: "Dental SaaS - Q4 pipeline" } })
  const demo = demoExists ?? await db.campaign.create({
    data: {
      projectId: project.id,
      name: "Dental SaaS - Q4 pipeline",
      offer: "AI receptionist that answers missed calls and books chair time",
      customerProblem: "Missed calls mean lost bookings and empty chairs",
      targetRole: "Owner", targetGeography: "United States", targetCompanySize: "1-10",
      keywords: "dental clinics, receptionist, scheduling",
      language: "Japanese",
      verifyPolicy: "skip_invalid",
      filters: JSON.stringify({ industries: ["dental"], titles: ["owner"], geography: ["United States"], companySize: ["1-10"], keywords: [] }),
      copySubject: "front desk after hours",
      copyBody: "Hi {{first_name}},\n\nI noticed {{company}} - {{hook}}. We pick up every missed call and book the slot before the patient hangs up.\n\nWorth a 2-minute look?\n\n{{sender_name}}",
      copyWarnings: JSON.stringify([]),
      state: "draft",
      nextAction: "AI is generating your lead pool...",
    },
  })
  {
    const { generateLeadPool } = await import("../src/lib/engine")
    if (!demoExists) await generateLeadPool(demo.id)
    // spread realistic verdicts across the pool so the review screen shows
    // all three badge types (the auto-verify hash leans valid-heavy)
    const pool = await db.lead.findMany({ where: { campaignId: demo.id, status: "pool" } })
    const verdicts = ["valid", "valid", "risky", "valid", "invalid", "valid", "risky", "valid"]
    for (let i = 0; i < pool.length; i++) {
      const v = verdicts[i % verdicts.length]
      await db.lead.update({
        where: { id: pool[i].id },
        data: {
          verifyStatus: v,
          verifyReason: v === "valid" ? "verified" : v === "risky" ? "catch_all" : "no_mx",
          verifiedAt: new Date(),
        },
      })
    }
    console.log(`demo campaign: ${pool.length} pool leads with verified mix, language Japanese`)
  }

  // 2) DNS authentication on the owned domains (pass) + expected records
  const domains = await db.sendingDomain.findMany({ where: { projectId: project.id } })
  for (const d of domains) {
    await db.sendingDomain.update({
      where: { id: d.id },
      data: {
        spfStatus: "pass",
        dkimStatus: "pass",
        dmarcStatus: "pass",
        dnsRecords: JSON.stringify(expectedRecords(d.domain)),
        dnsCheckedAt: new Date(),
      },
    })
  }
  console.log(`${domains.length} domains authenticated (spf/dkim/dmarc pass)`)

  // 3) one rented pre-warmed domain in "your domains" (skip if present)
  const listing = PREWARMED_STORE[1] // brightsend.co
  const existing = await db.sendingDomain.findFirst({ where: { projectId: project.id, domain: listing.name } })
  if (!existing) {
    await db.sendingDomain.create({
      data: {
        projectId: project.id,
        domain: listing.name,
        source: "platform",
        status: "active",
        emailsPerDay: 40,
        warmedDays: listing.warmedDays,
        mailboxes: 2,
        preWarmed: true,
        reputation: listing.reputation,
        spfStatus: "pass",
        dkimStatus: "pass",
        dmarcStatus: "pass",
        dnsRecords: JSON.stringify(expectedRecords(listing.name)),
        dnsCheckedAt: new Date(),
      },
    })
    await db.creditTransaction.create({
      data: {
        accountId: (await db.billingAccount.findUnique({ where: { userId: user.id } }))!.id,
        type: "prewarmed_rent",
        amountUsd: -DOMAIN_PRICE_USD,
        balanceAfter: (await db.billingAccount.findUnique({ where: { userId: user.id } }))!.prepaidBalanceUsd,
        description: `Pre-warmed domain - ${listing.name} (reputation ${listing.reputation}, ${listing.warmedDays} warming days)`,
      },
    })
    console.log(`rented ${listing.name} from the store for the demo`)
  }

  // 4) an upcoming confirmed meeting on the main campaign (overview card)
  const meetingCount = await db.meeting.count({ where: { campaign: { projectId: project.id } } })
  if (meetingCount === 0 && main) {
    const lead = await db.lead.findFirst({ where: { campaignId: main.id, status: "approved" } })
    if (lead) {
      await db.meeting.create({
        data: {
          campaignId: main.id,
          leadId: lead.id,
          startsAt: new Date(Date.now() + 26 * 3600 * 1000),
          status: "confirmed",
          bookingUrl: project.bookingUrl,
          source: "autopilot",
        },
      })
      await db.lead.update({ where: { id: lead.id }, data: { convStatus: "booked", isHot: true, sentiment: "interested" } })
      console.log(`meeting seeded with ${lead.name}`)
    }
  }

  // 5) a workspace API key for the Developers view
  const zapierKey = await db.apiKey.findFirst({ where: { userId: user.id, name: "Zapier integration" } })
  if (!zapierKey) {
    const raw = "jd_live_seeddemo0000000000000000000000000000000000000000000000000000"
    await db.apiKey.create({
      data: {
        userId: user.id,
        name: "Zapier integration",
        prefix: raw.slice(0, 16),
        hash: createHash("sha256").update(raw).digest("hex"),
      },
    })
    console.log("demo API key created (Zapier integration)")
  }

  // 6) per-result pricing toggle shown in billing
  await db.billingAccount.updateMany({ where: { userId: user.id }, data: { warmLeadFeeUsd: 9 } })

  const summary = await db.campaign.findMany({
    where: { projectId: project.id },
    select: { name: true, state: true, language: true, _count: { select: { leads: true, meetings: true } } },
  })
  console.log(JSON.stringify(summary, null, 1))
}

main()
  .catch((e) => { console.error("SEED ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
