import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) return Response.json({ user: null })
  const project = user.projects[0] ?? null
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      viaLinkedin: user.viaLinkedin,
    },
    billing: user.billing,
    project: project
      ? {
          id: project.id,
          companyDomain: project.companyDomain,
          companyName: project.companyName,
          senderName: project.senderName,
          senderTitle: project.senderTitle,
        }
      : null,
    campaignCount: project ? project.campaigns.length : 0,
  })
}
