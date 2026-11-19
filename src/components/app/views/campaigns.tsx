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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2, Play, Square, Pause, Archive, RotateCcw, Sparkles, CheckCheck,
  Flame, Mail, Linkedin, XCircle, CalendarCheck, ThumbsUp, ThumbsDown,
  FlaskConical, Trophy, Eye, Plus, Trash2, MousePointerClick, Download, Link2, FileText,
  ShieldCheck, Languages, Upload, Wallet, CheckCircle2, CircleDashed,
} from "lucide-react"
import { api, patch, post, type CampaignDetail, type CampaignListItem, type CsvImportPreview, type DeliveryStatus, type Lead, type MessageRow } from "../api-client"
import { STATE_LABELS, stateBadgeClass, money, LANGUAGES } from "@/lib/constants"

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
              {c.variantTest && (
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                  <FlaskConical className="mr-1 h-3 w-3" /> A/B
                </Badge>
              )}
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
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null)
  const [testTo, setTestTo] = useState("")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importCsv, setImportCsv] = useState("")
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null)
  const [importFileName, setImportFileName] = useState("")
  const [settings, setSettings] = useState({
    maxTouches: 3, delayDays: 3, dailyBudgetUsd: 30,
    autopilotEnabled: true, autoReplyEnabled: true, autoReplyDelayMinutes: 10,
    linkedinEnabled: true, language: "English", verifyPolicy: "skip_invalid",
  })
  const { toast } = useToast()

  const load = useCallback(async () => {
    const [data, deliveryData] = await Promise.all([
      api<{ campaign: CampaignDetail; messages: MessageRow[] }>(`/api/campaigns/${id}`),
      api<DeliveryStatus>("/api/delivery").catch(() => null),
    ])
    setCampaign(data.campaign)
    setLeads(data.campaign.leads)
    setMessages(data.messages)
    setDelivery(deliveryData)
    setSettings({
      maxTouches: data.campaign.maxTouches,
      delayDays: data.campaign.delayDays,
      dailyBudgetUsd: data.campaign.dailyBudgetUsd,
      autopilotEnabled: data.campaign.autopilotEnabled,
      autoReplyEnabled: data.campaign.autoReplyEnabled,
      autoReplyDelayMinutes: data.campaign.autoReplyDelayMinutes,
      linkedinEnabled: data.campaign.linkedinEnabled,
      language: data.campaign.language || "English",
      verifyPolicy: data.campaign.verifyPolicy || "skip_invalid",
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
      await load()
    } finally {
      setBusy(null)
    }
  }

  async function previewImport() {
    setBusy("import-preview")
    try {
      const r = await post<{ preview: CsvImportPreview }>(`/api/campaigns/${id}/import-csv`, { csv: importCsv })
      setImportPreview(r.preview)
    } catch (e) {
      toast({ title: "Could not parse the CSV", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function commitImport() {
    setBusy("import-commit")
    try {
      const r = await post<{ imported: number; verification: { valid: number; risky: number; invalid: number } }>(
        `/api/campaigns/${id}/import-csv`,
        { csv: importCsv, commit: true }
      )
      toast({
        title: `Imported ${r.imported} lead${r.imported === 1 ? "" : "s"}`,
        description: `Verified: ${r.verification.valid} valid, ${r.verification.risky} risky, ${r.verification.invalid} invalid`,
      })
      setImportOpen(false)
      setImportCsv("")
      setImportPreview(null)
      setImportFileName("")
      await load()
      await onChanged()
    } catch (e) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  async function sendTestEmail() {
    setBusy("test")
    try {
      const r = await post<{ deliveryStatus?: string; provider?: string | null; error?: string }>(
        "/api/delivery",
        { to: testTo.trim() }
      )
      if (r.error) {
        toast({ title: "Test send failed", description: r.error, variant: "destructive" })
      } else if (r.deliveryStatus === "delivered") {
        toast({ title: `Test email delivered via ${r.provider}`, description: `Check the inbox of ${testTo.trim()}` })
      } else {
        toast({ title: "Provider rejected the test email", description: "Check credentials / from address", variant: "destructive" })
      }
    } catch (e) {
      toast({ title: "Test send failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" })
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
          <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
            <Mail className="mr-1 h-3 w-3" />
            {campaign.emailTouches} email
            <span className="mx-1 text-sky-300">·</span>
            <Linkedin className="mr-1 h-3 w-3" />
            {campaign.linkedinTouches} LinkedIn
          </Badge>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
            <Languages className="mr-1 h-3 w-3" /> {campaign.language}
          </Badge>
          {campaign.stats.warm > 0 && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              <Wallet className="mr-1 h-3 w-3" /> {money(campaign.stats.spendUsd)} · {campaign.stats.cplUsd === null ? "-" : `${money(campaign.stats.cplUsd)}/warm lead`}
            </Badge>
          )}
          <div className="min-w-0 flex-1 text-sm text-muted-foreground">{campaign.nextAction}</div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("export")
                try {
                  const res = await fetch(`/api/campaigns/${id}/report`, { cache: "no-store" })
                  if (!res.ok) throw new Error(`Export failed (${res.status})`)
                  const blob = await res.blob()
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `jidout-report-${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.csv`
                  a.click()
                  URL.revokeObjectURL(a.href)
                  toast({ title: "Report exported", description: "Lead-level CSV with variants, opens, clicks and outcomes" })
                } catch (e) {
                  toast({ title: "Export failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" })
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "export" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Download className="mr-2 h-3 w-3" />}
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("exportPdf")
                try {
                  const res = await fetch(`/api/campaigns/${id}/report-pdf`, { cache: "no-store" })
                  if (!res.ok) throw new Error(`Export failed (${res.status})`)
                  const blob = await res.blob()
                  const a = document.createElement("a")
                  a.href = URL.createObjectURL(blob)
                  a.download = `jidout-report-${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.pdf`
                  a.click()
                  URL.revokeObjectURL(a.href)
                  toast({ title: "PDF report exported", description: "One-page summary: funnel, split-test arms, tracked links" })
                } catch (e) {
                  toast({ title: "Export failed", description: e instanceof Error ? e.message : "Try again", variant: "destructive" })
                } finally {
                  setBusy(null)
                }
              }}
            >
              {busy === "exportPdf" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <FileText className="mr-2 h-3 w-3" />}
              Export PDF
            </Button>
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
          <TabsTrigger value="variants">A/B test</TabsTrigger>
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
            <Button size="sm" variant="outline" className="rounded-full"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("verify_pool")
                try {
                  const r = await post<{ checked: number; valid: number; risky: number; invalid: number; chargedUsd: number }>(
                    `/api/campaigns/${id}/actions`,
                    { action: "verify_pool" }
                  )
                  toast({ title: `Verified ${r.checked} mailboxes`, description: `${r.valid} valid · ${r.risky} risky · ${r.invalid} invalid (${money(r.chargedUsd)})` })
                  await load()
                } catch (e) {
                  toast({ title: "Verification failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
                } finally {
                  setBusy(null)
                }
              }}>
              {busy === "verify_pool" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
              Verify pool
            </Button>
            <Button size="sm" variant="outline" className="rounded-full"
              disabled={busy !== null}
              onClick={() => {
                setImportPreview(null)
                setImportOpen(true)
              }}>
              <Upload className="mr-2 h-3 w-3" /> Import CSV
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground"
              disabled={busy !== null}
              onClick={() => act("regenerate_pool")}>
              <RotateCcw className="mr-2 h-3 w-3" /> Regenerate pool
            </Button>
            {campaign.stats.verifyUnknown === 0 && (
              <span className="text-xs text-muted-foreground">
                {campaign.stats.verifyValid} valid · {campaign.stats.verifyRisky} risky · {campaign.stats.verifyInvalid} invalid
              </span>
            )}
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
              <div className="space-y-1.5">
                <Label htmlFor="cp-cta" className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-emerald-600" />
                  CTA link (tracked - appended to every email touch, clicks measured)
                </Label>
                <Input
                  id="cp-cta"
                  placeholder="https://cal.com/your-team/demo"
                  value={campaign.ctaUrl ?? ""}
                  onChange={(e) => setCampaign({ ...campaign, ctaUrl: e.target.value })}
                />
              </div>
              <Button size="sm" className="rounded-full" disabled={busy !== null}
                onClick={async () => {
                  setBusy("copy")
                  try {
                    await patch(`/api/campaigns/${id}`, { copySubject: campaign.copySubject, copyBody: campaign.copyBody, ctaUrl: campaign.ctaUrl ?? "" })
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

        <TabsContent value="variants" className="mt-4 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FlaskConical className="h-4 w-4 text-emerald-600" />
                  Split test {campaign.variantTest ? "- testing live" : "- off"}
                </div>
                <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                  Approved leads are split evenly across variants and keep their variant for the whole
                  sequence. Promote the winner to close the test and make its copy the campaign copy.
                </p>
                {campaign.splitTest && campaign.variantTest && (
                  <p className="mt-1.5 max-w-xl text-xs">
                    {campaign.splitTest.pValue !== null ? (
                      <span className={campaign.splitTest.significant ? "font-medium text-emerald-700" : "text-muted-foreground"}>
                        Leader: {campaign.splitTest.leader} - {Math.round(campaign.splitTest.leaderRate * 100)}% vs{" "}
                        {Math.round(campaign.splitTest.runnerRate * 100)}% reply rate · p={campaign.splitTest.pValue.toFixed(2)}
                        {campaign.splitTest.significant ? " · significant - ready to promote" : " · not yet significant"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        Collecting data - every arm needs ≥ {campaign.splitTest.minSends} sends before
                        the z-test kicks in
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {campaign.variantTest && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={busy !== null || campaign.variants.length >= 4}
                    onClick={async () => {
                      setBusy("addVariant")
                      try {
                        await patch(`/api/campaigns/${id}`, { addVariant: true })
                        await load()
                        toast({ title: `Variant ${String.fromCharCode(65 + campaign.variants.length)} added - AI wrote a fresh angle` })
                      } catch (e) {
                        toast({ title: "Could not add variant", description: e instanceof Error ? e.message : "Try again", variant: "destructive" })
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    {busy === "addVariant" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-2 h-3 w-3" />}
                    Add variant
                  </Button>
                )}
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Auto-promote
                  <Switch
                    checked={campaign.autoPromote}
                    disabled={busy !== null}
                    onCheckedChange={async (v) => {
                      setBusy("autoPromote")
                      try {
                        await patch(`/api/campaigns/${id}`, { autoPromote: v })
                        await load()
                        toast({
                          title: v
                            ? "Auto-promote on - the significant winner takes over automatically"
                            : "Auto-promote off",
                        })
                      } finally {
                        setBusy(null)
                      }
                    }}
                  />
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  A/B test
                  <Switch
                  checked={campaign.variantTest}
                  disabled={busy !== null}
                  onCheckedChange={async (v) => {
                    setBusy("variantTest")
                    try {
                      await patch(`/api/campaigns/${id}`, { variantTest: v })
                      await load()
                      toast({ title: v ? "A/B test enabled - variants A and B seeded from My copy" : "A/B test disabled" })
                    } finally {
                      setBusy(null)
                    }
                  }}
                />
                </span>
              </div>
            </CardContent>
          </Card>
          {campaign.variants.map((v) => {
            const st = campaign.variantStats.find((s) => s.id === v.id)
            return (
              <Card key={v.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      Variant {v.label}
                    </Badge>
                    {campaign.variantTest && campaign.splitTest?.leader === v.label && st && st.sent > 0 && (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        <Trophy className="mr-1 h-3 w-3" />
                        leader
                      </Badge>
                    )}
                    {campaign.variantTest && st && st.sent > 0 && (
                      <span className="text-xs text-muted-foreground">live in rotation</span>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="rounded-full"
                      disabled={busy !== null || !st || st.sent === 0}
                      onClick={() => act("promote_variant", { variantId: v.id })}>
                      {busy === "promote_variant" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trophy className="mr-2 h-3 w-3" />}
                      Promote winner
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full text-muted-foreground hover:text-destructive"
                      title={
                        st && st.assigned > 0
                          ? "Variants with assigned leads can't be removed"
                          : campaign.variantTest && campaign.variants.length <= 2
                            ? "A live split test needs at least two arms"
                            : `Remove variant ${v.label}`
                      }
                      disabled={
                        busy !== null ||
                        (st && st.assigned > 0) ||
                        (campaign.variantTest && campaign.variants.length <= 2)
                      }
                      onClick={async () => {
                        setBusy(`remove-${v.id}`)
                        try {
                          await patch(`/api/campaigns/${id}`, { removeVariant: v.id })
                          await load()
                          toast({ title: `Variant ${v.label} removed` })
                        } catch (e) {
                          toast({ title: "Could not remove variant", description: e instanceof Error ? e.message : "Try again", variant: "destructive" })
                        } finally {
                          setBusy(null)
                        }
                      }}
                    >
                      {busy === `remove-${v.id}` ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Trash2 className="mr-2 h-3 w-3" />}
                      Remove
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {st && (
                    <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-8">
                      {([
                        ["Leads", st.assigned],
                        ["Sent", st.sent],
                        ["Opens", st.sent > 0 ? `${Math.round(st.openRate * 100)}%` : "-"],
                        ["Clicks", st.sent > 0 ? `${Math.round(st.clickRate * 100)}%` : "-"],
                        ["Replies", st.replied],
                        ["Reply rate", st.sent > 0 ? `${Math.round(st.replyRate * 100)}%` : "-"],
                        ["Hot", st.hot],
                        ["Booked", st.booked],
                      ] as Array<[string, string | number]>).map(([k, val]) => (
                        <div key={k} className="rounded-xl border border-border p-2">
                          <div className="text-xs text-muted-foreground">{k}</div>
                          <div className="text-sm font-semibold">{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input
                      value={v.subject}
                      onChange={(e) =>
                        setCampaign((cur) =>
                          cur
                            ? { ...cur, variants: cur.variants.map((x) => (x.id === v.id ? { ...x, subject: e.target.value } : x)) }
                            : cur
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Body (merge tokens: {"{{first_name}} {{company}} {{hook}} {{sender_name}}"})</Label>
                    <Textarea
                      rows={6}
                      value={v.body}
                      onChange={(e) =>
                        setCampaign((cur) =>
                          cur
                            ? { ...cur, variants: cur.variants.map((x) => (x.id === v.id ? { ...x, body: e.target.value } : x)) }
                            : cur
                        )
                      }
                    />
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" disabled={busy !== null}
                    onClick={async () => {
                      setBusy(`variant-${v.id}`)
                      try {
                        await patch(`/api/campaigns/${id}`, { variants: [{ id: v.id, subject: v.subject, body: v.body }] })
                        toast({ title: `Variant ${v.label} saved` })
                      } finally {
                        setBusy(null)
                      }
                    }}>
                    {busy === `variant-${v.id}` && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                    Save variant {v.label}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
          {campaign.variants.length === 0 && (
            <div className="rounded-xl border border-border py-10 text-center text-sm text-muted-foreground">
              Turn on the A/B test to seed variants A and B from "My copy".
            </div>
          )}
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
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Linkedin className="h-3.5 w-3.5 text-sky-600" /> LinkedIn touches
                  </Label>
                  <Switch checked={settings.linkedinEnabled} onCheckedChange={(v) => setSettings({ ...settings, linkedinEnabled: v })} />
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
              <div className="space-y-4 rounded-xl border border-border p-4 sm:col-span-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Languages className="h-3.5 w-3.5 text-emerald-600" /> Campaign language ({LANGUAGES.length} available)
                  </Label>
                  <Select
                    value={settings.language}
                    onValueChange={(v) => setSettings({ ...settings, language: v })}
                  >
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang} value={lang}>{lang}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    AI copy and follow-ups are written in this language.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Mailbox verification policy
                  </Label>
                  <Select
                    value={settings.verifyPolicy}
                    onValueChange={(v) => setSettings({ ...settings, verifyPolicy: v })}
                  >
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="send_all">Send to everyone</SelectItem>
                      <SelectItem value="skip_invalid">Skip invalid mailboxes</SelectItem>
                      <SelectItem value="skip_invalid_risky">Skip invalid + risky</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Unverified addresses are checked pre-send ({money(0.005)}/check); skipped leads never spend a send.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 sm:col-span-3">
                {delivery && (
                  <>
                    <Badge variant="outline" className={delivery.configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "text-muted-foreground"}>
                      <Mail className="mr-1 h-3 w-3" />
                      {delivery.configured ? `Live delivery: ${delivery.provider}` : "Simulated delivery"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {delivery.configured
                        ? `First touches are delivered for real via ${delivery.provider}${delivery.fromEmail ? ` (from ${delivery.fromEmail})` : ""}`
                        : "Set RESEND_API_KEY or SMTP_HOST to deliver for real - metering and autopilot keep running"}
                    </span>
                    {delivery.configured && (
                      <span className="flex items-center gap-1">
                        <Input
                          type="email"
                          placeholder="you@company.com"
                          className="h-7 w-44 rounded-full text-xs"
                          value={testTo}
                          onChange={(e) => setTestTo(e.target.value)}
                        />
                        <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" disabled={busy !== null || !testTo.trim()} onClick={sendTestEmail}>
                          {busy === "test" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Send test
                        </Button>
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {delivery.counts.delivered} delivered · {delivery.counts.failed} failed · {delivery.counts.simulated} simulated
                    </span>
                  </>
                )}
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
          {campaign.topLinks.length > 0 && (
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <MousePointerClick className="h-4 w-4 text-emerald-600" />
                  Tracked links
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {campaign.topLinks.map((l) => {
                  const total = campaign.topLinks.reduce((s, x) => s + x.clicks, 0)
                  const share = total > 0 ? Math.round((l.clicks / total) * 100) : 0
                  return (
                    <div key={l.url} className="flex items-center gap-3">
                      <Link2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate text-xs text-emerald-700 hover:underline"
                      >
                        {l.url}
                      </a>
                      <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
                      </div>
                      <span className="shrink-0 text-xs font-medium">{l.clicks} clicks · {share}%</span>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              {messages.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No messages yet</div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m) => {
                    const vLabel = m.variantId
                      ? campaign.variants.find((v) => v.id === m.variantId)?.label
                      : null
                    return (
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
                              {m.kind === "touch" && vLabel ? ` · variant ${vLabel}` : ""}
                              {m.kind === "touch" && m.direction === "out" && m.opens > 0 ? " · opened" : ""}
                            {m.kind === "touch" && m.direction === "out" && m.clicks > 0 ? " · clicked" : ""}
                            </span>
                            {m.kind === "touch" && m.direction === "out" && m.opens > 0 && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 align-middle">
                                <Eye className="h-2.5 w-2.5" />
                                {m.opens}×
                              </span>
                            )}
                            {m.kind === "touch" && m.direction === "out" && m.clicks > 0 && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 align-middle">
                                <MousePointerClick className="h-2.5 w-2.5" />
                                clicked
                              </span>
                            )}
                            {m.direction === "out" && m.deliveryStatus === "delivered" && m.provider && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 align-middle">
                                via {m.provider === "linkedin" ? "LinkedIn API" : m.provider}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{m.body.slice(0, 200)}</div>
                        </div>
                      </div>
                    )
                  })}
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-emerald-600" /> Import leads from CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Upload a list (email required; name, title, company, country, linkedin_url recognized).
              Duplicates and suppressed addresses are skipped, and every imported mailbox is verified.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept=".csv,text/csv"
                className="w-64"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setImportFileName(file.name)
                  setImportCsv(await file.text())
                  setImportPreview(null)
                }}
              />
              {importFileName && <span className="text-xs text-muted-foreground">{importFileName}</span>}
              <Button size="sm" variant="outline" className="rounded-full" disabled={!importCsv.trim() || busy !== null}
                onClick={previewImport}>
                {busy === "import-preview" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <ShieldCheck className="mr-2 h-3 w-3" />}
                Preview
              </Button>
            </div>
            <Textarea
              rows={4}
              placeholder="email,name,title,company\njane@acme.com,Jane Doe,VP Ops,Acme Inc"
              value={importCsv}
              onChange={(e) => {
                setImportCsv(e.target.value)
                setImportPreview(null)
              }}
            />
            {importPreview && (
              <div className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                    {importPreview.importable} importable
                  </Badge>
                  <Badge variant="outline" className="border-stone-200 bg-stone-50 text-stone-600">
                    {importPreview.duplicateInFile} duplicate in file
                  </Badge>
                  <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">
                    {importPreview.malformed.length} malformed
                  </Badge>
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                    {importPreview.skipped.length} skipped
                  </Badge>
                </div>
                {importPreview.sample.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/80">
                        <tr className="text-left text-muted-foreground">
                          <th className="p-2 font-medium">Email</th>
                          <th className="p-2 font-medium">Name</th>
                          <th className="p-2 font-medium">Company</th>
                          <th className="p-2 font-medium">Title</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.sample.map((r) => (
                          <tr key={r.email} className="border-t border-border/60">
                            <td className="p-2">{r.email}</td>
                            <td className="p-2">{r.name}</td>
                            <td className="p-2">{r.company}</td>
                            <td className="p-2">{r.title}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {importPreview.malformed.slice(0, 5).map((m) => (
                  <p key={m.row} className="text-[11px] text-red-700">Row {m.row}: {m.reason}</p>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700"
                disabled={!importPreview || importPreview.importable === 0 || busy !== null}
                onClick={commitImport}>
                {busy === "import-commit" ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-2 h-3 w-3" />}
                Import {importPreview?.importable ?? 0} lead{importPreview?.importable === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
            <th className="p-3 font-medium">Verified</th>
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
                <div className="flex items-center gap-1.5 font-medium">
                  {l.name}
                  {l.source === "csv" && (
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">CSV</span>
                  )}
                </div>
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
                {l.verifyStatus === "valid" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" title={l.verifyReason ?? ""}>
                    <CheckCircle2 className="h-3 w-3" /> valid
                  </span>
                ) : l.verifyStatus === "risky" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600" title={l.verifyReason ?? ""}>
                    <CircleDashed className="h-3 w-3" /> risky
                  </span>
                ) : l.verifyStatus === "invalid" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600" title={l.verifyReason ?? ""}>
                    <XCircle className="h-3 w-3" /> invalid
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">unknown</span>
                )}
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
