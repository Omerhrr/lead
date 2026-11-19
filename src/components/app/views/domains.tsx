"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Globe, Flame, Plus, RefreshCcw, ShieldCheck, ShoppingCart } from "lucide-react"
import { api, post, type DomainsResponse } from "../api-client"
import { money } from "@/lib/constants"

export function DomainsView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<DomainsResponse | null>(null)
  const [byod, setByod] = useState("")
  const [buyCount, setBuyCount] = useState(2)
  const [busy, setBusy] = useState<string | null>(null)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const d = await api<DomainsResponse>("/api/domains")
    setData(d)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  async function act(body: Record<string, unknown>, label: string) {
    setBusy(label)
    try {
      await post("/api/domains", body)
      await load()
      await onChanged()
      toast({ title: "Done" })
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />
  const { plan, domains } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sending domains</h1>
        <p className="text-sm text-muted-foreground">
          Domain rotation protects deliverability - the platform buys
          domains + mailboxes for you (BYOD also supported).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-emerald-600" /> Domain plan
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <PlanStat label="Target emails/day" value={plan.targetEmailsPerDay.toLocaleString()} />
            <PlanStat label="Domains needed" value={String(plan.domainsNeeded)} />
            <PlanStat
              label="Owned (active)"
              value={String(plan.owned)}
              sub={`${plan.ownedCapacity}/day capacity${plan.warming > 0 ? ` · ${plan.warming} warming` : ""}`}
            />
            <PlanStat
              label="To buy"
              value={String(plan.toBuy)}
              sub={plan.toBuy > 0 ? `${money(plan.estimatedCostUsd)} at ${money(plan.pricePerDomainUsd)}/domain` : "all set"}
              accent={plan.toBuy > 0}
            />
            <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
              <Input
                type="number"
                min={1}
                max={20}
                value={buyCount}
                onChange={(e) => setBuyCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                className="w-20"
                aria-label="Number of domains"
              />
              <Button
                size="sm"
                className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                disabled={busy !== null || plan.toBuy === 0}
                onClick={() => act({ action: "buy", count: buyCount }, "buy")}
              >
                {busy === "buy" ? (
                  <RefreshCcw className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <ShoppingCart className="mr-2 h-3 w-3" />
                )}
                Buy {buyCount} domain{buyCount > 1 ? "s" : ""} + {buyCount * plan.mailboxesPerDomain} mailboxes
              </Button>
              <span className="text-xs text-muted-foreground">
                {money(plan.pricePerDomainUsd)} per domain · {plan.emailsPerDomainDay} emails/day each
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bring your own domain</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="byod">Domain</Label>
              <Input
                id="byod"
                placeholder="mail.yourbrand.com"
                value={byod}
                onChange={(e) => setByod(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full rounded-full"
              disabled={busy !== null || !byod.trim()}
              onClick={() => act({ action: "byod", domain: byod.trim() }, "byod").then(() => setByod(""))}
            >
              <Plus className="mr-2 h-3 w-3" /> Add domain
            </Button>
            <p className="text-xs text-muted-foreground">
              Free - you manage DNS. Verify to activate the domain for sending.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your domains ({domains.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {domains.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No domains yet - buy a starter pack above to unlock outreach.
            </div>
          )}
          {domains.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.domain}</div>
                <div className="text-xs text-muted-foreground">
                  {d.mailboxes} mailboxes · {d.emailsPerDay} emails/day · {d.source === "byod" ? "your domain" : "platform-bought"}
                </div>
                {d.status === "warming" && (
                  <div className="mt-2 flex max-w-md items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, Math.round((d.emailsPerDay / plan.emailsPerDomainDay) * 100))}%` }}
                      />
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                      warming day {d.warmedDays} · {d.emailsPerDay}/{plan.emailsPerDomainDay} emails/day
                    </span>
                  </div>
                )}
              </div>
              {d.status === "active" ? (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <ShieldCheck className="mr-1 h-3 w-3" /> active
                </Badge>
              ) : (
                <>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                    <Flame className="mr-1 h-3 w-3" />
                    {d.status === "pending_dns" ? "pending DNS" : "warming"}
                  </Badge>
                  {d.source === "byod" && (
                    <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null}
                      onClick={() => act({ action: "verify", domainId: d.id }, "verify")}>
                      Verify DNS
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function PlanStat({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-4 ${accent ? "bg-emerald-50" : "bg-secondary"}`}>
      <div className={`text-xl font-semibold ${accent ? "text-emerald-700" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{sub}</div>}
    </div>
  )
}
