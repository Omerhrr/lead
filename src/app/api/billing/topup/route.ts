import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Simulated card charge - stands in for Stripe + Basis Theory tokenization.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const body = await req.json().catch(() => null)
  const amount = Number(body?.amountUsd)
  if (!Number.isFinite(amount) || amount < 10 || amount > 2000) {
    return Response.json({ error: "Amount must be between $10 and $2000" }, { status: 400 })
  }
  const account = await db.billingAccount.findUnique({ where: { userId: user.id } })
  if (!account) return Response.json({ error: "No billing account" }, { status: 400 })

  const balanceAfter = account.prepaidBalanceUsd + amount
  await db.billingAccount.update({
    where: { id: account.id },
    data: { prepaidBalanceUsd: balanceAfter },
  })
  await db.creditTransaction.create({
    data: {
      accountId: account.id,
      type: "topup",
      amountUsd: amount,
      balanceAfter,
      description: `Card charge •••• 4242 - prepaid credits`,
    },
  })
  return Response.json({ ok: true, balanceAfter })
}
