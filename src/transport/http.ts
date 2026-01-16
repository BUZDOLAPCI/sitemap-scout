/**
 * HTTP transport for sitemap-scout MCP server
 * HTTP-only transport for Dedalus platform deployment
 * Uses raw Node.js HTTP for MCP SDK compatibility
 */

import { createServer as createHttpServer, IncomingMessage, ServerResponse, Server as HttpServer } from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { createServer as createMcpServer } from "../server.js";

// Session management for HTTP transport
const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; server: Server }
>();

export interface HttpTransportOptions {
  port: number;
}

/**
 * Start the server with HTTP transport
 * Returns the HTTP server instance for testing purposes
 */
export async function startHttpTransport(options: HttpTransportOptions): Promise<HttpServer> {
  const { port } = options;

  const httpServer = createHttpServer();

  httpServer.on("request", async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    switch (url.pathname) {
      case "/mcp":
        await handleMcpRequest(req, res);
        break;
      case "/health":
        handleHealthCheck(res);
        break;
      default:
        handleNotFound(res);
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      console.log(`sitemap-scout MCP server started on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
      console.log(`MCP endpoint: http://localhost:${port}/mcp`);
      resolve(httpServer);
    });
  });
}

/**
 * Handle MCP requests with session management
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // Handle existing session
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: {
            code: "INVALID_INPUT",
            message: "Session not found",
          },
          meta: {
            retrieved_at: new Date().toISOString(),
          },
        })
      );
      return;
    }
    await session.transport.handleRequest(req, res);
    return;
  }

  // Handle DELETE for session cleanup (without session ID means invalid)
  if (req.method === "DELETE") {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Session ID required for DELETE",
        },
        meta: {
          retrieved_at: new Date().toISOString(),
        },
      })
    );
    return;
  }

  // Create new session for POST requests
  if (req.method === "POST") {
    try {
      const serverInstance = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          sessions.set(sid, { transport, server: serverInstance });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          sessions.delete(transport.sessionId);
        }
      };

      await serverInstance.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.writableEnded) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ok: false,
            error: {
              code: "INTERNAL_ERROR",
              message: "Internal server error",
            },
            meta: {
              retrieved_at: new Date().toISOString(),
            },
          })
        );
      }
    }
    return;
  }

  // Invalid request method
  res.statusCode = 400;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid request method",
      },
      meta: {
        retrieved_at: new Date().toISOString(),
      },
    })
  );
}

/**
 * Handle health check requests
 */
function handleHealthCheck(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      status: "healthy",
      server: "sitemap-scout",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Handle 404 not found
 */
function handleNotFound(res: ServerResponse): void {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Endpoint not found",
      },
      meta: {
        retrieved_at: new Date().toISOString(),
      },
    })
  );
}
