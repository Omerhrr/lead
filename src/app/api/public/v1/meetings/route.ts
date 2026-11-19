import { db } from "@/lib/db"
import { authenticateApiKey } from "@/lib/api-auth"

export const dynamic = "force-dynamic"

// GET /api/public/v1/meetings - upcoming meetings on the workspace.
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req)
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status, headers: auth.headers })
  }
  const meetings = await db.meeting.findMany({
    where: { campaign: { project: { userId: auth.userId } }, status: { in: ["proposed", "confirmed"] } },
    orderBy: { startsAt: "asc" },
    take: 50,
    include: {
      lead: { select: { name: true, company: true, email: true } },
      campaign: { select: { name: true } },
    },
  })
  return Response.json(
    {
      meetings: meetings.map((m) => ({
        id: m.id,
        startsAt: m.startsAt,
        status: m.status,
        source: m.source,
        bookingUrl: m.bookingUrl,
        lead: m.lead,
        campaign: m.campaign.name,
        createdAt: m.createdAt,
      })),
      count: meetings.length,
    },
    { headers: auth.headers }
  )
}
