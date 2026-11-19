import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Upcoming meetings on the workspace (autopilot negotiations + manual replies).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const meetings = await db.meeting.findMany({
    where: { campaign: { project: { userId: user.id } }, status: { in: ["proposed", "confirmed"] } },
    orderBy: { startsAt: "asc" },
    take: 20,
    include: {
      lead: { select: { name: true, company: true, title: true } },
      campaign: { select: { name: true } },
    },
  })
  return Response.json({ meetings })
}
