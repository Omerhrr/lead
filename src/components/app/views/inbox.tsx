"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { Flame, Loader2, Send, CalendarCheck, StickyNote, Ban, Bot, Mail } from "lucide-react"
import { api, patch, post, type ConversationRow, type Lead, type MessageRow } from "../api-client"

const FILTERS = [
  { id: "all", label: "All" },
  { id: "hot", label: "Hot" },
  { id: "active", label: "Needs reply" },
  { id: "booked", label: "Booked" },
  { id: "closed", label: "Closed" },
]

export function InboxView({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const [filter, setFilter] = useState("all")
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [notes, setNotes] = useState("")
  const { toast } = useToast()
  const threadEnd = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    const data = await api<{ conversations: ConversationRow[] }>(`/api/inbox?filter=${filter}`)
    setConversations(data.conversations)
    setSelected((cur) => (cur && data.conversations.some((c) => c.id === cur) ? cur : data.conversations[0]?.id ?? null))
  }, [filter])

  const loadThread = useCallback(async (leadId: string) => {
    const data = await api<{ lead: Lead; messages: MessageRow[] }>(`/api/inbox?leadId=${leadId}`)
    setLead(data.lead)
    setMessages(data.messages)
    setNotes(data.lead.notes ?? "")
  }, [])

  useEffect(() => {
    loadList()
    const t = setInterval(loadList, 6000)
    return () => clearInterval(t)
  }, [loadList])

  useEffect(() => {
    if (!selected) return
    loadThread(selected)
    const t = setInterval(() => loadThread(selected), 5000)
    return () => clearInterval(t)
  }, [selected, loadThread])

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  async function send() {
    if (!selected || !reply.trim()) return
    setSending(true)
    try {
      await post("/api/inbox/reply", { leadId: selected, body: reply.trim() })
      setReply("")
      await loadThread(selected)
      await loadList()
      await onChanged()
      toast({ title: "Reply sent" })
    } catch (e) {
      toast({ title: "Send failed", description: e instanceof Error ? e.message : "", variant: "destructive" })
    } finally {
      setSending(false)
    }
  }

  async function saveNotes() {
    if (!selected) return
    await patch("/api/inbox/lead", { leadId: selected, notes })
    toast({ title: "Notes saved" })
  }

  async function suppress() {
    if (!selected) return
    await patch("/api/inbox/lead", { leadId: selected, suppress: true })
    await loadList()
    await loadThread(selected)
    await onChanged()
    toast({ title: "Lead and domain suppressed" })
  }

  const CONV_STATUS_LABEL: Record<string, string> = {
    interested: "interested",
    question: "asked a question",
    negotiating: "picking a slot",
    booked: "meeting booked",
    active: "waiting for you",
    closed: "closed",
    unsubscribed: "unsubscribed",
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
      {/* list */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === f.id ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
          {conversations.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No conversations yet. Replies land here as the agent works.
              </CardContent>
            </Card>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected === c.id ? "border-emerald-500 bg-emerald-50/50" : "border-border bg-card hover:border-emerald-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{c.name}</span>
                {c.isHot && <Flame className="h-3.5 w-3.5 shrink-0 text-amber-600" />}
                {c.convStatus === "booked" && <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {c.title} · {c.company}
              </div>
              {c.lastMessage && (
                <div className="mt-1.5 truncate text-xs text-muted-foreground">
                  {c.lastMessage.direction === "in" ? "↩ " : "→ "}
                  {c.lastMessage.body}
                </div>
              )}
              {c.convStatus && (
                <Badge variant="outline" className="mt-2 text-[10px]">
                  {CONV_STATUS_LABEL[c.convStatus] ?? c.convStatus}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* thread */}
      <div className="flex min-h-[34rem] flex-col rounded-2xl border border-border bg-card">
        {!selected || !lead ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a conversation
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{lead.name}</span>
                  {lead.isHot && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                      <Flame className="mr-1 h-3 w-3" /> hot
                    </Badge>
                  )}
                  {lead.meetingAt && (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                      <CalendarCheck className="mr-1 h-3 w-3" />
                      {new Date(lead.meetingAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {lead.title} · {lead.company} · {lead.email} · campaign “{conversations.find((c) => c.id === lead.id)?.campaignName}”
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={suppress}>
                <Ban className="mr-2 h-3 w-3" /> Suppress
              </Button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: "24rem" }}>
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.direction === "out"
                        ? m.kind === "autopilot"
                          ? "bg-emerald-600/10 border border-emerald-200 text-emerald-950"
                          : "bg-emerald-600 text-white"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {m.kind === "autopilot" && (
                      <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                        <Bot className="h-3 w-3" /> autopilot
                      </div>
                    )}
                    {m.subject && m.direction === "out" && m.kind === "touch" && (
                      <div className="mb-1 text-xs opacity-70">Re: {m.subject}</div>
                    )}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={`mt-1 text-[10px] ${m.direction === "out" && m.kind !== "autopilot" ? "text-white/70" : "text-muted-foreground"}`}>
                      {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {m.channel === "linkedin" && " · LinkedIn"}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={threadEnd} />
            </div>

            <div className="space-y-2 border-t border-border/60 p-4">
              <Textarea
                placeholder="Write a reply as yourself (overrides autopilot for this exchange)..."
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" className="rounded-full bg-emerald-600 hover:bg-emerald-700" disabled={sending || !reply.trim()} onClick={send}>
                  {sending ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Send className="mr-2 h-3 w-3" />}
                  Send reply
                </Button>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-xs"
                    placeholder="Private notes about this lead"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={saveNotes}
                    aria-label="Lead notes"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                <Mail className="mr-1 inline h-3 w-3" />
                Autopilot pauses on leads you reply to manually.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
