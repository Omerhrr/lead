"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Linkedin } from "lucide-react"
import { post } from "./api-client"

export function AuthDialog({
  open,
  onClose,
  prefillEmail,
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  prefillEmail?: string
  onSuccess: () => void
}) {
  const domain = (prefillEmail || "yourcompany.com").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")
  const [email, setEmail] = useState(`founder@${domain}`)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState<"email" | "linkedin" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function signIn(viaLinkedin: boolean) {
    setBusy(viaLinkedin ? "linkedin" : "email")
    setError(null)
    try {
      await post("/api/auth/login", { email, name: name || null, viaLinkedin })
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start with $30 in free credits</DialogTitle>
          <DialogDescription>
            Work emails only - free providers can&apos;t register. Your credits fund the first outreach runs.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="auth-name">Your name</Label>
            <Input
              id="auth-name"
              placeholder="Jordan Fields"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Work email</Label>
            <Input
              id="auth-email"
              type="email"
              placeholder="founder@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-full rounded-full"
            disabled={busy !== null || !email}
            onClick={() => signIn(false)}
          >
            {busy === "email" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Continue with email
          </Button>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">or</span>
            <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border" />
          </div>
          <Button
            variant="outline"
            className="w-full rounded-full"
            disabled={busy !== null}
            onClick={() => signIn(true)}
          >
            {busy === "linkedin" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Linkedin className="mr-2 h-4 w-4 text-[#0a66c2]" />
            )}
            Continue with LinkedIn
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
