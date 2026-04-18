import { db } from "../db.js";

export const fuelingLog = {
  name: "log_fueling",
  description: "Log actual fueling consumed during or after a session.",
  inputSchema: {
    type: "object",
    properties: {
      user_id:    { type: "string", description: "Athlete UUID" },
      workout_id: { type: "string", description: "Optional — link to a specific workout" },
      carb_g:     { type: "number", description: "Total carbs consumed (grams)" },
      sodium_mg:  { type: "number", description: "Total sodium consumed (mg)" },
      fluid_ml:   { type: "number", description: "Total fluid consumed (ml)" },
      notes:      { type: "string", description: "Optional notes (products used, GI issues, etc.)" },
    },
    required: ["user_id"],
  },
  async handler(args: Record<string, unknown>) {
    const { data, error } = await db()
      .from("fueling_log")
      .insert({
        user_id:    args.user_id,
        workout_id: args.workout_id ?? null,
        carb_g:     args.carb_g    ?? null,
        sodium_mg:  args.sodium_mg ?? null,
        fluid_ml:   args.fluid_ml  ?? null,
        notes:      args.notes     ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  },
};
