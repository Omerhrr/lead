"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Check, Linkedin, MailPlus, Trash2, UserPlus, Users } from "lucide-react"
import { api, patch, post, del, type TeamResponse } from "../api-client"

const ROLE_BADGE: Record<string, string> = {
  owner: "bg-emerald-100 text-emerald-700",
  member: "bg-sky-100 text-sky-700",
  viewer: "bg-amber-100 text-amber-700",
}

export function TeamView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<TeamResponse | null>(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [role, setRole] = useState("member")
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const d = await api<TeamResponse>("/api/team")
    setData(d)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  async function run(fn: () => Promise<unknown>, label: string, done?: string) {
    setBusy(label)
    try {
      await fn()
      await load()
      await onChanged()
      toast({ title: done ?? "Done" })
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function invite() {
    await run(
      async () => {
        await post("/api/team", { email, name, role })
        setEmail("")
        setName("")
        setRole("member")
      },
      "invite",
      "Invite sent — they can accept from this page in the demo"
    )
  }

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />
  const { owner, members, seats } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
        <p className="text-sm text-muted-foreground">
          Workspace seats with roles — collaborators can run campaigns; viewers are read-only. LinkedIn seats
          from Billing can be assigned to teammates for LinkedIn touches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-emerald-600" /> Workspace ({members.length + 1})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
            <div>
              <div className="font-medium">{owner.name ?? "Account owner"}</div>
              <div className="text-sm text-muted-foreground">{owner.email}</div>
            </div>
            <Badge className={ROLE_BADGE.owner}>owner</Badge>
          </div>

          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl border px-4 py-3">
              <div>
                <div className="font-medium">
                  {m.name}
                  {m.status === "invited" && (
                    <span className="ml-2 text-xs font-normal text-amber-600">invite pending</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{m.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {m.linkedinSeat && (
                  <Badge className="flex items-center gap-1 bg-sky-100 text-sky-700">
                    <Linkedin className="h-3 w-3" /> seat
                  </Badge>
                )}
                <Badge className={ROLE_BADGE[m.role] ?? ""}>{m.role}</Badge>
                {m.status === "invited" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => run(() => patch("/api/team", { id: m.id, action: "accept" }), m.id, "Invite accepted")}
                  >
                    <Check className="h-3.5 w-3.5" /> Accept
                  </Button>
                )}
                {!m.linkedinSeat ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null || seats.seatsAvailable < 1}
                    title={seats.seatsAvailable < 1 ? "No LinkedIn seats left — add seats in Billing" : "Assign a LinkedIn seat"}
                    onClick={() => run(() => patch("/api/team", { id: m.id, action: "seat_on" }), m.id, "LinkedIn seat assigned")}
                  >
                    <Linkedin className="h-3.5 w-3.5" /> Seat
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() => run(() => patch("/api/team", { id: m.id, action: "seat_off" }), m.id, "LinkedIn seat freed")}
                  >
                    Free seat
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  disabled={busy !== null}
                  onClick={() => run(() => del(`/api/team?id=${m.id}`), m.id, "Removed from team")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {members.length === 0 && (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              No teammates yet — invite your first collaborator below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailPlus className="h-4 w-4 text-emerald-600" /> Invite a teammate
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="tm-name">Name</Label>
            <Input id="tm-name" placeholder="Jordan Blake" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-email">Email</Label>
            <Input
              id="tm-email"
              type="email"
              placeholder="jordan@yourbrand.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tm-role">Role</Label>
            <select
              id="tm-role"
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="member">member</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          <Button disabled={busy !== null || !email.trim() || !name.trim()} onClick={invite}>
            <UserPlus className="h-4 w-4" /> Invite
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        LinkedIn seats: {seats.seatsUsed}/{seats.linkedinSeats} assigned · {seats.seatsAvailable} available ·
        extra seats are billed {`$29`}/seat monthly in Billing.
      </p>
    </div>
  )
}
