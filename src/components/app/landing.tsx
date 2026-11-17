"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ArrowRight, Bot, CalendarCheck, Mail, Search, Sparkles, Wallet } from "lucide-react"
import { EMAIL_PRICE_USD, EMAILS_PER_30_USD, MEDIAN_CPL_USD } from "@/lib/constants"

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold tracking-tight ${className}`}>
      <span className="inline-grid grid-cols-2 gap-[2px]">
        <span className="h-[7px] w-[7px] rounded-[2px] bg-emerald-600" />
        <span className="h-[7px] w-[7px] rounded-[2px] bg-emerald-600/40" />
        <span className="h-[7px] w-[7px] rounded-[2px] bg-emerald-600/40" />
        <span className="h-[7px] w-[7px] rounded-[2px] bg-emerald-600" />
      </span>
      autogtm
    </span>
  )
}

// deterministic PRNG (pure, module-level so lint-clean)
function mulberry32(seed: number) {
  let s = seed
  return function () {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

// deterministic decorative network background (like their hero dots)
function DotField() {
  const dots = useMemo(() => {
    const rnd = mulberry32(42)
    return Array.from({ length: 90 }, () => ({
      x: rnd() * 100,
      y: rnd() * 100,
      r: rnd() * 2 + 1,
      o: rnd() * 0.5 + 0.1,
      g: rnd() > 0.82,
    }))
  }, [])
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x}
          cy={d.y}
          r={d.r / 3}
          fill={d.g ? "#059669" : "#a8a29e"}
          opacity={d.o}
        />
      ))}
    </svg>
  )
}

const STEPS = [
  {
    icon: Search,
    title: "Tell it your offer",
    text: "Paste your website, describe what you sell and who it helps. The agent sharpens your ICP.",
  },
  {
    icon: Sparkles,
    title: "AI finds your buyers",
    text: "It searches a B2B database of companies and decision makers, scores every prospect against your brief.",
  },
  {
    icon: Mail,
    title: "Personalized outreach",
    text: "It writes first-touch emails with a personal hook per lead, follows up on schedule, rotates sending domains.",
  },
  {
    icon: CalendarCheck,
    title: "Books meetings while you sleep",
    text: "Autopilot reads replies, answers questions, negotiates time slots and puts demos on your calendar.",
  },
]

export function Landing({ onStart }: { onStart: (domain?: string) => void }) {
  const [site, setSite] = useState("")
  const [budget, setBudget] = useState(30)
  const emails = Math.round(budget / EMAIL_PRICE_USD)
  const leadsLow = Math.max(1, Math.round(budget / 20))
  const leadsHigh = Math.max(2, Math.round(budget / 6))

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo className="text-lg" />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
            <a href="#stats" className="hover:text-foreground">Results</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onStart()}>Sign in</Button>
            <Button size="sm" className="rounded-full" onClick={() => onStart()}>
              Start free
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="relative overflow-hidden">
          <DotField />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pb-20 pt-16 text-center sm:pt-24">
            <div className="rounded-full border border-border bg-card px-4 py-1.5 text-sm shadow-sm">
              <span className="font-semibold">206,605</span>
              <span className="text-muted-foreground"> hot leads for </span>
              <span className="font-semibold">18,015</span>
              <span className="text-muted-foreground"> companies</span>
            </div>
            <h1 className="mt-8 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Get <span className="text-emerald-600">1 to 3 hot leads</span>
              <br />
              in 24 hours free
            </h1>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="rounded-full bg-muted px-4 py-1.5 text-muted-foreground">
                No SDRs or email infra needed
              </span>
              <span className="rounded-full bg-muted px-4 py-1.5 text-muted-foreground">
                $30 in free credits
              </span>
            </div>
            <form
              className="mt-10 w-full max-w-xl"
              onSubmit={(e) => {
                e.preventDefault()
                onStart(site.trim() || undefined)
              }}
            >
              <div className="flex items-center rounded-2xl border-2 border-foreground/80 bg-card p-2 pl-5 shadow-[0_2px_0_0_rgba(23,23,20,0.9)] transition focus-within:border-emerald-600 focus-within:shadow-[0_2px_0_0_#059669]">
                <Input
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="Paste your website, e.g., consotto.com"
                  className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  aria-label="Your website"
                />
                <Button type="submit" size="icon" className="h-11 w-12 rounded-xl bg-secondary text-foreground hover:bg-secondary/80" aria-label="Start">
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </div>
            </form>
            <button
              className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => onStart()}
            >
              I don&apos;t have a website
            </button>
            <p className="mt-8 max-w-2xl text-balance text-muted-foreground">
              Our AI agents research the market, sharpen your ICP, find high-intent prospects,
              write personalized emails, and book demos — 24/7.
            </p>
          </div>
        </section>

        {/* stats */}
        <section id="stats" className="border-y border-border/60 bg-secondary/40">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {[
              ["97%", "inbox placement rate"],
              ["$9", "median cost per lead"],
              ["24/7", "agent never sleeps"],
            ].map(([v, l]) => (
              <div key={l} className="text-center">
                <div className="text-3xl font-semibold tracking-tight text-emerald-700">{v}</div>
                <div className="mt-1 text-sm text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-3xl font-semibold tracking-tight">What the agent does</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
            One employee of an entire outbound stack — database, deliverability, copywriting and an SDR — compressed into an autopilot.
          </p>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <s.icon className="h-5 w-5" />
                </div>
                <div className="mt-4 text-xs font-medium text-emerald-700">Step {i + 1}</div>
                <h3 className="mt-1 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* pricing */}
        <section id="pricing" className="border-t border-border/60 bg-secondary/40">
          <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Pay as you go</h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
              No subscription. Top up credits, spend them on outreach. Unused credits stay yours.
            </p>
            <div className="mt-10 rounded-3xl border border-border bg-card p-8 shadow-sm">
              <div className="flex items-center justify-center text-sm text-muted-foreground">
                <Wallet className="mr-2 h-4 w-4" /> Choose your daily outreach budget
              </div>
              <div className="mt-4 text-center text-5xl font-semibold tracking-tight">
                ${budget}
                <span className="text-lg font-normal text-muted-foreground">/day</span>
              </div>
              <Slider
                value={[budget]}
                min={30}
                max={300}
                step={30}
                onValueChange={(v) => setBudget(v[0])}
                className="mx-auto mt-6 max-w-md"
                aria-label="Daily budget"
              />
              <div className="mt-8 grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
                <div className="rounded-2xl bg-secondary p-4">
                  <div className="text-2xl font-semibold">{emails.toLocaleString()}</div>
                  <div className="mt-1 text-sm text-muted-foreground">emails/day</div>
                </div>
                <div className="rounded-2xl bg-secondary p-4">
                  <div className="text-2xl font-semibold">
                    ~{leadsLow}-{leadsHigh}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">warm leads/day</div>
                </div>
                <div className="rounded-2xl bg-secondary p-4">
                  <div className="text-2xl font-semibold">~1</div>
                  <div className="mt-1 text-sm text-muted-foreground">meeting/day</div>
                </div>
              </div>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {EMAILS_PER_30_USD} emails per $30 · median {MEDIAN_CPL_USD} USD per lead · $1–20 CPL range
              </p>
              <div className="mt-8 text-center">
                <Button size="lg" className="rounded-full px-8" onClick={() => onStart()}>
                  Start with $30 free credits
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <Logo />
          <span>Reverse-engineered clone of explee.com (app-auto-gtm) — demo build</span>
          <span>{new Date().getFullYear()} · Not affiliated with Explee</span>
        </div>
      </footer>
    </div>
  )
}
