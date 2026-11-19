"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowRight, ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react"
import { post, type CampaignListItem } from "./api-client"
import { Logo } from "./landing"

// Onboarding funnel: paste your website -> project -> campaign brief -> AI lead pool.

interface BriefState {
  offer: string
  customerProblem: string
  targetRole: string
  targetGeography: string
  targetCompanySize: string
  keywords: string
  positiveCriteria: string
  negativeCriteria: string
  maxTouches: number
  delayDays: number
  autopilotEnabled: boolean
  autoReplyEnabled: boolean
  dailyBudgetUsd: number
}

const EXAMPLE: BriefState = {
  offer: "Done-for-you Google Ads management for clinics - flat monthly fee, no long contract.",
  customerProblem:
    "Clinics burn money on ads but miss calls and follow-ups, so booked consultations never catch up with spend.",
  targetRole: "owner, practice manager, founder",
  targetGeography: "United States, Canada",
  targetCompanySize: "11-50",
  keywords: "dental clinics, med spas, veterinary clinics",
  positiveCriteria: "already running paid ads, 2+ locations",
  negativeCriteria: "hospital groups, franchises over 100 locations",
  maxTouches: 3,
  delayDays: 3,
  autopilotEnabled: true,
  autoReplyEnabled: true,
  dailyBudgetUsd: 30,
}

export function Onboarding({
  domain,
  hasCampaigns,
  onDone,
}: {
  domain?: string
  hasCampaigns: boolean
  onDone: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [companyDomain, setCompanyDomain] = useState(domain ?? "")
  const [companyName, setCompanyName] = useState("")
  const [senderName, setSenderName] = useState("")
  const [senderTitle, setSenderTitle] = useState("Founder")
  const [brief, setBrief] = useState<BriefState>(EXAMPLE)
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState("")
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof BriefState, v: string | number | boolean) =>
    setBrief((b) => ({ ...b, [k]: v }))

  async function saveProject() {
    setBusy(true)
    setError(null)
    try {
      await post("/api/project", {
        companyDomain,
        companyName: companyName || companyDomain,
        senderName: senderName || "Founder",
        senderTitle,
      })
      setStep(2)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save")
    } finally {
      setBusy(false)
    }
  }

  async function createCampaign() {
    setBusy(true)
    setError(null)
    try {
      setStage("AI is reading your brief and sharpening the ICP...")
      await post("/api/project", {
        companyDomain,
        companyName: companyName || companyDomain,
        senderName: senderName || "Founder",
        senderTitle,
      })
      setStage("AI is generating filters and writing your first-touch email...")
      const res = await post<{ poolSize: number }>("/api/campaigns", {
        name: `${companyName || companyDomain} - outbound`,
        ...brief,
        language: "English",
      })
      setStage(`Lead pool ready - ${res.poolSize} prospects found`)
      setTimeout(onDone, 900)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign")
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Logo className="text-lg" />
          <span className="text-sm text-muted-foreground">
            Step {step} of 2
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Progress value={step === 1 ? 35 : 75} className="mb-10" />

        {step === 1 ? (
          <section className="space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Tell us about your company</h1>
              <p className="mt-2 text-muted-foreground">
                The agent works for you - it signs as {senderName || "you"} and finds customers of {companyDomain || "your business"}.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ob-domain">Your website</Label>
                <Input
                  id="ob-domain"
                  placeholder="consotto.com"
                  value={companyDomain}
                  onChange={(e) => setCompanyDomain(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-name">Company name</Label>
                <Input
                  id="ob-name"
                  placeholder="Consotto"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-sender">Your name (sender)</Label>
                <Input
                  id="ob-sender"
                  placeholder="Jordan Fields"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ob-title">Your title</Label>
                <Input
                  id="ob-title"
                  value={senderTitle}
                  onChange={(e) => setSenderTitle(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              size="lg"
              className="rounded-full"
              disabled={busy || !companyDomain}
              onClick={saveProject}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </section>
        ) : (
          <section className="space-y-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">Describe your ideal customers</h1>
              <p className="mt-2 text-muted-foreground">
                Paste a short brief - the AI turns it into filters, copy and a lead pool.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bf-offer">What you offer</Label>
                <Textarea id="bf-offer" rows={2} value={brief.offer} onChange={(e) => set("offer", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bf-problem">The problem it solves</Label>
                <Textarea id="bf-problem" rows={2} value={brief.customerProblem} onChange={(e) => set("customerProblem", e.target.value)} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bf-role">Target roles</Label>
                  <Input id="bf-role" value={brief.targetRole} onChange={(e) => set("targetRole", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-geo">Target geography</Label>
                  <Input id="bf-geo" value={brief.targetGeography} onChange={(e) => set("targetGeography", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-size">Company size</Label>
                  <Input id="bf-size" value={brief.targetCompanySize} onChange={(e) => set("targetCompanySize", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-kw">Industry keywords</Label>
                  <Input id="bf-kw" value={brief.keywords} onChange={(e) => set("keywords", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-pos">Positive signals</Label>
                  <Input id="bf-pos" value={brief.positiveCriteria} onChange={(e) => set("positiveCriteria", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-neg">Exclude</Label>
                  <Input id="bf-neg" value={brief.negativeCriteria} onChange={(e) => set("negativeCriteria", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Follow-ups: {brief.maxTouches} touches</Label>
                  <Slider value={[brief.maxTouches]} min={1} max={5} onValueChange={(v) => set("maxTouches", v[0])} />
                  <Label className="pt-2">Delay: {brief.delayDays} days</Label>
                  <Slider value={[brief.delayDays]} min={1} max={7} onValueChange={(v) => set("delayDays", v[0])} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bf-budget">Daily outreach budget: ${brief.dailyBudgetUsd}</Label>
                  <Slider value={[brief.dailyBudgetUsd]} min={30} max={300} step={30} onValueChange={(v) => set("dailyBudgetUsd", v[0])} />
                </div>
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bf-ap" className="text-sm">Autopilot</Label>
                    <Switch id="bf-ap" checked={brief.autopilotEnabled} onCheckedChange={(v) => set("autopilotEnabled", v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="bf-ar" className="text-sm">Auto-replies</Label>
                    <Switch id="bf-ar" checked={brief.autoReplyEnabled} onCheckedChange={(v) => set("autoReplyEnabled", v)} />
                  </div>
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex items-center gap-3">
              <Button variant="outline" size="lg" className="rounded-full" disabled={busy} onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button size="lg" className="rounded-full" disabled={busy} onClick={createCampaign}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {busy ? "Working..." : "Generate lead pool"}
              </Button>
            </div>
            {busy && (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                {stage}
              </div>
            )}
          </section>
        )}

        {hasCampaigns && (
          <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            You already have campaigns - this will create an additional one.
          </p>
        )}
      </main>
    </div>
  )
}

export type { CampaignListItem }
