/**
 * E2E tests for sitemap-scout MCP server
 * Tests the server through direct handler invocation
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";

describe("MCP Server E2E", () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const server = createServer();
    client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );

    // Create in-memory transport pair
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Connect both ends
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    cleanup = async () => {
      await client.close();
      await server.close();
    };
  });

  afterAll(async () => {
    if (cleanup) {
      await cleanup();
    }
  });

  describe("Tool listing", () => {
    it("should list all available tools", async () => {
      const response = await client.listTools();

      expect(response).toBeDefined();
      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBe(3);

      const toolNames = response.tools.map((t) => t.name);
      expect(toolNames).toContain("discover_sitemaps");
      expect(toolNames).toContain("list_sitemap_urls");
      expect(toolNames).toContain("build_crawl_frontier");
    });

    it("should have correct schema for discover_sitemaps", async () => {
      const response = await client.listTools();

      const discoverTool = response.tools.find((t) => t.name === "discover_sitemaps");
      expect(discoverTool).toBeDefined();
      expect(discoverTool!.inputSchema.properties?.url).toBeDefined();
      expect(discoverTool!.inputSchema.required).toContain("url");
    });

    it("should have correct schema for list_sitemap_urls", async () => {
      const response = await client.listTools();

      const listTool = response.tools.find((t) => t.name === "list_sitemap_urls");
      expect(listTool).toBeDefined();
      expect(listTool!.inputSchema.properties?.sitemap_url).toBeDefined();
      expect(listTool!.inputSchema.properties?.limit).toBeDefined();
      expect(listTool!.inputSchema.properties?.cursor).toBeDefined();
      expect(listTool!.inputSchema.required).toContain("sitemap_url");
    });

    it("should have correct schema for build_crawl_frontier", async () => {
      const response = await client.listTools();

      const frontierTool = response.tools.find((t) => t.name === "build_crawl_frontier");
      expect(frontierTool).toBeDefined();
      expect(frontierTool!.inputSchema.properties?.seed_url).toBeDefined();
      expect(frontierTool!.inputSchema.properties?.rules).toBeDefined();
      expect(frontierTool!.inputSchema.properties?.limit).toBeDefined();
      expect(frontierTool!.inputSchema.required).toContain("seed_url");
    });
  });

  describe("Tool execution", () => {
    it("should handle discover_sitemaps with invalid input", async () => {
      const response = await client.callTool({
        name: "discover_sitemaps",
        arguments: { url: "" },
      });

      expect(response.content).toBeDefined();
      expect(Array.isArray(response.content)).toBe(true);

      const textContent = response.content[0];
      expect(textContent.type).toBe("text");

      const result = JSON.parse((textContent as { type: "text"; text: string }).text);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INVALID_INPUT");
    });

    it("should handle list_sitemap_urls with invalid input", async () => {
      const response = await client.callTool({
        name: "list_sitemap_urls",
        arguments: { sitemap_url: "" },
      });

      expect(response.content).toBeDefined();
      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INVALID_INPUT");
    });

    it("should handle build_crawl_frontier with invalid input", async () => {
      const response = await client.callTool({
        name: "build_crawl_frontier",
        arguments: { seed_url: "" },
      });

      expect(response.content).toBeDefined();
      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INVALID_INPUT");
    });

    it("should handle unknown tool gracefully", async () => {
      const response = await client.callTool({
        name: "unknown_tool",
        arguments: {},
      });

      expect(response.content).toBeDefined();
      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error.message).toContain("Unknown tool");
    });

    it("should return proper response envelope structure", async () => {
      const response = await client.callTool({
        name: "discover_sitemaps",
        arguments: { url: "https://example.com" },
      });

      expect(response.content).toBeDefined();
      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);

      // Response should follow the standard envelope
      expect(typeof result.ok).toBe("boolean");
      expect(result.meta).toBeDefined();
      expect(result.meta.retrieved_at).toBeDefined();

      // Verify ISO-8601 timestamp format
      const timestamp = new Date(result.meta.retrieved_at);
      expect(timestamp.toISOString()).toBe(result.meta.retrieved_at);
    });
  });

  describe("Response envelope compliance", () => {
    it("should include all required success response fields", async () => {
      const response = await client.callTool({
        name: "list_sitemap_urls",
        arguments: { sitemap_url: "ftp://invalid.url" },
      });

      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);

      // Response structure
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("meta");
      expect(result.meta).toHaveProperty("retrieved_at");
    });

    it("should include error details on failure", async () => {
      const response = await client.callTool({
        name: "build_crawl_frontier",
        arguments: {
          seed_url: "https://example.com",
          rules: { include: [""] }, // Invalid empty pattern
        },
      });

      const textContent = response.content[0] as { type: "text"; text: string };
      const result = JSON.parse(textContent.text);
      expect(result.ok).toBe(false);
      expect(result.error).toHaveProperty("code");
      expect(result.error).toHaveProperty("message");
    });
  });
});
