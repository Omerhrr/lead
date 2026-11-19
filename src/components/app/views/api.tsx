"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { KeyRound, Plus, Trash2, Copy, BookOpen, ShieldCheck } from "lucide-react"
import { api, del, post, type ApiKeysResponse, type ApiKeyRow } from "../api-client"
import { money } from "@/lib/constants"

export function ApiView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<ApiKeysResponse | null>(null)
  const [name, setName] = useState("")
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const d = await api<ApiKeysResponse>("/api/apikeys")
    setData(d)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createKey() {
    setBusy("create")
    try {
      const r = await post<{ key: { raw: string; name: string } }>("/api/apikeys", { name: name.trim() || "Untitled key" })
      setCreatedKey(r.key.raw)
      setName("")
      await load()
      await onChanged()
    } catch (e) {
      toast({ title: "Could not create the key", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function revokeKey(id: string) {
    setBusy(id)
    try {
      await del(`/api/apikeys?id=${id}`)
      await load()
      toast({ title: "Key revoked" })
    } finally {
      setBusy(null)
    }
  }

  function copyKey() {
    if (!createdKey) return
    navigator.clipboard?.writeText(createdKey)
    toast({ title: "Copied to clipboard" })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Developers</h1>
        <p className="text-sm text-muted-foreground">
          Read-only REST API over your workspace: campaigns, leads (with mailbox
          verification), and meetings. Bearer keys, 60 requests/min per key.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-emerald-600" /> API keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                placeholder="Zapier integration"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-64"
              />
            </div>
            <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={busy !== null} onClick={createKey}>
              {busy === "create" ? "Creating..." : (<><Plus className="mr-2 h-3 w-3" /> Create key</>)}
            </Button>
          </div>

          {createdKey && (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> Copy this key now - it is shown only once
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs">{createdKey}</code>
                <Button size="sm" variant="outline" className="rounded-full" onClick={copyKey}>
                  <Copy className="mr-2 h-3 w-3" /> Copy
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setCreatedKey(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {(!data || data.keys.length === 0) && (
              <div className="py-6 text-center text-sm text-muted-foreground">No keys yet - create one to call the API.</div>
            )}
            {data?.keys.map((k: ApiKeyRow) => (
              <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {k.name}
                    {k.revokedAt ? (
                      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">revoked</Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">active</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <code>{k.prefix}...</code> · created {new Date(k.createdAt).toLocaleDateString()}
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : " · never used"}
                  </div>
                </div>
                {!k.revokedAt && (
                  <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground hover:text-destructive"
                    disabled={busy === k.id} onClick={() => revokeKey(k.id)}>
                    <Trash2 className="mr-1 h-3 w-3" /> Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-emerald-600" /> API docs (v1)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            All endpoints are GET-only and scoped to your workspace. Authentication:{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">Authorization: Bearer jd_live_...</code>.
            Rate limit headers: X-RateLimit-Limit / Remaining / Reset (429 past 60/min).
          </p>
          <div className="space-y-3">
            {[
              ["GET /api/public/v1/campaigns", "All campaigns with funnel stats, spend and cost per warm lead"],
              ["GET /api/public/v1/campaigns/{id}", "One campaign: pool/approved/hot/booked counts, channel mix, CPL"],
              ["GET /api/public/v1/leads?campaignId=&status=&verify=&take=", "Leads with verification verdicts (valid/risky/invalid) and warm flags"],
              ["GET /api/public/v1/meetings", "Upcoming meetings with booking links"],
            ].map(([ep, desc]) => (
              <div key={ep} className="rounded-xl border border-border p-3">
                <code className="text-xs font-semibold text-emerald-700">{ep}</code>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium">Example</div>
            <pre className="overflow-x-auto rounded-xl bg-secondary p-3 font-mono text-xs leading-relaxed">
{`curl -H "Authorization: Bearer jd_live_YOUR_KEY" \\
  https://your-jidout-host/api/public/v1/campaigns`}
            </pre>
          </div>
          <p className="text-xs text-muted-foreground">
            Metering note: the API is free; outreach spend is charged per email ({money(0.04)}), LinkedIn touch
            ({money(0.12)}) and optional per-warm-lead success fee exactly as the dashboard runs it.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
