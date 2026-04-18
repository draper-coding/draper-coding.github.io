import { db } from "../db.js";

export const dailyMetrics = {
  name: "get_daily_metrics",
  description: "Return CTL/ATL/TSB plus optional HRV, resting HR, and sleep for a specific date.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Athlete UUID" },
      date:    { type: "string", description: "ISO date (YYYY-MM-DD). Defaults to today." },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    const date = (args.date as string) ?? new Date().toISOString().slice(0, 10);

    const { data, error } = await db()
      .from("daily_metrics")
      .select("date,ctl,atl,tsb,resting_hr_bpm,hrv_ms,sleep_hr")
      .eq("user_id", args.user_id as string)
      .eq("date", date)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
};
