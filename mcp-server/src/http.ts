// TriFuel MCP HTTP server — SSE transport for Claude.ai mobile (remote MCP connector)
//
// Start: node dist/http.js          (default port 3000, or PORT env var)
// SSE:   GET  /sse                  → opens event stream, emits { endpoint: "/messages/<id>" }
// RPC:   POST /messages/<sessionId> → receives JSON-RPC, routes to tool, streams result

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "crypto";

import { workouts }          from "./tools/workouts.js";
import { trainingLoad }      from "./tools/training-load.js";
import { dailyMetrics }      from "./tools/daily-metrics.js";
import { fuelingTargets }    from "./tools/fueling-targets.js";
import { fuelingLog }        from "./tools/fueling-log.js";
import { raceReadiness }     from "./tools/race-readiness.js";
import { periodComparison }  from "./tools/period-comparison.js";
import { racePlans }         from "./tools/race-plans.js";
import { athleteProfile }    from "./tools/athlete-profile.js";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler(args: Record<string, unknown>): Promise<unknown>;
};

const ALL_TOOLS: Tool[] = [
  workouts, trainingLoad, dailyMetrics, fuelingTargets, fuelingLog,
  raceReadiness, periodComparison, racePlans, athleteProfile,
];

// SSE session: wraps a WritableStreamDefaultWriter for the SSE response
interface Session {
  writer: WritableStreamDefaultWriter<string>;
  lastActivity: number;
}

export function createServer(tools: Tool[] = ALL_TOOLS): {
  app: Hono;
  start: (port: number) => void;
} {
  const app = new Hono();
  const sessions = new Map<string, Session>();

  // Evict sessions idle > 5 minutes
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60_000;
    for (const [id, s] of sessions) {
      if (s.lastActivity < cutoff) {
        s.writer.close().catch(() => {});
        sessions.delete(id);
      }
    }
  }, 60_000);

  // CORS
  app.use("*", async (c, next) => {
    c.header("Access-Control-Allow-Origin",  c.req.header("Origin") ?? "*");
    c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    c.header("Access-Control-Allow-Headers", "content-type,authorization");
    if (c.req.method === "OPTIONS") return c.text("", 204);
    return next();
  });

  // SSE endpoint: Claude connects here first
  app.get("/sse", (c) => {
    const sessionId = randomUUID();
    const { readable, writable } = new TransformStream<string, string>();
    const writer = writable.getWriter();

    sessions.set(sessionId, { writer, lastActivity: Date.now() });

    // Send endpoint event so Claude knows where to POST
    writer.write(`event: endpoint\ndata: ${JSON.stringify({ uri: `/messages/${sessionId}` })}\n\n`);

    // Keep-alive ping every 30 s
    const ping = setInterval(() => {
      writer.write(`: ping\n\n`).catch(() => clearInterval(ping));
    }, 30_000);

    c.req.raw.signal?.addEventListener("abort", () => {
      clearInterval(ping);
      writer.close().catch(() => {});
      sessions.delete(sessionId);
    });

    return new Response(
      readable.pipeThrough(new TextEncoderStream()),
      {
        headers: {
          "Content-Type":  "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection":    "keep-alive",
        },
      },
    );
  });

  // Message endpoint: Claude POSTs JSON-RPC here
  app.post("/messages/:sessionId", async (c) => {
    const { sessionId } = c.req.param();
    const session = sessions.get(sessionId);
    if (!session) return c.json({ error: "Session not found" }, 404);

    session.lastActivity = Date.now();

    let rpc: { id: unknown; method: string; params?: Record<string, unknown> };
    try {
      rpc = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    async function respond(result: unknown, isError = false) {
      const payload = isError
        ? { jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: result } }
        : { jsonrpc: "2.0", id: rpc.id, result };
      await session!.writer.write(`data: ${JSON.stringify(payload)}\n\n`);
    }

    if (rpc.method === "tools/list") {
      await respond({
        tools: tools.map((t) => ({
          name:        t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
      return c.text("", 202);
    }

    if (rpc.method === "tools/call") {
      const toolName = (rpc.params as Record<string, unknown>)?.name as string;
      const toolArgs = ((rpc.params as Record<string, unknown>)?.arguments ?? {}) as Record<string, unknown>;
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        await respond(`Unknown tool: ${toolName}`, true);
        return c.text("", 202);
      }

      try {
        const data = await tool.handler(toolArgs);
        await respond({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
      } catch (err) {
        await respond(err instanceof Error ? err.message : String(err), true);
      }
      return c.text("", 202);
    }

    await respond(`Unknown method: ${rpc.method}`, true);
    return c.text("", 202);
  });

  function start(port: number): void {
    serve({ fetch: app.fetch, port }, () => {
      console.log(`TriFuel MCP HTTP server listening on http://0.0.0.0:${port}`);
      console.log(`  SSE endpoint:     GET  http://0.0.0.0:${port}/sse`);
      console.log(`  Message endpoint: POST http://0.0.0.0:${port}/messages/<sessionId>`);
    });
  }

  return { app, start };
}

// Entry point when run directly
const port = parseInt(process.env.PORT ?? "3000", 10);
createServer().start(port);
