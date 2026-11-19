"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Globe, Flame, Plus, RefreshCcw, ShieldCheck, ShoppingCart, Store, CheckCircle2, XCircle, CircleDashed, Zap } from "lucide-react"
import { api, post, type DomainsResponse, type StoreListing } from "../api-client"
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
  const { plan, domains, store } = data

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sending domains</h1>
        <p className="text-sm text-muted-foreground">
          Domain rotation protects deliverability - buy fresh domains (they warm
          over days), rent pre-warmed ones ready immediately, or bring your own.
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
          <CardTitle className="flex items-center gap-2 text-base">
            <Store className="h-4 w-4 text-emerald-600" /> Pre-warmed domain store
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <Zap className="mr-1 h-3 w-3" /> ready to send on day one
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {store.map((s) => (
              <StoreCard key={s.name} listing={s} busy={busy === `rent-${s.name}`}
                onRent={() => act({ action: "rent_prewarmed", name: s.name }, `rent-${s.name}`)} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your domains ({domains.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {domains.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No domains yet - rent a pre-warmed one above or buy a starter pack.
            </div>
          )}
          {domains.map((d) => (
            <div key={d.id} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.domain}</span>
                    {d.preWarmed && (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        <Zap className="mr-1 h-3 w-3" /> pre-warmed · {d.reputation}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.mailboxes} mailboxes · {d.emailsPerDay} emails/day · {d.source === "byod" ? "your domain" : d.preWarmed ? "rented from the store" : "platform-bought"}
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
              <DnsAuthRow domain={d} busy={busy !== null} onCheck={() => act({ action: "dns_check", domainId: d.id }, `dns-${d.id}`)} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function DnsAuthRow({ domain, busy, onCheck }: { domain: DomainsResponse["domains"][number]; busy: boolean; onCheck: () => void }) {
  const auth = [
    { label: "SPF", status: domain.spfStatus, rec: domain.dnsRecords?.spf },
    { label: "DKIM", status: domain.dkimStatus, rec: domain.dnsRecords?.dkim },
    { label: "DMARC", status: domain.dmarcStatus, rec: domain.dnsRecords?.dmarc },
  ]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Authentication</span>
      {auth.map((a) => (
        <span
          key={a.label}
          title={`${a.rec?.host ?? ""}\n${a.rec?.value ?? ""}`}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
            a.status === "pass"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : a.status === "fail"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
        >
          {a.status === "pass" ? <CheckCircle2 className="h-3 w-3" /> : a.status === "fail" ? <XCircle className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
          {a.label}
        </span>
      ))}
      <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-muted-foreground" disabled={busy}
        onClick={onCheck}>
        <RefreshCcw className="mr-1 h-3 w-3" /> Check DNS
      </Button>
      {domain.dnsCheckedAt && (
        <span className="text-[11px] text-muted-foreground">
          checked {new Date(domain.dnsCheckedAt).toLocaleTimeString()}
        </span>
      )}
    </div>
  )
}

function StoreCard({ listing, busy, onRent }: { listing: StoreListing; busy: boolean; onRent: () => void }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="truncate font-medium">{listing.name}</span>
        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
          {listing.reputation} rep
        </Badge>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        warmed {listing.warmedDays} days · {listing.emailsSent.toLocaleString()} sends · mailboxes {listing.mailboxAgeDays}d old
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold">{money(listing.priceUsd)}</span>
        <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={busy || listing.rented}
          onClick={onRent}>
          {listing.rented ? "Rented" : "Rent now"}
        </Button>
      </div>
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
