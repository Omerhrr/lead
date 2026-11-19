import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET /api/audit?limit=50 - recent workspace activity, newest first.
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const limitParam = Number(new URL(req.url).searchParams.get("limit") ?? 50)
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(200, limitParam)) : 50
  const events = await db.auditEvent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return Response.json({ events })
}
