// Workspace audit trail — every mutating action across team, campaigns and
// billing writes one AuditEvent row owned by the account owner. Fire-and-
// forget: audit logging must never break the action it records.
import { db } from "@/lib/db"

export type AuditAction =
  | "team.invited"
  | "team.accepted"
  | "team.role_changed"
  | "team.seat_assigned"
  | "team.seat_freed"
  | "team.removed"
  | "campaign.created"
  | "campaign.updated"
  | "billing.seats_changed"

export async function logAudit(input: {
  ownerId: string
  actorEmail: string
  actorName: string
  action: AuditAction
  target?: string
  detail?: string
}) {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.ownerId,
        actorEmail: input.actorEmail,
        actorName: input.actorName || input.actorEmail,
        action: input.action,
        target: input.target ?? null,
        detail: input.detail ?? null,
      },
    })
  } catch {
    // never let the audit trail break the action it records
  }
}
