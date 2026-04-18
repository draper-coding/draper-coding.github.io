import { db } from "../db.js";
import { classifySession, RaceDistance } from "../classifier.js";

export const fuelingTargets = {
  name: "get_fueling_targets",
  description:
    "Return a personalized fueling plan for a planned session. Carb target is capped at the athlete's gut-trained ceiling; sodium scales with personal sweat rate.",
  inputSchema: {
    type: "object",
    properties: {
      user_id:           { type: "string", description: "Athlete UUID" },
      sport:             { type: "string", description: "run | bike | swim | brick | other" },
      duration_min:      { type: "number", description: "Planned session duration in minutes" },
      avg_hr:            { type: "number", description: "Expected average HR (bpm)" },
      race_context:      { type: "boolean", description: "Is this a race?" },
      distance_category: { type: "string", description: "sprint|olympic|70.3|140.6|5k|10k|13.1|26.2" },
      is_brick:          { type: "boolean", description: "Bike-run brick session?" },
    },
    required: ["user_id", "sport", "duration_min"],
  },
  async handler(args: Record<string, unknown>) {
    const { data: user, error: userErr } = await db()
      .from("users")
      .select("threshold_hr_bpm,sweat_rate_ml_per_hr,carb_tolerance_g_per_hr")
      .eq("id", args.user_id as string)
      .single();

    if (userErr) throw new Error(userErr.message);

    const category = classifySession({
      sport:             args.sport as string,
      duration_min:      args.duration_min as number,
      avg_hr:            args.avg_hr as number | undefined,
      threshold_hr:      user.threshold_hr_bpm ?? undefined,
      race_context:      args.race_context as boolean | undefined,
      distance_category: args.distance_category as RaceDistance | undefined,
      is_brick:          args.is_brick as boolean | undefined,
    });

    const { data: ref, error: refErr } = await db()
      .from("fueling_targets_ref")
      .select("*")
      .eq("category", category)
      .single();

    if (refErr) throw new Error(refErr.message);

    // Personalize: cap carbs at athlete's gut ceiling
    const carbCap = user.carb_tolerance_g_per_hr ?? 75;
    const sweatRate = user.sweat_rate_ml_per_hr ?? 750;
    const sodiumScale = sweatRate / 750;  // normalize to reference sweat rate

    const plan = {
      category,
      carb_low_g_hr:    Math.min(ref.carb_low_g_hr,  carbCap),
      carb_high_g_hr:   Math.min(ref.carb_high_g_hr, carbCap),
      sodium_low_mg_hr: Math.round(ref.sodium_low_mg_hr  * sodiumScale),
      sodium_high_mg_hr:Math.round(ref.sodium_high_mg_hr * sodiumScale),
      fluid_low_ml_hr:  ref.fluid_low_ml_hr,
      fluid_high_ml_hr: ref.fluid_high_ml_hr,
      pre_window_min:   ref.pre_window_min,
      pre_carb_g:       ref.pre_carb_g,
      post_carb_g:      ref.post_carb_g,
      post_protein_g:   ref.post_protein_g,
      notes: carbCap < ref.carb_high_g_hr
        ? `Carb ceiling capped at ${carbCap} g/hr based on your current gut training. Bump 5 g/hr every few long sessions to increase.`
        : undefined,
    };

    return plan;
  },
};
