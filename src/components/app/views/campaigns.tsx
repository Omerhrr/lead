"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, Play, Square, Pause, Archive, RotateCcw, Sparkles, CheckCheck,
  Flame, Mail, Linkedin, XCircle, CalendarCheck, ThumbsUp, ThumbsDown,
} from "lucide-react"
import { api, patch, post, type CampaignDetail, type CampaignListItem, type Lead, type MessageRow } from "../api-client"
import { STATE_LABELS, stateBadgeClass, money } from "@/lib/constants"

export function CampaignsView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api<{ campaigns: CampaignListItem[] }>("/api/campaigns")
      setCampaigns(data.campaigns)
      setSelected((cur) => cur ?? data.campaigns[0]?.id ?? null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
  }, [load])

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl bg-muted" />
  }

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          No campaigns yet. Create one from the sidebar ("New campaign").
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {campaigns.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`rounded-2xl border px-4 py-3 text-left transition ${
              selected === c.id
                ? "border-emerald-500 bg-emerald-50/60"
                : "border-border bg-card hover:border-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <Badge variant="outline" className={stateBadgeClass(c.state)}>
                {STATE_LABELS[c.state] ?? c.state}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {c.approvedCount} approved · {c.hotCount} hot · {c.bookedCount} booked
            </div>
          </button>
        ))}
      </div>
      {selected && <CampaignDetailPanel id={selected} onChanged={onChanged} />}
    </div>
  )
}

function CampaignDetailPanel({ id, onChanged }: { id: string; onChanged: () => Promise<void> | void }) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [settings, setSettings] = useState({
    maxTouches: 3, delayDays: 3, dailyBudgetUsd: 30,
    autopilotEnabled: true, autoReplyEnabled: true, autoReplyDelayMinutes: 10,
  })
  const { toast } = useToast()

  const load = useCallback(async () => {
    const data = await api<{ campaign: CampaignDetail; messages: MessageRow[] }>(`/api/campaigns/${id}`)
    setCampaign(data.campaign)
    setLeads(data.campaign.leads)
    setMessages(data.messages)
    setSettings({
      maxTouches: data.campaign.maxTouches,
      delayDays: data.campaign.delayDays,
      dailyBudgetUsd: data.campaign.dailyBudgetUsd,
      autopilotEnabled: data.campaign.autopilotEnabled,
      autoReplyEnabled: data.campaign.autoReplyEnabled,
      autoReplyDelayMinutes: data.campaign.autoReplyDelayMinutes,
    })
  }, [id])

  useEffect(() => {
    load()
    const t = setInterval(load, 6000)
    return () => clearInterval(t)
  }, [load])

  if (!campaign) {
    return <div className="h-96 animate-pulse rounded-2xl bg-muted" />
  }

  const pool = leads.filter((l) => l.status === "pool")
  const approved = leads.filter((l) => l.status === "approved")
  const done = leads.filter((l) => l.status === "suppressed" || l.status === "rejected")

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action)
    try {
      await post(`/api/campaigns/${id}/actions`, { action, ...extra })
      await load()
      await onChanged()
      toast({ title: `Done: ${action.replace("_", " ")}` })
    } catch (e) {
      toast({
        title: "Action failed",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  async function saveSettings() {
    setBusy("save")
    try {
      await patch(`/api/campaigns/${id}`, settings)
      toast({ title: "Settings saved" })
    } finally {
      setBusy(null)
    }
  }

  async function saveBrief() {
    if (!campaign) return
    setBusy("brief")
    try {
      await patch(`/api/campaigns/${id}`, {
        offer: campaign.offer,
        customerProblem: campaign.customerProblem,
        targetRole: campaign.targetRole,
        targetGeography: campaign.targetGeography,
        targetCompanySize: campaign.targetCompanySize,
        keywords: campaign.keywords,
        positiveCriteria: campaign.positiveCriteria,
        negativeCriteria: campaign.negativeCriteria,
      })
      toast({ title: "Brief saved" })
    } finally {
      setBusy(null)
    }
  }

  const poolSelected = pool.filter((l) => checked.has(l.id))

  return (
    <div className="space-y-4">
      {/* state machine header */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-5">
          <Badge variant="outline" className={stateBadgeClass(campaign.state)}>
            {STATE_LABELS[campaign.state] ?? campaign.state}
          </Badge>
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">{campaign.nextAction}</div>
          <div className="flex flex-wrap gap-2">
            {campaign.allowedActions.includes("approve") && (
              <Button size="sm" className="rounded-full" disabled={pool.length > 0 || busy !== null}
                onClick={() => act("approve")}>
                {busy === "approve" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ThumbsUp className="mr-2 h-3 w-3" />}
                Approve campaign
              </Button>
            )}
            {campaign.allowedActions.includes("start") && (
              <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={busy !== null}
                onClick={() => act("start")}>
                {busy === "start" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Play className="mr-2 h-3 w-3" />}
                Start outreach
              </Button>
            )}
            {campaign.allowedActions.includes("stop") && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null}
                onClick={() => act("stop")}>
                <Square className="mr-2 h-3 w-3" /> Stop
              </Button>
            )}
            {campaign.allowedActions.includes("resume") && (
              <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={busy !== null}
                onClick={() => act("resume")}>
                <Pause className="mr-2 h-3 w-3" /> Resume
              </Button>
            )}
            {campaign.allowedActions.includes("archive") && (
              <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={busy !== null}
                onClick={() => act("archive")}>
                <Archive className="mr-2 h-3 w-3" /> Archive
              </Button>
            )}
            {campaign.allowedActions.includes("unarchive") && (
              <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null}
                onClick={() => act("unarchive")}>
                <RotateCcw className="mr-2 h-3 w-3" /> Unarchive
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={pool.length > 0 ? "pool" : "copy"}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="pool">Lead pool ({pool.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="copy">My copy</TabsTrigger>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="pool" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-full"
              onClick={() => setChecked(new Set(pool.map((l) => l.id)))}>
              Select all
            </Button>
            <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700"
              disabled={poolSelected.length === 0 || busy !== null}
              onClick={() => act("approve_leads", { leadIds: [...checked] })}>
              <CheckCheck className="mr-2 h-3 w-3" />
              Approve selected ({poolSelected.length})
            </Button>
            <Button size="sm" className="rounded-full" disabled={pool.length === 0 || busy !== null}
              onClick={() => act("approve_leads", { all: true })}>
              Approve all ({pool.length})
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground"
              disabled={busy !== null}
              onClick={() => act("regenerate_pool")}>
              <RotateCcw className="mr-2 h-3 w-3" /> Regenerate pool
            </Button>
          </div>
          <LeadTable
            leads={pool}
            selectable
            checked={checked}
            onToggle={(lid) =>
              setChecked((s) => {
                const n = new Set(s)
                if (n.has(lid)) n.delete(lid)
                else n.add(lid)
                return n
              })
            }
          />
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <LeadTable leads={approved} />
        </TabsContent>

        <TabsContent value="copy" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">AI first-touch email</CardTitle>
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                <Sparkles className="mr-1 h-3 w-3" /> My copy
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {campaign.copyWarnings.length > 0 && (
                <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  {campaign.copyWarnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cp-subject">Subject</Label>
                <Input
                  id="cp-subject"
                  value={campaign.copySubject ?? ""}
                  onChange={(e) => setCampaign({ ...campaign, copySubject: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp-body">Body (merge tokens: {"{{first_name}} {{company}} {{hook}} {{sender_name}}"})</Label>
                <Textarea
                  id="cp-body"
                  rows={8}
                  value={campaign.copyBody ?? ""}
                  onChange={(e) => setCampaign({ ...campaign, copyBody: e.target.value })}
                />
              </div>
              <Button size="sm" className="rounded-full" disabled={busy !== null}
                onClick={async () => {
                  setBusy("copy")
                  try {
                    await patch(`/api/campaigns/${id}`, { copySubject: campaign.copySubject, copyBody: campaign.copyBody })
                    toast({ title: "Copy saved" })
                  } finally {
                    setBusy(null)
                  }
                }}>
                Save copy
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brief" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Offer</Label>
                <Textarea rows={2} value={campaign.offer} onChange={(e) => setCampaign({ ...campaign, offer: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Customer problem</Label>
                <Textarea rows={2} value={campaign.customerProblem} onChange={(e) => setCampaign({ ...campaign, customerProblem: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Target roles</Label>
                <Input value={campaign.targetRole} onChange={(e) => setCampaign({ ...campaign, targetRole: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Target geography</Label>
                <Input value={campaign.targetGeography} onChange={(e) => setCampaign({ ...campaign, targetGeography: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Company size</Label>
                <Input value={campaign.targetCompanySize} onChange={(e) => setCampaign({ ...campaign, targetCompanySize: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <Input value={campaign.keywords ?? ""} onChange={(e) => setCampaign({ ...campaign, keywords: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Positive criteria</Label>
                <Input value={campaign.positiveCriteria ?? ""} onChange={(e) => setCampaign({ ...campaign, positiveCriteria: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Negative criteria</Label>
                <Input value={campaign.negativeCriteria ?? ""} onChange={(e) => setCampaign({ ...campaign, negativeCriteria: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Button size="sm" className="rounded-full" disabled={busy !== null} onClick={saveBrief}>
                  {busy === "brief" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save brief
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 pt-6 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Follow-up touches: {settings.maxTouches}</Label>
                <Slider value={[settings.maxTouches]} min={1} max={5} onValueChange={(v) => setSettings({ ...settings, maxTouches: v[0] })} />
                <Label className="pt-2">Delay between touches: {settings.delayDays}d</Label>
                <Slider value={[settings.delayDays]} min={1} max={7} onValueChange={(v) => setSettings({ ...settings, delayDays: v[0] })} />
              </div>
              <div className="space-y-2">
                <Label>Daily outreach budget: {money(settings.dailyBudgetUsd)}</Label>
                <Slider value={[settings.dailyBudgetUsd]} min={30} max={300} step={30} onValueChange={(v) => setSettings({ ...settings, dailyBudgetUsd: v[0] })} />
              </div>
              <div className="space-y-4 rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Autopilot</Label>
                  <Switch checked={settings.autopilotEnabled} onCheckedChange={(v) => setSettings({ ...settings, autopilotEnabled: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Auto-replies</Label>
                  <Switch checked={settings.autoReplyEnabled} onCheckedChange={(v) => setSettings({ ...settings, autoReplyEnabled: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Reply delay (min)</Label>
                  <Input
                    type="number"
                    className="h-8 w-20"
                    value={settings.autoReplyDelayMinutes}
                    onChange={(e) => setSettings({ ...settings, autoReplyDelayMinutes: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="sm:col-span-3">
                <Button size="sm" className="rounded-full" disabled={busy !== null} onClick={saveSettings}>
                  {busy === "save" && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Save settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              {messages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No messages yet</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className="flex gap-3 border-b border-border/40 pb-3 last:border-0">
                      <span className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${m.direction === "out" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {m.direction === "out" ? (
                          m.channel === "linkedin" ? <Linkedin className="h-3 w-3" /> : <Mail className="h-3 w-3" />
                        ) : (
                          <Mail className="h-3 w-3" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <span className="font-medium">{m.lead?.name}</span>
                          <span className="text-muted-foreground">
                            {" "}· {m.direction === "out" ? (m.kind === "autopilot" ? "autopilot" : `touch ${m.touchIndex}${m.status === "bounced" ? " (bounced)" : ""}`) : "reply"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{m.body.slice(0, 200)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {done.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {done.filter((l) => l.status === "rejected").length} rejected · {done.filter((l) => l.status === "suppressed").length} suppressed
        </p>
      )}
    </div>
  )
}

function LeadTable({
  leads,
  selectable = false,
  checked,
  onToggle,
}: {
  leads: Lead[]
  selectable?: boolean
  checked?: Set<string>
  onToggle?: (id: string) => void
}) {
  if (leads.length === 0) {
    return <div className="rounded-xl border border-border py-10 text-center text-sm text-muted-foreground">Empty</div>
  }
  return (
    <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
          <tr className="text-left text-xs text-muted-foreground">
            {selectable && <th className="w-10 p-3" aria-label="Select" />}
            <th className="p-3 font-medium">Lead</th>
            <th className="hidden p-3 font-medium md:table-cell">Company</th>
            <th className="hidden p-3 font-medium lg:table-cell">Size / Country</th>
            <th className="hidden max-w-52 truncate p-3 font-medium xl:table-cell">Hook</th>
            <th className="p-3 font-medium">Score</th>
            <th className="p-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-t border-border/60 hover:bg-secondary/40">
              {selectable && (
                <td className="p-3">
                  <Checkbox
                    checked={checked?.has(l.id) ?? false}
                    onCheckedChange={() => onToggle?.(l.id)}
                    aria-label={`Select ${l.name}`}
                  />
                </td>
              )}
              <td className="p-3">
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">{l.title}</div>
              </td>
              <td className="hidden p-3 md:table-cell">
                <div>{l.company}</div>
                <div className="text-xs text-muted-foreground">{l.industry}</div>
              </td>
              <td className="hidden p-3 text-xs text-muted-foreground lg:table-cell">
                {l.companySize} · {l.country}
              </td>
              <td className="hidden max-w-52 truncate p-3 text-xs text-muted-foreground xl:table-cell">
                {l.reasons}
              </td>
              <td className="p-3">
                <span className={`font-semibold ${l.score >= 80 ? "text-emerald-700" : l.score >= 65 ? "text-amber-600" : "text-muted-foreground"}`}>
                  {l.score}
                </span>
              </td>
              <td className="p-3">
                {l.isHot ? (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                    <Flame className="mr-1 h-3 w-3" /> hot
                  </Badge>
                ) : l.convStatus === "booked" ? (
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    <CalendarCheck className="mr-1 h-3 w-3" /> booked
                  </Badge>
                ) : l.convStatus === "closed" || l.convStatus === "unsubscribed" ? (
                  <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                    <XCircle className="mr-1 h-3 w-3" /> {l.convStatus}
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{l.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
