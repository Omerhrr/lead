"use client"

import { useCallback, useEffect, useState } from "react"
import { Landing } from "@/components/app/landing"
import { AuthDialog } from "@/components/app/auth-dialog"
import { Dashboard } from "@/components/app/dashboard"
import { api, type MeResponse } from "@/components/app/api-client"

export default function Page() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [prefillDomain, setPrefillDomain] = useState<string | undefined>(undefined)
  const [onboardingSignal, setOnboardingSignal] = useState(0)

  const refreshMe = useCallback(async () => {
    const data = await api<MeResponse>("/api/auth/me")
    setMe(data)
    return data
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      await refreshMe()
      if (!cancelled) setLoading(false)
    }
    boot()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  function start(domain?: string) {
    setPrefillDomain(domain)
    if (me?.user) {
      setAuthOpen(false)
      setOnboardingSignal((n) => n + 1)
    } else {
      setAuthOpen(true)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  if (me?.user) {
    return (
      <Dashboard
        key={onboardingSignal}
        initialView={onboardingSignal > 0 ? "onboarding" : undefined}
        me={me}
        onSignOut={() => refreshMe()}
        refreshMe={async () => {
          await refreshMe()
        }}
      />
    )
  }

  return (
    <>
      <Landing onStart={start} />
      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        prefillEmail={prefillDomain}
        onSuccess={async () => {
          setAuthOpen(false)
          await refreshMe()
        }}
      />
    </>
  )
}
