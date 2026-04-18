import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { workouts }          from "./tools/workouts.js";
import { trainingLoad }      from "./tools/training-load.js";
import { dailyMetrics }      from "./tools/daily-metrics.js";
import { fuelingTargets }    from "./tools/fueling-targets.js";
import { fuelingLog }        from "./tools/fueling-log.js";
import { raceReadiness }     from "./tools/race-readiness.js";
import { periodComparison }  from "./tools/period-comparison.js";
import { racePlans }         from "./tools/race-plans.js";
import { athleteProfile }    from "./tools/athlete-profile.js";

const TOOLS = [
  workouts, trainingLoad, dailyMetrics, fuelingTargets, fuelingLog,
  raceReadiness, periodComparison, racePlans, athleteProfile,
];

const server = new Server(
  { name: "trifuel", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name:        t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
  }

  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: msg }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
