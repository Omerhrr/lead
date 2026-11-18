import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"
import { logAudit } from "@/lib/audit"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const account = await db.billingAccount.findUnique({ where: { userId: user.id } })
  if (!account) return Response.json({ error: "No billing account" }, { status: 400 })

  const transactions = await db.creditTransaction.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  })
  const usage = await db.usageDaily.findMany({
    where: { accountId: account.id },
    orderBy: { date: "asc" },
    take: 30,
  })

  const emailsRemaining = Math.floor(account.prepaidBalanceUsd / (account.emailPriceUsd || 0.04))

  return Response.json({
    account: {
      prepaidBalanceUsd: account.prepaidBalanceUsd,
      spentTodayUsd: account.spentTodayUsd,
      spentThisMonthUsd: account.spentThisMonthUsd,
      monthlyCapUsd: account.monthlyCapUsd,
      dailyBudgetUsd: account.dailyBudgetUsd,
      emailPriceUsd: account.emailPriceUsd,
      linkedinSeats: account.linkedinSeats,
      linkedinSeatPriceUsd: account.linkedinSeatPriceUsd,
      postpaidEnabled: account.postpaidEnabled,
    },
    emailsRemaining,
    transactions,
    usage,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const account = await db.billingAccount.findUnique({ where: { userId: user.id } })
  if (!account) return Response.json({ error: "No billing account" }, { status: 400 })

  const data: Record<string, number | boolean> = {}
  if (typeof body?.monthlyCapUsd === "number") data.monthlyCapUsd = Math.max(10, Math.min(5000, body.monthlyCapUsd))
  if (typeof body?.dailyBudgetUsd === "number") data.dailyBudgetUsd = Math.max(1, Math.min(500, body.dailyBudgetUsd))
  if (typeof body?.linkedinSeats === "number") data.linkedinSeats = Math.max(0, Math.min(10, Math.round(body.linkedinSeats)))
  if (typeof body?.postpaidEnabled === "boolean") data.postpaidEnabled = body.postpaidEnabled

  await db.billingAccount.update({ where: { id: account.id }, data })
  if (typeof data.linkedinSeats === "number" && data.linkedinSeats !== account.linkedinSeats) {
    await logAudit({
      ownerId: user.id,
      actorEmail: user.email,
      actorName: user.name ?? "",
      action: "billing.seats_changed",
      target: "LinkedIn seats",
      detail: `${account.linkedinSeats} -> ${data.linkedinSeats} seat${data.linkedinSeats === 1 ? "" : "s"}`,
    })
  }
  return Response.json({ ok: true })
}
