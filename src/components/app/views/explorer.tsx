"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Compass, Database, Search } from "lucide-react"
import { post, type ExplorerResponse } from "../api-client"

const SUGGESTED = ["dental clinic", "med spa", "saas", "logistics", "marketing agency", "vet clinic"]

export function ExplorerView() {
  const [query, setQuery] = useState("")
  const [data, setData] = useState<ExplorerResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(q: string) {
    const query = q.trim()
    if (!query) return
    setBusy(true)
    setError(null)
    try {
      const res = await post<ExplorerResponse>("/api/explorer", { query })
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Segments Explorer</h1>
        <p className="text-sm text-muted-foreground">
          Type business keywords - get market clusters, neighboring niches and TAM estimates (mirrors /tools/explorer).
        </p>
      </div>

      <form
        className="flex max-w-xl items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(query)
        }}
      >
        <Input
          placeholder="dental clinics, gpu providers, vc funds..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Market keywords"
        />
        <Button type="submit" className="rounded-full" disabled={busy || !query.trim()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Explore
        </Button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuery(s)
              run(s)
            }}
            className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground transition hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {data.clusters.map((c) => (
              <Card key={c.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Compass className="h-4 w-4 text-emerald-600" /> {c.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                  <div>
                    <div className="text-2xl font-semibold text-emerald-700">
                      {c.tamCompanies.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">estimated companies worldwide</div>
                  </div>
                  {c.neighboringNiches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {c.neighboringNiches.map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            setQuery(n)
                            run(n)
                          }}
                          className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-emerald-600" /> In this demo database
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl bg-secondary p-4">
                <div className="text-2xl font-semibold">{data.database.matches}</div>
                <div className="text-xs text-muted-foreground">
                  matching companies of {data.database.companiesIndexed} indexed ({data.database.peopleIndexed} people)
                </div>
              </div>
              <div className="sm:col-span-2">
                {data.database.matchedCompanies.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No local matches - the real product searches 105M+ companies. Add more industries to the seed to see them here.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {data.database.matchedCompanies.map((c) => (
                      <div key={c.name} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.industry} · {c.size} · {c.city}, {c.country}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
