import { db } from "../db.js";

export const trainingLoad = {
  name: "get_training_load",
  description: "Return CTL, ATL, and TSB (form) time series. Use to chart fitness and fatigue trends.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Athlete UUID" },
      days:    { type: "number", description: "How many days back to return (default 90)" },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    const days = (args.days as number) ?? 90;
    const from = new Date();
    from.setDate(from.getDate() - days);

    const { data, error } = await db()
      .from("daily_metrics")
      .select("date,ctl,atl,tsb,resting_hr_bpm,hrv_ms,sleep_hr")
      .eq("user_id", args.user_id as string)
      .gte("date", from.toISOString().slice(0, 10))
      .order("date", { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  },
};
