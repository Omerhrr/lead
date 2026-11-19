"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Wallet, CreditCard, Mail, Linkedin, Gauge, Target } from "lucide-react"
import { api, patch, post, type BillingResponse } from "../api-client"
import { money, TOPUP_PRESETS, WARM_LEAD_FEE_MIN_USD, WARM_LEAD_FEE_MAX_USD } from "@/lib/constants"
import { UsageAreaChart } from "./usage-chart"

export function BillingView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [data, setData] = useState<BillingResponse | null>(null)
  const [topup, setTopup] = useState(30)
  const [monthlyCap, setMonthlyCap] = useState(500)
  const [dailyBudget, setDailyBudget] = useState(50)
  const [pricingModel, setPricingModel] = useState("per_action")
  const [warmLeadFee, setWarmLeadFee] = useState(9)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    const d = await api<BillingResponse>("/api/billing")
    setData(d)
    setMonthlyCap(d.account.monthlyCapUsd)
    setDailyBudget(d.account.dailyBudgetUsd)
    setPricingModel(d.account.pricingModel)
    setWarmLeadFee(d.account.warmLeadFeeUsd)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  async function doTopup() {
    setBusy(true)
    try {
      await post("/api/billing/topup", { amountUsd: topup })
      await load()
      await onChanged()
      toast({ title: `Added ${money(topup)} to your balance` })
    } catch (e) {
      toast({ title: "Top-up failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  async function saveCaps() {
    setBusy(true)
    try {
      await patch("/api/billing", { monthlyCapUsd: monthlyCap, dailyBudgetUsd: dailyBudget })
      await load()
      toast({ title: "Budget caps updated" })
    } finally {
      setBusy(false)
    }
  }

  async function savePricing() {
    setBusy(true)
    try {
      await patch("/api/billing", { pricingModel, warmLeadFeeUsd: warmLeadFee })
      await load()
      await onChanged()
      toast({
        title: pricingModel === "per_result" ? "Per-result pricing on" : "Per-action pricing on",
        description:
          pricingModel === "per_result"
            ? `Every warm lead charges ${money(warmLeadFee)} once - sends still meter at ${money(data?.account.emailPriceUsd ?? 0.04)}.`
            : "Only actions are metered; no success fees.",
      })
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-muted" />
  const { account, emailsRemaining, transactions, usage } = data

  const chartData = usage.map((u) => ({
    date: u.date.slice(5),
    emails: u.emailsSent,
    replies: u.repliesReceived,
    hot: u.hotLeads,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Pay-as-you-go credits - {money(account.emailPriceUsd)} per email, no subscription.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* balance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-emerald-600" /> Prepaid balance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-4xl font-semibold tracking-tight text-emerald-700">
              {money(account.prepaidBalanceUsd)}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" /> ≈ {emailsRemaining.toLocaleString()} emails left
            </div>
            <div className="space-y-2 pt-2">
              <div className="text-sm font-medium">Add credits</div>
              <div className="flex flex-wrap gap-1.5">
                {TOPUP_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setTopup(p)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${topup === p ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    ${p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Input type="number" min={10} max={2000} value={topup} onChange={(e) => setTopup(Number(e.target.value))} className="w-24" aria-label="Top-up amount" />
                <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={doTopup}>
                  <CreditCard className="mr-2 h-3 w-3" /> Charge card
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Simulated Stripe charge •••• 4242 (Basis Theory tokenization in the real product).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* caps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="h-4 w-4 text-emerald-600" /> Budget guards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Monthly cap: {money(monthlyCap)}</Label>
              <Slider value={[monthlyCap]} min={50} max={2000} step={50} onValueChange={(v) => setMonthlyCap(v[0])} />
              <div className="text-xs text-muted-foreground">Spent this month: {money(account.spentThisMonthUsd)}</div>
            </div>
            <div className="space-y-2">
              <Label>Daily budget: {money(dailyBudget)}</Label>
              <Slider value={[dailyBudget]} min={10} max={300} step={10} onValueChange={(v) => setDailyBudget(v[0])} />
              <div className="text-xs text-muted-foreground">Spent today: {money(account.spentTodayUsd)}</div>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={saveCaps}>
              Save caps
            </Button>
            <p className="text-xs text-muted-foreground">
              Campaigns pause automatically when a cap is hit - same as their monthly_cap_usd logic.
            </p>
          </CardContent>
        </Card>

        {/* linkedin seats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Linkedin className="h-4 w-4 text-emerald-600" /> LinkedIn seats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-semibold">{account.linkedinSeats}</div>
            <div className="text-sm text-muted-foreground">
              Billed at {money(account.linkedinSeatPriceUsd)}/seat monthly when LinkedIn touches are used.
            </div>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
              included
            </Badge>
          </CardContent>
        </Card>

        {/* pricing model */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-emerald-600" /> Pricing model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPricingModel("per_action")}
                className={`rounded-xl border p-3 text-left transition ${pricingModel === "per_action" ? "border-emerald-500 bg-emerald-50/60" : "border-border hover:border-emerald-300"}`}
              >
                <div className="text-sm font-medium">Per action</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">metered sends only</div>
              </button>
              <button
                onClick={() => setPricingModel("per_result")}
                className={`rounded-xl border p-3 text-left transition ${pricingModel === "per_result" ? "border-emerald-500 bg-emerald-50/60" : "border-border hover:border-emerald-300"}`}
              >
                <div className="text-sm font-medium">Per result</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">+ success fee per warm lead</div>
              </button>
            </div>
            {pricingModel === "per_result" && (
              <div className="space-y-1.5">
                <Label htmlFor="warm-fee">Success fee per warm lead ({money(warmLeadFee)})</Label>
                <Input
                  id="warm-fee"
                  type="number"
                  min={WARM_LEAD_FEE_MIN_USD}
                  max={WARM_LEAD_FEE_MAX_USD}
                  step={1}
                  value={warmLeadFee}
                  onChange={(e) => setWarmLeadFee(Math.max(WARM_LEAD_FEE_MIN_USD, Math.min(WARM_LEAD_FEE_MAX_USD, Number(e.target.value))))}
                  className="w-28"
                />
                <p className="text-xs text-muted-foreground">
                  A warm lead is a positive reply or a booked meeting - charged once, on the moment it turns warm ($1-20 range).
                </p>
              </div>
            )}
            <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={savePricing}>
              Save pricing model
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No usage yet</div>
          ) : (
            <UsageAreaChart data={chartData} />
          )}
        </CardContent>
      </Card>

      {/* ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Credits activity</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No transactions yet</div>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-2 font-medium">When</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 text-right font-medium">Amount</th>
                    <th className="p-2 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="p-2 text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="max-w-xs truncate p-2">{t.description}</td>
                      <td className={`p-2 text-right font-medium ${t.amountUsd < 0 ? "text-destructive" : "text-emerald-700"}`}>
                        {t.amountUsd < 0 ? "-" : "+"}{money(Math.abs(t.amountUsd))}
                      </td>
                      <td className="p-2 text-right text-muted-foreground">{money(t.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
