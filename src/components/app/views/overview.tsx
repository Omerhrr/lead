"use client"

import { useState } from "react"
import type { OverviewResponse } from "../api-client"
import { post } from "../api-client"
import { money, STATE_LABELS, stateBadgeClass } from "@/lib/constants"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { UsageAreaChart } from "./usage-chart"
import {
  Mail, Flame, CalendarCheck, Reply, TrendingDown, Activity, ArrowRight, BarChart3,
} from "lucide-react"

export function Overview({
  data,
  onOpenCampaign,
  onOpenInbox,
  onRefresh,
}: {
  data: OverviewResponse | null
  onOpenCampaign: () => void
  onOpenInbox: () => void
  onRefresh?: () => Promise<void> | void
}) {
  const [digestBusy, setDigestBusy] = useState(false)
  const { toast } = useToast()

  async function toggleDigest() {
    if (!data) return
    const next = data.report.cadence === "weekly" ? "off" : "weekly"
    setDigestBusy(true)
    try {
      await post("/api/overview", { cadence: next })
      await onRefresh?.()
      toast({
        title: next === "weekly" ? "Weekly digest enabled" : "Weekly digest paused",
        description:
          next === "weekly"
            ? "The first digest lands on the next engine tick; later ones follow the demo-compressed week."
            : "Scheduled digest emails are stopped.",
      })
    } catch (e) {
      toast({ title: "Failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setDigestBusy(false)
    }
  }
  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    )
  }

  const s = data.stats
  const usage = data.usage
  const chartData = usage.map((u) => ({
    date: u.date.slice(5),
    emails: u.emailsSent,
    replies: u.repliesReceived,
    hot: u.hotLeads,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">Your agent&apos;s outbound performance at a glance</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={onOpenCampaign}>
          <ArrowRight className="mr-2 h-4 w-4" /> Go to campaigns
        </Button>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Mail} label="Emails sent" value={s.emailsSent.toLocaleString()} sub={`${s.linkedinTouches} LinkedIn touches`} />
        <StatCard icon={Reply} label="Replies" value={String(s.replies)} sub={`${(s.replyRate * 100).toFixed(1)}% reply rate`} />
        <StatCard icon={Flame} label="Hot leads" value={String(s.hotLeads)} sub={`${s.approved} leads approved`} accent />
        <StatCard icon={CalendarCheck} label="Meetings booked" value={String(s.booked)} sub={`CPL ${money(s.cpl)}`} accent />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* usage chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Daily outreach</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
                No sends yet - approve a campaign and the agent will start working
              </div>
            ) : (
              <UsageAreaChart data={chartData} />
            )}
          </CardContent>
        </Card>

        {/* hot leads */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Hot leads</CardTitle>
            <Button variant="ghost" size="sm" onClick={onOpenInbox}>Inbox</Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.hotLeads.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No hot leads yet. The agent flags leads the moment they show intent.
              </div>
            ) : (
              data.hotLeads.map((l) => (
                <button
                  key={l.id}
                  onClick={onOpenInbox}
                  className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.title} · {l.company}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-700">{l.score}</div>
                    {l.convStatus === "booked" && <div className="text-xs text-emerald-700">booked</div>}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* campaigns */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.campaigns.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No campaigns yet</div>
            ) : (
              data.campaigns.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-4">
                  <Badge variant="outline" className={stateBadgeClass(c.state)}>
                    {STATE_LABELS[c.state] ?? c.state}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.nextAction}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* activity */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.activity.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Nothing yet</div>
            ) : (
              data.activity.slice(0, 8).map((m) => (
                <div key={m.id} className="flex gap-2 border-b border-border/40 pb-2 last:border-0">
                  <span
                    className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                      m.direction === "out" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <span className="font-medium">{m.lead?.name ?? "Lead"}</span>
                    <span className="text-muted-foreground">
                      {m.direction === "out"
                        ? m.kind === "autopilot"
                          ? " · autopilot replied"
                          : " · sent email"
                        : " · replied"}
                    </span>
                    <div className="truncate text-xs text-muted-foreground">{m.body.slice(0, 60)}</div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* scheduled digest */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Weekly report digest</div>
            <div className="text-xs text-muted-foreground">
              {data.report.cadence === "weekly"
                ? `On - ${data.report.reportCount} digest${data.report.reportCount === 1 ? "" : "s"} sent${
                    data.report.lastReportAt
                      ? ` · last ${new Date(data.report.lastReportAt).toLocaleTimeString()}`
                      : " · first one fires on the next tick"
                  }`
                : "Off - a funnel summary of every campaign, emailed to you weekly"}
            </div>
          </div>
          <Button
            size="sm"
            variant={data.report.cadence === "weekly" ? "outline" : "default"}
            className={data.report.cadence === "weekly" ? "rounded-full" : "rounded-full bg-emerald-600 hover:bg-emerald-700"}
            disabled={digestBusy}
            onClick={toggleDigest}
          >
            {data.report.cadence === "weekly" ? "Pause digest" : "Enable weekly digest"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
        <TrendingDown className="h-4 w-4 text-emerald-600" />
        Pay-as-you-go: {money(data.billing.emailPriceUsd)} per email · {s.emailsPer30} emails per $30 · balance {money(data.billing.prepaidBalanceUsd)}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = false,
}: {
  icon: typeof Mail
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ? "bg-emerald-50 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground/80">{sub}</div>
    </div>
  )
}
