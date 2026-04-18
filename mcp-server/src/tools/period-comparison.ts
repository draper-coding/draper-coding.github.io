import { db } from "../db.js";

export const periodComparison = {
  name: "compare_periods",
  description: "Compare two training periods: average TSS, CTL delta, total distance, and workout counts by sport.",
  inputSchema: {
    type: "object",
    properties: {
      user_id:        { type: "string", description: "Athlete UUID" },
      period_a_start: { type: "string", description: "Period A start date (YYYY-MM-DD)" },
      period_a_end:   { type: "string", description: "Period A end date (YYYY-MM-DD)" },
      period_b_start: { type: "string", description: "Period B start date (YYYY-MM-DD)" },
      period_b_end:   { type: "string", description: "Period B end date (YYYY-MM-DD)" },
    },
    required: ["user_id", "period_a_start", "period_a_end", "period_b_start", "period_b_end"],
  },
  async handler(args: Record<string, unknown>) {
    const uid = args.user_id as string;

    async function periodStats(start: string, end: string) {
      const { data: wk } = await db()
        .from("workouts")
        .select("sport,duration_sec,distance_m,tss_estimate")
        .eq("user_id", uid)
        .gte("started_at", start)
        .lte("started_at", `${end}T23:59:59`);

      const { data: dm } = await db()
        .from("daily_metrics")
        .select("ctl")
        .eq("user_id", uid)
        .gte("date", start)
        .lte("date", end)
        .order("date", { ascending: false })
        .limit(1);

      const rows = wk ?? [];
      const bySport: Record<string, { count: number; tss: number; dist_m: number }> = {};
      let totalTss = 0;

      for (const w of rows) {
        if (!bySport[w.sport]) bySport[w.sport] = { count: 0, tss: 0, dist_m: 0 };
        bySport[w.sport].count++;
        bySport[w.sport].tss      += w.tss_estimate ?? 0;
        bySport[w.sport].dist_m   += w.distance_m ?? 0;
        totalTss += w.tss_estimate ?? 0;
      }

      return {
        total_workouts: rows.length,
        total_tss:      Math.round(totalTss),
        avg_tss_per_workout: rows.length ? Math.round(totalTss / rows.length) : 0,
        ending_ctl:     dm?.[0]?.ctl ?? null,
        by_sport:       bySport,
      };
    }

    const [a, b] = await Promise.all([
      periodStats(args.period_a_start as string, args.period_a_end as string),
      periodStats(args.period_b_start as string, args.period_b_end as string),
    ]);

    return {
      period_a: { start: args.period_a_start, end: args.period_a_end, ...a },
      period_b: { start: args.period_b_start, end: args.period_b_end, ...b },
      delta: {
        total_tss:   b.total_tss - a.total_tss,
        ctl:         b.ending_ctl !== null && a.ending_ctl !== null
                       ? Math.round(b.ending_ctl - a.ending_ctl)
                       : null,
      },
    };
  },
};
