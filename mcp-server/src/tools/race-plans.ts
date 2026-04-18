import { db } from "../db.js";

export const racePlans = {
  name: "get_race_plans",
  description: "List all race plans sorted by date, with days-to-race countdown.",
  inputSchema: {
    type: "object",
    properties: {
      user_id:       { type: "string", description: "Athlete UUID" },
      upcoming_only: { type: "boolean", description: "Only return races that haven't happened yet (default true)" },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    const upcomingOnly = (args.upcoming_only as boolean) ?? true;

    let query = db()
      .from("race_plans")
      .select("id,name,race_date,distance_category,target_finish_time_sec,notes")
      .eq("user_id", args.user_id as string)
      .order("race_date", { ascending: true });

    if (upcomingOnly) {
      query = query.gte("race_date", new Date().toISOString().slice(0, 10));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (data ?? []).map((r) => ({
      ...r,
      days_out: Math.ceil(
        (new Date(r.race_date).getTime() - today.getTime()) / 86_400_000,
      ),
    }));
  },
};
