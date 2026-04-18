// TriFuel Dashboard — app.js
// Requires: Supabase JS v2 and Chart.js loaded via CDN in index.html

// ── Fueling reference data (mirrors 002_fueling.sql seed) ──────────────────
const FUELING_REF = {
  short_easy:        { carb_lo:20, carb_hi:40, sod_lo:300, sod_hi:500,  fl_lo:400, fl_hi:600,  pre_min:60,  pre_carb:30,  post_carb:40,  post_pro:15 },
  medium_easy:       { carb_lo:40, carb_hi:60, sod_lo:400, sod_hi:600,  fl_lo:500, fl_hi:700,  pre_min:60,  pre_carb:40,  post_carb:50,  post_pro:20 },
  long_easy:         { carb_lo:60, carb_hi:80, sod_lo:500, sod_hi:700,  fl_lo:600, fl_hi:800,  pre_min:90,  pre_carb:60,  post_carb:80,  post_pro:25 },
  short_threshold:   { carb_lo:40, carb_hi:60, sod_lo:400, sod_hi:600,  fl_lo:500, fl_hi:700,  pre_min:60,  pre_carb:50,  post_carb:60,  post_pro:20 },
  medium_threshold:  { carb_lo:60, carb_hi:80, sod_lo:500, sod_hi:700,  fl_lo:600, fl_hi:900,  pre_min:60,  pre_carb:60,  post_carb:70,  post_pro:25 },
  long_threshold:    { carb_lo:70, carb_hi:90, sod_lo:600, sod_hi:900,  fl_lo:700, fl_hi:1000, pre_min:90,  pre_carb:70,  post_carb:90,  post_pro:30 },
  brick:             { carb_lo:60, carb_hi:80, sod_lo:500, sod_hi:800,  fl_lo:600, fl_hi:900,  pre_min:90,  pre_carb:60,  post_carb:80,  post_pro:25 },
  race_day_sprint:   { carb_lo:50, carb_hi:70, sod_lo:500, sod_hi:800,  fl_lo:600, fl_hi:800,  pre_min:90,  pre_carb:60,  post_carb:80,  post_pro:25 },
  race_day_olympic:  { carb_lo:60, carb_hi:80, sod_lo:600, sod_hi:900,  fl_lo:700, fl_hi:900,  pre_min:90,  pre_carb:70,  post_carb:90,  post_pro:30 },
  race_day_70_3:     { carb_lo:70, carb_hi:90, sod_lo:700, sod_hi:1000, fl_lo:800, fl_hi:1100, pre_min:120, pre_carb:90,  post_carb:100, post_pro:35 },
  race_day_140_6:    { carb_lo:80, carb_hi:100,sod_lo:900, sod_hi:1200, fl_lo:1000,fl_hi:1300, pre_min:120, pre_carb:100, post_carb:120, post_pro:40 },
  race_day_5k:       { carb_lo:0,  carb_hi:15, sod_lo:100, sod_hi:300,  fl_lo:200, fl_hi:400,  pre_min:45,  pre_carb:40,  post_carb:50,  post_pro:20 },
  race_day_10k:      { carb_lo:15, carb_hi:30, sod_lo:200, sod_hi:500,  fl_lo:300, fl_hi:600,  pre_min:60,  pre_carb:50,  post_carb:60,  post_pro:20 },
  race_day_13_1:     { carb_lo:30, carb_hi:60, sod_lo:500, sod_hi:800,  fl_lo:600, fl_hi:900,  pre_min:90,  pre_carb:60,  post_carb:80,  post_pro:25 },
  race_day_26_2:     { carb_lo:60, carb_hi:90, sod_lo:800, sod_hi:1200, fl_lo:900, fl_hi:1200, pre_min:120, pre_carb:80,  post_carb:100, post_pro:35 },
};

// ── Classifier (mirrors classifier.ts) ────────────────────────────────────
function intensityZone(avgHr, threshHr) {
  const r = avgHr / threshHr;
  if (r < 0.80) return "Z1";
  if (r < 0.87) return "Z2";
  if (r < 0.93) return "Z3";
  return "Z4";
}

function classifySession({ sport, durationMin, avgHr, threshHr, raceContext, distCategory, isBrick }) {
  if (raceContext && distCategory) {
    const map = {
      sprint: "race_day_sprint", olympic: "race_day_olympic",
      "70.3": "race_day_70_3",   "140.6": "race_day_140_6",
      "5k":   "race_day_5k",    "10k":   "race_day_10k",
      "13.1": "race_day_13_1",  "26.2":  "race_day_26_2",
    };
    return map[distCategory];
  }
  if (isBrick || sport === "brick") return "brick";

  const zone = (avgHr && threshHr) ? intensityZone(avgHr, threshHr) : "Z2";
  const easy = zone === "Z1" || zone === "Z2";

  if (easy) {
    if (durationMin < 60) return "short_easy";
    if (durationMin < 90) return "medium_easy";
    return "long_easy";
  } else {
    if (durationMin < 60) return "short_threshold";
    if (durationMin < 90) return "medium_threshold";
    return "long_threshold";
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const cfg = window.TRIFUEL_CONFIG;

  if (
    !cfg ||
    cfg.supabaseUrl === "YOUR_SUPABASE_URL" ||
    cfg.supabaseAnonKey === "YOUR_SUPABASE_ANON_KEY"
  ) {
    document.getElementById("config-warning").style.display = "block";
    renderFuelingPlanner(null);
    return;
  }

  const supabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  // Fetch user profile for personalization
  let userProfile = null;
  try {
    const { data } = await supabase
      .from("users")
      .select("threshold_hr_bpm,sweat_rate_ml_per_hr,carb_tolerance_g_per_hr")
      .eq("id", cfg.userId)
      .single();
    userProfile = data;
  } catch (_) {}

  await Promise.all([
    renderTrainingLoad(supabase, cfg.userId),
    renderNextRace(supabase, cfg.userId),
    renderWorkouts(supabase, cfg.userId),
  ]);

  renderFuelingPlanner(userProfile);
});

// ── Training Load chart ────────────────────────────────────────────────────
async function renderTrainingLoad(supabase, userId) {
  const container = document.getElementById("load-chart-container");
  const from = new Date();
  from.setDate(from.getDate() - 90);

  const { data, error } = await supabase
    .from("daily_metrics")
    .select("date,ctl,atl,tsb")
    .eq("user_id", userId)
    .gte("date", from.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (error || !data?.length) {
    container.innerHTML = '<p class="empty-state">No training load data yet. Workouts will populate this once synced.</p>';
    updateStatPills(null);
    return;
  }

  const labels = data.map((r) => r.date.slice(5)); // MM-DD
  const ctl    = data.map((r) => r.ctl);
  const atl    = data.map((r) => r.atl);
  const tsb    = data.map((r) => r.tsb);

  const canvas = document.getElementById("load-chart");
  new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "CTL", data: ctl, borderColor: "#3b82f6", backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "ATL", data: atl, borderColor: "#f97316", backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Form (TSB)", data: tsb, borderColor: "#22c55e", backgroundColor: "transparent", borderWidth: 2, pointRadius: 0, tension: 0.3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#8b949e", maxTicksLimit: 10 }, grid: { color: "#30363d" } },
        y: { ticks: { color: "#8b949e" }, grid: { color: "#30363d" } },
      },
    },
  });

  const latest = data[data.length - 1];
  updateStatPills(latest);
}

function updateStatPills(latest) {
  const set = (id, val, fmt) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (val === null || val === undefined) { el.textContent = "—"; return; }
    el.textContent = fmt(val);
    if (id === "stat-tsb") {
      el.className = "value " + (val > 5 ? "positive" : val < -10 ? "negative" : "neutral");
    }
  };
  set("stat-ctl", latest?.ctl,  (v) => Math.round(v));
  set("stat-atl", latest?.atl,  (v) => Math.round(v));
  set("stat-tsb", latest?.tsb,  (v) => (v > 0 ? "+" : "") + Math.round(v));
}

// ── Next Race card ─────────────────────────────────────────────────────────
async function renderNextRace(supabase, userId) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("race_plans")
    .select("id,name,race_date,distance_category,notes")
    .eq("user_id", userId)
    .gte("race_date", today)
    .order("race_date", { ascending: true })
    .limit(1);

  const el = document.getElementById("race-card-body");

  if (error || !data?.length) {
    el.innerHTML = '<p id="no-races" class="empty-state">No upcoming races. Add one in your race_plans table.</p>';
    return;
  }

  const race = data[0];
  const daysOut = Math.ceil((new Date(race.race_date) - new Date()) / 86_400_000);

  // Fetch readiness — best-effort
  let readinessPct = 50;
  let readinessNotes = [];
  try {
    const { data: rr } = await supabase.rpc("get_race_readiness", { p_race_id: race.id });
    if (rr) {
      readinessPct   = rr.readiness_pct ?? 50;
      readinessNotes = rr.notes ?? [];
    }
  } catch (_) {}

  el.innerHTML = `
    <div class="race-header">
      <div class="race-name">${esc(race.name)}</div>
      <div class="race-distance">${esc(race.distance_category)}</div>
    </div>
    <p class="countdown"><strong>${daysOut}</strong> days out · ${esc(race.race_date)}</p>
    <div class="readiness-bar-wrap">
      <div class="readiness-bar" style="width:${readinessPct}%"></div>
    </div>
    <p class="readiness-label">Readiness <strong>${readinessPct}%</strong></p>
    ${readinessNotes.length ? `<ul class="race-notes">${readinessNotes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${race.notes ? `<p class="race-notes" style="margin-top:.5rem;list-style:none">${esc(race.notes)}</p>` : ""}
  `;
}

// ── Fueling Planner (no network call needed — uses local reference table) ──
function renderFuelingPlanner(profile) {
  const carbCap  = profile?.carb_tolerance_g_per_hr ?? 75;
  const sweatRate= profile?.sweat_rate_ml_per_hr ?? 750;
  const sodScale = sweatRate / 750;

  const form = document.getElementById("fueling-form");
  const output = document.getElementById("fueling-output");

  function recalc() {
    const sport      = document.getElementById("plan-sport").value;
    const dur        = parseInt(document.getElementById("plan-dur").value, 10);
    const hrPct      = parseInt(document.getElementById("plan-intensity").value, 10);
    const race       = document.getElementById("plan-race").value !== "none";
    const raceDist   = document.getElementById("plan-race").value !== "none"
                       ? document.getElementById("plan-race").value
                       : undefined;
    const threshHr   = profile?.threshold_hr_bpm ?? 162;
    const avgHr      = Math.round(threshHr * hrPct / 100);

    document.getElementById("dur-val").textContent = `${dur} min`;
    document.getElementById("intensity-val").textContent = `${hrPct}% (≈${avgHr} bpm)`;

    const cat = classifySession({
      sport, durationMin: dur, avgHr, threshHr,
      raceContext: race, distCategory: raceDist,
    });
    const ref = FUELING_REF[cat];
    if (!ref) return;

    const cLo = Math.min(ref.carb_lo, carbCap);
    const cHi = Math.min(ref.carb_hi, carbCap);
    const sLo = Math.round(ref.sod_lo * sodScale);
    const sHi = Math.round(ref.sod_hi * sodScale);
    const capped = carbCap < ref.carb_hi;

    output.innerHTML = `
      <p style="font-size:.75rem;color:var(--muted);margin-bottom:.5rem">Category: <strong style="color:var(--text)">${cat.replace(/_/g," ")}</strong></p>
      <table class="fueling-table">
        <thead><tr><th>What</th><th>When</th><th>Target</th></tr></thead>
        <tbody>
          <tr><td>Carbohydrate</td><td>During (per hr)</td><td>${cLo}–${cHi} g</td></tr>
          <tr><td>Sodium</td><td>During (per hr)</td><td>${sLo}–${sHi} mg</td></tr>
          <tr><td>Fluid</td><td>During (per hr)</td><td>${ref.fl_lo}–${ref.fl_hi} ml</td></tr>
          <tr><td>Carbs (pre)</td><td>${ref.pre_min} min before</td><td>${ref.pre_carb} g</td></tr>
          <tr><td>Carbs (post)</td><td>Within 30 min</td><td>${ref.post_carb} g</td></tr>
          <tr><td>Protein (post)</td><td>Within 30 min</td><td>${ref.post_pro} g</td></tr>
        </tbody>
      </table>
      ${capped ? `<p class="fueling-note">Carb ceiling capped at ${carbCap} g/hr (your current gut ceiling). Bump 5 g/hr every few long sessions to increase.</p>` : ""}
    `;
  }

  form.addEventListener("change", recalc);
  form.addEventListener("input",  recalc);
  recalc();
}

// ── Recent Workouts ────────────────────────────────────────────────────────
async function renderWorkouts(supabase, userId) {
  const tbody = document.getElementById("workouts-tbody");

  const { data, error } = await supabase
    .from("workouts")
    .select("sport,started_at,duration_sec,distance_m,tss_estimate")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(10);

  if (error || !data?.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No workouts yet.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((w) => {
    const date = w.started_at.slice(0, 10);
    const dur  = fmtDuration(w.duration_sec);
    const dist = w.distance_m ? `${(w.distance_m / 1000).toFixed(1)} km` : "—";
    const tss  = w.tss_estimate ? Math.round(w.tss_estimate) : "—";
    return `<tr>
      <td>${date}</td>
      <td><span class="sport-badge sport-${w.sport}">${w.sport}</span></td>
      <td>${dur}</td>
      <td>${dist}</td>
      <td>${tss}</td>
    </tr>`;
  }).join("");
}

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function esc(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
