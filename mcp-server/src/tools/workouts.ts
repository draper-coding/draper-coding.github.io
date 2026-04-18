import { db } from "../db.js";

export const workouts = {
  name: "get_workouts",
  description: "List recent workouts from Apple Health. Filter by sport, date range, or limit.",
  inputSchema: {
    type: "object",
    properties: {
      user_id:    { type: "string", description: "Athlete UUID" },
      limit:      { type: "number", description: "Max rows to return (default 20)" },
      sport:      { type: "string", description: "Filter by sport: run | bike | swim | other" },
      from_date:  { type: "string", description: "ISO date start (inclusive)" },
      to_date:    { type: "string", description: "ISO date end (inclusive)" },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    let query = db()
      .from("workouts")
      .select("id,sport,started_at,duration_sec,distance_m,avg_hr_bpm,tss_estimate,notes")
      .eq("user_id", args.user_id as string)
      .order("started_at", { ascending: false })
      .limit((args.limit as number) ?? 20);

    if (args.sport)     query = query.eq("sport", args.sport as string);
    if (args.from_date) query = query.gte("started_at", args.from_date as string);
    if (args.to_date)   query = query.lte("started_at", `${args.to_date}T23:59:59`);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  },
};
