// Split-test statistics shared by the engine (auto-promotion) and the API
// (UI display). Two-proportion z-test on reply rates, two-tailed p-value.

export const AB_MIN_SENDS = 8 // minimum sent leads per arm before testing
export const AB_P_THRESHOLD = 0.1 // auto-promote when p drops below this

// Abramowitz-Stegun erf approximation (|err| < 1.5e-7).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

export interface SplitArm {
  id: string
  label: string
  sent: number
  replied: number
}

export interface SplitTestResult {
  leader: string | null // label of the best arm
  pValue: number | null // vs runner-up; null when testing isn't possible yet
  significant: boolean
  eligible: boolean // every arm has >= AB_MIN_SENDS sends
  leaderRate: number
  runnerRate: number
}

export function evaluateSplitTest(
  arms: SplitArm[],
  minSends: number = AB_MIN_SENDS,
  pThreshold: number = AB_P_THRESHOLD
): SplitTestResult {
  const withSends = arms.filter((a) => a.sent > 0)
  const eligible = arms.length >= 2 && arms.every((a) => a.sent >= minSends)
  const sorted = [...withSends].sort(
    (a, b) => b.replied / b.sent - a.replied / a.sent
  )
  const leader = sorted[0] ?? null
  const runner = sorted[1] ?? null

  const base: SplitTestResult = {
    leader: leader ? leader.label : null,
    pValue: null,
    significant: false,
    eligible,
    leaderRate: leader ? leader.replied / leader.sent : 0,
    runnerRate: runner ? runner.replied / runner.sent : 0,
  }
  if (!leader || !runner || !eligible) return base

  // pooled two-proportion z-test
  const p1 = leader.replied / leader.sent
  const p2 = runner.replied / runner.sent
  const pooled =
    (leader.replied + runner.replied) / (leader.sent + runner.sent)
  const se = Math.sqrt(
    pooled * (1 - pooled) * (1 / leader.sent + 1 / runner.sent)
  )
  if (se === 0) return { ...base, pValue: 1 }
  const z = (p1 - p2) / se
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  return {
    ...base,
    pValue,
    significant: p1 > p2 && pValue < pThreshold,
  }
}
