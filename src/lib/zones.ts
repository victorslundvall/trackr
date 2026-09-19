import { TARGET_MUSCLES } from "./settings";

/** One feedback answer + how many hard sets the muscle got in the 7 days up to that session. */
export type FeedbackRow = {
  workout_id: string;
  template_id: string | null;
  started_at: string;
  muscle: string;
  recovery: number | null;
  pump: number | null;
  effort: number | null;
  joint_pain: boolean;
  week_sets: number;
  sleep: number | null;
  energy: number | null;
  exercises: string[] | null;
};

export type Zone = {
  muscle: string;
  low: number; // pumpen/stimulit blir bra ungefär härifrån
  high: number; // återhämtningen börjar svikta här (eller högsta testade)
  sweet: number | null; // där pumpen varit som bäst med god återhämtning
  tested: boolean; // true = vi har sett återhämtningen svikta, high är en verklig gräns
  n: number;
  weeks: number;
  confidence: "låg" | "medel" | "hög";
};

type Kind = "over" | "under" | "good" | "mid";

/** Recovery failing or joints complaining = too much. Pump weak while fresh = too little. */
export function classify(r: Pick<FeedbackRow, "recovery" | "pump" | "effort" | "joint_pain">): Kind {
  if (r.recovery === 1 || r.joint_pain) return "over";
  if (r.pump === 1 && r.recovery === 3 && r.effort !== 3) return "under";
  if ((r.pump ?? 0) >= 2 && (r.recovery ?? 0) >= 2) return "good";
  return "mid";
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const r1 = (n: number) => Math.round(n * 2) / 2;

/**
 * Personal weekly volume landmarks per muscle, learned from the feedback.
 * Sessions after a bad night (sleep ≤ 2 of 5) count only half, so one rough day doesn't move the zone.
 * Needs ≥ 4 answers over ≥ 2 weeks; confidence grows with data.
 */
export function estimateZones(rows: FeedbackRow[]): Map<string, Zone> {
  const out = new Map<string, Zone>();
  const by = new Map<string, FeedbackRow[]>();
  rows.forEach((r) => {
    if (!TARGET_MUSCLES.includes(r.muscle) || r.recovery == null || r.pump == null) return;
    by.set(r.muscle, [...(by.get(r.muscle) ?? []), r]);
  });
  for (const [muscle, list] of by) {
    const weeks = new Set(list.map((r) => weekKey(r.started_at))).size;
    if (list.length < 4 || weeks < 2) continue;
    // weight: bad sleep days count half (duplicated rows would be clumsy – we just drop every other one)
    let skip = false;
    const used = list.filter((r) => {
      if (r.sleep != null && r.sleep <= 2) return (skip = !skip);
      return true;
    });
    const good = used.filter((r) => classify(r) === "good").map((r) => Number(r.week_sets));
    const over = used.filter((r) => classify(r) === "over").map((r) => Number(r.week_sets));
    const under = used.filter((r) => classify(r) === "under").map((r) => Number(r.week_sets));
    if (!good.length && !over.length) continue;

    let low = good.length ? q(good, 0.25) : Math.max(0, q(over, 0.25) - 4);
    // under-stimulated at volumes above the "low" end → low end must be higher
    const underAbove = under.filter((s) => s >= low);
    if (underAbove.length) low = Math.max(low, Math.max(...underAbove) + 1);

    let high: number;
    let tested = false;
    const overAboveLow = over.filter((s) => s > low);
    if (overAboveLow.length) {
      high = Math.max(low + 1, q(overAboveLow, 0.25) - 1);
      tested = true;
    } else {
      high = good.length ? Math.max(...good) : low + 2;
    }
    const pumpTop = used.filter((r) => classify(r) === "good" && r.pump === 3).map((r) => Number(r.week_sets));
    const sweetSrc = pumpTop.length ? pumpTop : good;
    const sweet = sweetSrc.length ? Math.min(high, Math.max(low, q(sweetSrc, 0.5))) : null;

    out.set(muscle, {
      muscle,
      low: r1(low),
      high: r1(high),
      sweet: sweet != null ? r1(sweet) : null,
      tested,
      n: list.length,
      weeks,
      confidence: list.length >= 12 && weeks >= 4 ? "hög" : list.length >= 6 && weeks >= 3 ? "medel" : "låg",
    });
  }
  return out;
}

/** Use the personal zone as target when it's trustworthy enough, otherwise the philosophy's range. */
export function effectiveTarget(zone: Zone | undefined, fallback: { min: number; max: number } | null) {
  if (zone && zone.confidence !== "låg") return { min: zone.low, max: zone.high, personal: true, tested: zone.tested };
  return fallback ? { ...fallback, personal: false, tested: false } : null;
}

export function weekKey(iso: string) {
  const d = new Date(iso);
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return `${m.getFullYear()}-${m.getMonth() + 1}-${m.getDate()}`;
}

export function zoneText(z: Zone) {
  const f = (n: number) => n.toLocaleString("sv-SE");
  return `${f(z.low)}–${f(z.high)} set/v${z.tested ? "" : " (inte testat högre)"}${z.sweet != null ? `, bäst pump kring ${f(z.sweet)}` : ""} · ${z.n} svar, säkerhet ${z.confidence}`;
}
