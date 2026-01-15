/**
 * HTTP transport for sitemap-scout MCP server
 * Primary transport for production deployments
 */

import express, { Request, Response, NextFunction } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getConfig } from "../config.js";

/**
 * Start the server with HTTP transport
 */
export async function startHttpTransport(server: Server): Promise<void> {
  const config = getConfig();
  const app = express();

  app.use(express.json());

  // Session management for HTTP transport
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  // Health check endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      server: "sitemap-scout",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    });
  });

  // MCP endpoint
  app.post("/mcp", async (req: Request, res: Response) => {
    // Get or create session
    let sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      transport = sessions.get(sessionId)!;
    } else {
      // Create new session
      sessionId = crypto.randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => sessionId!,
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, transport);
        },
      });

      // Connect server to transport
      await server.connect(transport);
    }

    // Handle the request
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          ok: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Internal server error",
          },
          meta: {
            retrieved_at: new Date().toISOString(),
          },
        });
      }
    }
  });

  // Handle DELETE for session cleanup
  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.close();
      sessions.delete(sessionId);
      res.status(200).json({ ok: true, message: "Session closed" });
    } else {
      res.status(404).json({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Session not found",
        },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      });
    }
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Internal server error",
      },
      meta: {
        retrieved_at: new Date().toISOString(),
      },
    });
  });

  // Start server
  app.listen(config.port, () => {
    console.log(`sitemap-scout MCP server started on port ${config.port}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    console.log(`MCP endpoint: http://localhost:${config.port}/mcp`);
  });
}
