import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ICS calendar invite for a booked meeting - drops straight into any calendar.
function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const { id } = await params
  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      lead: { select: { name: true, company: true, email: true } },
      campaign: { select: { name: true, project: { select: { userId: true, companyName: true } } } },
    },
  })
  if (!meeting || meeting.campaign.project.userId !== user.id) {
    return Response.json({ error: "Meeting not found" }, { status: 404 })
  }
  const end = new Date(meeting.startsAt.getTime() + 30 * 60 * 1000)
  const stamp = icsDate(new Date())
  const summary = `Jidout intro - ${meeting.lead.name} (${meeting.lead.company})`
  const description = `Booked via Jidout autopilot on campaign "${meeting.campaign.name}".\\nBooking link: ${meeting.bookingUrl}`
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Jidout//Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${meeting.id}@jidout`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(meeting.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${meeting.bookingUrl}`,
    `ORGANIZER;CN=${meeting.campaign.project.companyName || "Jidout"}:mailto:hello@jidout.local`,
    `ATTENDEE;CN=${meeting.lead.name}:mailto:${meeting.lead.email}`,
    `STATUS:${meeting.status === "confirmed" ? "CONFIRMED" : "TENTATIVE"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="jidout-meeting-${meeting.id.slice(0, 8)}.ics"`,
      "Cache-Control": "no-store",
    },
  })
}
