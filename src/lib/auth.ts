import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { FREEMAIL_DOMAINS, TRIAL_CREDITS_USD } from "@/lib/constants"

export const SESSION_COOKIE = "jidout_uid"

// Work-emails-only registration gate.
export function isWorkEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase()
  if (!domain) return false
  return !FREEMAIL_DOMAINS.includes(domain)
}

export async function ensureBilling(userId: string, isNew: boolean) {
  const existing = await db.billingAccount.findUnique({ where: { userId } })
  if (existing) return existing
  return db.billingAccount.create({
    data: {
      userId,
      prepaidBalanceUsd: isNew ? TRIAL_CREDITS_USD : 0,
      transactions: isNew
        ? {
            create: {
              type: "trial",
              amountUsd: TRIAL_CREDITS_USD,
              balanceAfter: TRIAL_CREDITS_USD,
              description: "Welcome credits",
            },
          }
        : undefined,
    },
  })
}

export async function getSessionUser() {
  const jar = await cookies()
  const uid = jar.get(SESSION_COOKIE)?.value
  if (!uid) return null
  const user = await db.user.findUnique({
    where: { id: uid },
    include: {
      billing: true,
      projects: { include: { campaigns: { select: { id: true } } } },
    },
  })
  return user
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new AuthError("Not signed in")
  return user
}

export class AuthError extends Error {}

export function unauthorized() {
  return Response.json({ error: "Not signed in" }, { status: 401 })
}
