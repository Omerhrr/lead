// Pre-send mailbox verification (mirrors the verification vendors: syntax
// rules, disposable domains, role accounts, catch-all heuristics). Fully
// deterministic so E2E suites can pin outcomes: an email local part starting
// with "valid." / "risky." / "invalid." forces that verdict.
import { db } from "@/lib/db"
import { chargeFor } from "@/lib/billing-ops"
import { VERIFY_PRICE_USD } from "@/lib/constants"

export type VerifyStatus = "valid" | "risky" | "invalid"

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "temp-mail.org",
  "trashmail.com", "yopmail.com", "sharklasers.com", "throwawaymail.com",
])

const ROLE_LOCALS = new Set([
  "info", "support", "sales", "admin", "contact", "hello", "office", "team",
  "billing", "noreply", "no-reply", "help", "marketing", "jobs", "careers",
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// stable per-address hash (0..99)
function hashBucket(email: string): number {
  let h = 0
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 9973
  return h % 100
}

export function verifyEmailAddress(email: string): { status: VerifyStatus; reason: string } {
  const lower = email.trim().toLowerCase()
  const [local, domain] = lower.split("@")
  if (!local || !domain || !EMAIL_RE.test(lower)) {
    return { status: "invalid", reason: "syntax" }
  }
  // QA hooks: force a verdict deterministically
  if (local.startsWith("valid.")) return { status: "valid", reason: "verified" }
  if (local.startsWith("risky.")) return { status: "risky", reason: "catch_all" }
  if (local.startsWith("invalid.")) return { status: "invalid", reason: "mailbox_missing" }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { status: "invalid", reason: "disposable" }
  }
  if (ROLE_LOCALS.has(local)) {
    return { status: "risky", reason: "role_account" }
  }
  // synthetic reputation bucket: ~86% valid, ~8% risky (catch-all domains),
  // ~6% dead mailboxes - deterministic per address
  const b = hashBucket(lower)
  if (b < 86) return { status: "valid", reason: "verified" }
  if (b < 94) return { status: "risky", reason: "catch_all" }
  return { status: "invalid", reason: "no_mx" }
}

// Verify every unknown address on a campaign (pool + approved). Charges
// VERIFY_PRICE_USD per check against the campaign's billing account.
export async function verifyCampaignLeads(
  campaignId: string
): Promise<{ checked: number; valid: number; risky: number; invalid: number; chargedUsd: number }> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { project: { select: { userId: true } } },
  })
  if (!campaign) throw new Error("Campaign not found")
  const leads = await db.lead.findMany({
    where: { campaignId, verifyStatus: "unknown" },
    select: { id: true, email: true },
  })
  let valid = 0
  let risky = 0
  let invalid = 0
  for (const lead of leads) {
    const result = verifyEmailAddress(lead.email)
    if (result.status === "valid") valid++
    else if (result.status === "risky") risky++
    else invalid++
    await db.lead.update({
      where: { id: lead.id },
      data: {
        verifyStatus: result.status,
        verifyReason: result.reason,
        verifiedAt: new Date(),
      },
    })
  }
  const chargedUsd = Math.round(leads.length * VERIFY_PRICE_USD * 10000) / 10000
  if (leads.length > 0) {
    const account = await db.billingAccount.findUnique({
      where: { userId: campaign.project.userId },
    })
    if (account) {
      await chargeFor(
        account.id,
        chargedUsd,
        "verification",
        `${campaign.name}: verified ${leads.length} mailbox${leads.length === 1 ? "" : "es"}`,
        { campaignId }
      )
    }
  }
  return { checked: leads.length, valid, risky, invalid, chargedUsd }
}
