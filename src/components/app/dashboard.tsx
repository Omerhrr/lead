"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { LayoutDashboard, Layers, Inbox, Globe, Wallet, Compass, Users, LogOut, Plus } from "lucide-react"
import { api, post, type MeResponse, type OverviewResponse } from "./api-client"
import { Onboarding } from "./onboarding"
import { Overview } from "./views/overview"
import { CampaignsView } from "./views/campaigns"
import { InboxView } from "./views/inbox"
import { DomainsView } from "./views/domains"
import { BillingView } from "./views/billing"
import { ExplorerView } from "./views/explorer"
import { TeamView } from "./views/team"
import { Logo } from "./landing"
import { money } from "@/lib/constants"

type View = "overview" | "campaigns" | "inbox" | "domains" | "billing" | "explorer" | "team" | "onboarding"

const NAV: Array<{ id: View; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaigns", icon: Layers },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "domains", label: "Domains", icon: Globe },
  { id: "billing", label: "Billing", icon: Wallet },
  { id: "team", label: "Team", icon: Users },
  { id: "explorer", label: "Explorer", icon: Compass },
]

export function Dashboard({
  me,
  onSignOut,
  refreshMe,
  initialView,
}: {
  me: MeResponse
  onSignOut: () => void
  refreshMe: () => Promise<void>
  initialView?: View
}) {
  const [view, setView] = useState<View>(
    initialView ?? (me.project && me.campaignCount > 0 ? "overview" : "onboarding")
  )
  const [overview, setOverview] = useState<OverviewResponse | null>(null)
  const [balance, setBalance] = useState(me.billing?.prepaidBalanceUsd ?? 0)
  const [spentToday, setSpentToday] = useState(me.billing?.spentTodayUsd ?? 0)
  const [sending, setSending] = useState(false)
  const [pulse, setPulse] = useState<string | null>(null)
  const tickingRef = useRef(false)
  const viewRef = useRef<View>(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  const refreshOverview = useCallback(async () => {
    try {
      const data = await api<OverviewResponse>("/api/overview")
      setOverview(data)
      setBalance(data.billing.prepaidBalanceUsd)
      setSpentToday(data.billing.spentTodayUsd)
      setSending(data.campaigns.some((c) => c.sendingNow && c.state === "sending"))
    } catch {
      // ignore transient errors
    }
  }, [])

  // engine heartbeat: advances the simulation while the dashboard is open
  useEffect(() => {
    let stop = false
    async function loop() {
      while (!stop) {
        const running =
          viewRef.current !== "onboarding" &&
          (sending || viewRef.current === "inbox" || viewRef.current === "campaigns")
        if (running && !tickingRef.current) {
          tickingRef.current = true
          try {
            const res = await post<{ ok: boolean; sent?: number; replies?: number; spent?: number }>(
              "/api/tick",
              {}
            )
            if (res.sent || res.replies) {
              setPulse(
                `${res.sent ? `+${res.sent} sent` : ""}${res.sent && res.replies ? " · " : ""}${res.replies ? `+${res.replies} replies` : ""}`
              )
              setTimeout(() => setPulse(null), 4000)
              await refreshOverview()
            }
          } catch {
            // keep looping; route errors handled per-view
          }
          tickingRef.current = false
        }
        await new Promise((r) => setTimeout(r, 4000))
      }
    }
    loop()
    return () => {
      stop = true
    }
  }, [sending, refreshOverview])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      await refreshOverview()
      void cancelled // initial data load after mount
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [refreshOverview])

  async function signOut() {
    await post("/api/auth/logout", {})
    onSignOut()
  }

  const unread = overview?.unread ?? 0

  return (
    <div className="flex min-h-screen bg-background">
      {/* sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border/60 bg-sidebar md:flex">
        <div className="flex h-16 items-center px-5">
          <Logo className="text-lg" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                view === item.id
                  ? "bg-emerald-50 text-emerald-800"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.id === "inbox" && unread > 0 && (
                <span className="ml-auto rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="space-y-3 border-t border-border/60 p-4">
          <Button
            size="sm"
            variant="outline"
            className="w-full rounded-full"
            onClick={async () => {
              await refreshMe()
              setView("onboarding")
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> New campaign
          </Button>
          <div className="text-xs text-muted-foreground">
            <div className="truncate font-medium text-foreground">{me.user?.name || me.user?.email}</div>
            <div className="truncate">{me.project?.companyName || me.user?.email}</div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>

      {/* main */}
      <div className="flex min-h-screen flex-1 flex-col md:pl-56">
        {/* mobile nav */}
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/90 px-4 backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-2 overflow-x-auto">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-label={item.label}
                className={`rounded-lg p-2 ${view === item.id ? "bg-emerald-50 text-emerald-800" : "text-muted-foreground"}`}
              >
                <item.icon className="h-4 w-4" />
              </button>
            ))}
            <button onClick={signOut} aria-label="Sign out" className="rounded-lg p-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* topbar */}
        <div className="hidden h-16 items-center justify-end gap-3 border-b border-border/60 px-6 md:flex">
          {sending && (
            <span className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
              </span>
              Agent working{pulse ? ` · ${pulse}` : ""}
            </span>
          )}
          <div className="rounded-full border border-border bg-card px-4 py-1.5 text-sm">
            <span className="text-muted-foreground">Balance </span>
            <span className="font-semibold text-emerald-700">{money(balance)}</span>
            <span className="text-muted-foreground"> · spent today {money(spentToday)}</span>
          </div>
        </div>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {view === "onboarding" ? (
              <OnboardingWrapper
                domain={me.project?.companyDomain}
                hasCampaigns={(overview?.campaigns.length ?? 0) > 0}
                onDone={async () => {
                  await refreshMe()
                  await refreshOverview()
                  setView("overview")
                }}
              />
            ) : view === "overview" ? (
              <Overview data={overview} onOpenCampaign={() => setView("campaigns")} onOpenInbox={() => setView("inbox")} onRefresh={refreshOverview} />
            ) : view === "campaigns" ? (
              <CampaignsView onChanged={refreshOverview} />
            ) : view === "inbox" ? (
              <InboxView onChanged={refreshOverview} />
            ) : view === "domains" ? (
              <DomainsView onChanged={refreshOverview} />
            ) : view === "billing" ? (
              <BillingView onChanged={refreshOverview} />
            ) : view === "team" ? (
              <TeamView onChanged={refreshOverview} />
            ) : (
              <ExplorerView />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function OnboardingWrapper({
  domain,
  hasCampaigns,
  onDone,
}: {
  domain?: string
  hasCampaigns: boolean
  onDone: () => void
}) {
  return (
    <div className="-mx-4 -mt-6 sm:-mx-6 lg:-mx-8">
      <Onboarding domain={domain} hasCampaigns={hasCampaigns} onDone={onDone} />
    </div>
  )
}
