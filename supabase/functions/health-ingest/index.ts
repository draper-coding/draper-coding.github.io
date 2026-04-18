// Supabase Edge Function: health-ingest
// Receives Apple Health workout data and upserts into Postgres.
//
// Deploy:  supabase functions deploy health-ingest
// Invoke:  POST https://<project>.supabase.co/functions/v1/health-ingest
//          Authorization: Bearer <service_role_key>
//          Content-Type: application/json

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

interface IncomingWorkout {
  source_id: string;
  sport: "run" | "bike" | "swim" | "other";
  started_at: string;       // ISO 8601
  duration_sec: number;
  distance_m?: number;
  avg_hr_bpm?: number;
  max_hr_bpm?: number;
  notes?: string;
}

interface RequestBody {
  user_id: string;
  workouts: IncomingWorkout[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.user_id || !Array.isArray(body.workouts)) {
    return new Response(JSON.stringify({ error: "user_id and workouts[] required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const w of body.workouts) {
    if (!w.source_id || !w.sport || !w.started_at || !w.duration_sec) {
      errors.push(`Skipped workout missing required fields: ${w.source_id ?? "unknown"}`);
      continue;
    }

    const { data: existing } = await supabase
      .from("workouts")
      .select("id")
      .eq("user_id", body.user_id)
      .eq("source_id", w.source_id)
      .single();

    if (existing) {
      // Update HR data if we now have it
      await supabase
        .from("workouts")
        .update({ avg_hr_bpm: w.avg_hr_bpm, max_hr_bpm: w.max_hr_bpm })
        .eq("id", existing.id);

      // Recompute TSS if HR is present
      if (w.avg_hr_bpm) {
        await supabase.rpc("compute_tss", { p_workout_id: existing.id });
      }
      updated++;
    } else {
      const { data: inserted_row, error } = await supabase
        .from("workouts")
        .insert({
          user_id: body.user_id,
          source_id: w.source_id,
          sport: w.sport,
          started_at: w.started_at,
          duration_sec: w.duration_sec,
          distance_m: w.distance_m ?? null,
          avg_hr_bpm: w.avg_hr_bpm ?? null,
          max_hr_bpm: w.max_hr_bpm ?? null,
          notes: w.notes ?? null,
        })
        .select("id")
        .single();

      if (error) {
        errors.push(`Insert failed for ${w.source_id}: ${error.message}`);
        continue;
      }

      if (w.avg_hr_bpm && inserted_row) {
        await supabase.rpc("compute_tss", { p_workout_id: inserted_row.id });
      }
      inserted++;
    }
  }

  return new Response(
    JSON.stringify({ inserted, updated, errors }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
