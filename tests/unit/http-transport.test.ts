/**
 * Unit tests for HTTP transport and /mcp endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server as HttpServer } from "http";
import { startHttpTransport } from "../../src/transport/http.js";

describe("HTTP Transport", () => {
  let server: HttpServer;
  const TEST_PORT = 18080;

  beforeAll(async () => {
    server = await startHttpTransport({ port: TEST_PORT });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe("/mcp endpoint", () => {
    it("should respond to POST /mcp with tools/list JSON-RPC request", async () => {
      const jsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(jsonRpcRequest),
      });

      expect(response.status).toBe(200);

      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");

      const text = await response.text();
      // The response should contain event stream data with the server capabilities
      expect(text).toContain("event:");
      expect(text).toContain("data:");
    });

    it("should respond with session ID header on successful initialization", async () => {
      const jsonRpcRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(jsonRpcRequest),
      });

      expect(response.status).toBe(200);
      const sessionId = response.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe("string");
    });

    it("should reject invalid request methods", async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_INPUT");
      expect(body.error.message).toBe("Invalid request method");
    });

    it("should reject DELETE without session ID", async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe("Session ID required for DELETE");
    });

    it("should return 404 for invalid session ID", async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mcp-session-id": "invalid-session-id",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe("Session not found");
    });
  });

  describe("/health endpoint", () => {
    it("should return healthy status", async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/health`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("healthy");
      expect(body.server).toBe("sitemap-scout");
      expect(body.version).toBe("1.0.0");
      expect(body.timestamp).toBeDefined();
    });
  });

  describe("404 handling", () => {
    it("should return 404 for unknown endpoints", async () => {
      const response = await fetch(`http://localhost:${TEST_PORT}/unknown`);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Endpoint not found");
    });
  });

  describe("Full MCP flow with tools/list", () => {
    it("should complete initialize and tools/list flow", async () => {
      // Step 1: Initialize session
      const initRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "test-client",
            version: "1.0.0",
          },
        },
      };

      const initResponse = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(initRequest),
      });

      expect(initResponse.status).toBe(200);
      const sessionId = initResponse.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();

      // Parse the SSE response to verify initialization succeeded
      const initText = await initResponse.text();
      expect(initText).toContain("data:");

      // Step 2: Send notifications/initialized
      const initializedNotification = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      const notifyResponse = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId!,
        },
        body: JSON.stringify(initializedNotification),
      });

      expect(notifyResponse.status).toBe(202);

      // Step 3: Request tools/list
      const toolsListRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      };

      const toolsResponse = await fetch(`http://localhost:${TEST_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "mcp-session-id": sessionId!,
        },
        body: JSON.stringify(toolsListRequest),
      });

      expect(toolsResponse.status).toBe(200);

      const toolsText = await toolsResponse.text();
      // Verify it contains the expected tools
      expect(toolsText).toContain("discover_sitemaps");
      expect(toolsText).toContain("list_sitemap_urls");
      expect(toolsText).toContain("build_crawl_frontier");
    });
  });
});
