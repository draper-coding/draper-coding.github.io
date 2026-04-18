import { db } from "../db.js";

export const raceReadiness = {
  name: "get_race_readiness",
  description: "Return race readiness score, TSB, CTL, and coaching notes for an upcoming race.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Athlete UUID" },
      race_id: { type: "string", description: "Race plan UUID from get_race_plans" },
    },
    required: ["user_id", "race_id"],
  },
  async handler(args: Record<string, unknown>) {
    const { data, error } = await db()
      .rpc("get_race_readiness", { p_race_id: args.race_id as string });

    if (error) throw new Error(error.message);
    return data;
  },
};
