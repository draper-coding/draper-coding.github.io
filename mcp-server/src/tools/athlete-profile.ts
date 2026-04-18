import { db } from "../db.js";

export const athleteProfile = {
  name: "get_athlete_profile",
  description: "Return the full athlete profile including FTP, threshold HR, CSS, sweat rate, and carb tolerance ceiling.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Athlete UUID" },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    const { data, error } = await db()
      .from("users")
      .select("id,name,ftp_watts,threshold_hr_bpm,css_per_100m_sec,sweat_rate_ml_per_hr,carb_tolerance_g_per_hr,created_at")
      .eq("id", args.user_id as string)
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
};
