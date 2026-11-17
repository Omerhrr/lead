import { tick } from "@/lib/engine"
import { getSessionUser, unauthorized } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST() {
  const user = await getSessionUser()
  if (!user) return unauthorized()
  const pulse = await tick(user.id)
  return Response.json(pulse)
}
