export type SessionCategory =
  | "short_easy" | "medium_easy" | "long_easy"
  | "short_threshold" | "medium_threshold" | "long_threshold"
  | "brick"
  | "race_day_sprint" | "race_day_olympic" | "race_day_70_3" | "race_day_140_6"
  | "race_day_5k" | "race_day_10k" | "race_day_13_1" | "race_day_26_2";

export type RaceDistance = "sprint" | "olympic" | "70.3" | "140.6" | "5k" | "10k" | "13.1" | "26.2";

export interface ClassifyInput {
  sport: string;
  duration_min: number;
  avg_hr?: number;
  threshold_hr?: number;
  race_context?: boolean;
  distance_category?: RaceDistance;
  is_brick?: boolean;
}

function intensityZone(avg_hr: number, threshold_hr: number): "Z1" | "Z2" | "Z3" | "Z4" {
  const ratio = avg_hr / threshold_hr;
  if (ratio < 0.80) return "Z1";
  if (ratio < 0.87) return "Z2";
  if (ratio < 0.93) return "Z3";
  return "Z4";
}

export function classifySession(input: ClassifyInput): SessionCategory {
  const { sport, duration_min, avg_hr, threshold_hr, race_context, distance_category, is_brick } = input;

  // 1. Race day takes priority
  if (race_context && distance_category) {
    const raceMap: Record<RaceDistance, SessionCategory> = {
      "sprint":  "race_day_sprint",
      "olympic": "race_day_olympic",
      "70.3":    "race_day_70_3",
      "140.6":   "race_day_140_6",
      "5k":      "race_day_5k",
      "10k":     "race_day_10k",
      "13.1":    "race_day_13_1",
      "26.2":    "race_day_26_2",
    };
    return raceMap[distance_category];
  }

  // 2. Brick session
  if (is_brick || (sport === "brick")) return "brick";

  // 3. Classify by intensity + duration
  const zone = (avg_hr && threshold_hr) ? intensityZone(avg_hr, threshold_hr) : "Z2";
  const isEasy = zone === "Z1" || zone === "Z2";

  if (isEasy) {
    if (duration_min < 60) return "short_easy";
    if (duration_min < 90) return "medium_easy";
    return "long_easy";
  } else {
    if (duration_min < 60) return "short_threshold";
    if (duration_min < 90) return "medium_threshold";
    return "long_threshold";
  }
}

// Self-contained tests — import and call runTests() to verify all 15 categories
export function runTests(): void {
  const cases: [ClassifyInput, SessionCategory][] = [
    [{ sport: "run",  duration_min: 30,  avg_hr: 130, threshold_hr: 162 }, "short_easy"],
    [{ sport: "bike", duration_min: 70,  avg_hr: 135, threshold_hr: 162 }, "medium_easy"],
    [{ sport: "swim", duration_min: 100, avg_hr: 130, threshold_hr: 162 }, "long_easy"],
    [{ sport: "run",  duration_min: 45,  avg_hr: 150, threshold_hr: 162 }, "short_threshold"],
    [{ sport: "bike", duration_min: 75,  avg_hr: 148, threshold_hr: 162 }, "medium_threshold"],
    [{ sport: "run",  duration_min: 95,  avg_hr: 155, threshold_hr: 162 }, "long_threshold"],
    [{ sport: "brick",duration_min: 120, avg_hr: 140, threshold_hr: 162 }, "brick"],
    [{ sport: "run",  duration_min: 120, race_context: true, distance_category: "sprint"  }, "race_day_sprint"],
    [{ sport: "run",  duration_min: 120, race_context: true, distance_category: "olympic" }, "race_day_olympic"],
    [{ sport: "run",  duration_min: 240, race_context: true, distance_category: "70.3"    }, "race_day_70_3"],
    [{ sport: "run",  duration_min: 480, race_context: true, distance_category: "140.6"   }, "race_day_140_6"],
    [{ sport: "run",  duration_min: 25,  race_context: true, distance_category: "5k"      }, "race_day_5k"],
    [{ sport: "run",  duration_min: 55,  race_context: true, distance_category: "10k"     }, "race_day_10k"],
    [{ sport: "run",  duration_min: 110, race_context: true, distance_category: "13.1"    }, "race_day_13_1"],
    [{ sport: "run",  duration_min: 240, race_context: true, distance_category: "26.2"    }, "race_day_26_2"],
  ];

  let passed = 0;
  for (const [input, expected] of cases) {
    const got = classifySession(input);
    if (got === expected) {
      passed++;
    } else {
      console.error(`FAIL: expected ${expected}, got ${got} for`, input);
    }
  }
  console.log(`Classifier: ${passed}/${cases.length} tests passed`);
  if (passed !== cases.length) process.exit(1);
}
