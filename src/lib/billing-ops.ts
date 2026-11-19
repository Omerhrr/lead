// Shared metering operations used by the engine, the domain store and the
// verification flow. One row in CreditTransaction (optionally attributed to a
// campaign for cost-per-lead reporting) plus the daily usage aggregation.
import { db } from "@/lib/db"

function todayStr(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

export async function chargeFor(
  accountId: string,
  costUsd: number,
  type: string,
  description: string,
  opts: { emails?: number; linkedin?: number; campaignId?: string } = {}
) {
  const account = await db.billingAccount.findUnique({ where: { id: accountId } })
  if (!account) return null
  const balanceAfter = account.prepaidBalanceUsd - costUsd
  await db.billingAccount.update({
    where: { id: account.id },
    data: {
      prepaidBalanceUsd: balanceAfter,
      spentTodayUsd: account.spentTodayUsd + costUsd,
      spentThisMonthUsd: account.spentThisMonthUsd + costUsd,
    },
  })
  const tx = await db.creditTransaction.create({
    data: {
      accountId: account.id,
      type,
      amountUsd: -costUsd,
      balanceAfter,
      description,
      campaignId: opts.campaignId ?? null,
    },
  })
  const date = todayStr()
  const emails = opts.emails ?? 0
  const linkedin = opts.linkedin ?? 0
  const existing = await db.usageDaily.findUnique({
    where: { accountId_date: { accountId: account.id, date } },
  })
  if (existing) {
    await db.usageDaily.update({
      where: { id: existing.id },
      data: {
        emailsSent: existing.emailsSent + emails,
        linkedinTouches: existing.linkedinTouches + linkedin,
        spendUsd: existing.spendUsd + costUsd,
      },
    })
  } else {
    await db.usageDaily.create({
      data: {
        accountId: account.id,
        date,
        emailsSent: emails,
        linkedinTouches: linkedin,
        spendUsd: costUsd,
      },
    })
  }
  return { balanceAfter, tx }
}

// Campaign-attributed spend from the ledger (per-campaign cost reporting).
export async function campaignSpendUsd(campaignId: string): Promise<number> {
  const rows = await db.creditTransaction.aggregate({
    where: { campaignId, amountUsd: { lt: 0 } },
    _sum: { amountUsd: true },
  })
  return Math.round(Math.abs(rows._sum.amountUsd ?? 0) * 10000) / 10000
}
