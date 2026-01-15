/**
 * MCP Server implementation for sitemap-scout
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { discoverSitemaps, listSitemapUrls, buildCrawlFrontier } from "./tools/index.js";
import { CrawlFrontierRules } from "./types.js";

/**
 * Create and configure the MCP server
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: "sitemap-scout",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "discover_sitemaps",
          description:
            "Find all sitemaps for a given domain by checking /sitemap.xml, robots.txt Sitemap: directives, and sitemap index files",
          inputSchema: {
            type: "object" as const,
            properties: {
              url: {
                type: "string",
                description: "The domain URL to discover sitemaps for (e.g., https://example.com)",
              },
            },
            required: ["url"],
          },
        },
        {
          name: "list_sitemap_urls",
          description:
            "Enumerate URLs from a sitemap with pagination support. Works with both regular sitemaps and sitemap index files.",
          inputSchema: {
            type: "object" as const,
            properties: {
              sitemap_url: {
                type: "string",
                description: "The full URL of the sitemap to enumerate",
              },
              limit: {
                type: "number",
                description: "Maximum number of URLs to return per page (default: 100, max: 1000)",
              },
              cursor: {
                type: "string",
                description: "Pagination cursor from previous response",
                nullable: true,
              },
            },
            required: ["sitemap_url"],
          },
        },
        {
          name: "build_crawl_frontier",
          description:
            "Build a crawl frontier from discovered sitemaps with filtering rules. Discovers all sitemaps for a domain and collects URLs matching the specified rules.",
          inputSchema: {
            type: "object" as const,
            properties: {
              seed_url: {
                type: "string",
                description: "The seed URL/domain to build a frontier for",
              },
              rules: {
                type: "object",
                description: "Filtering rules for the crawl frontier",
                properties: {
                  include: {
                    type: "array",
                    items: { type: "string" },
                    description: "URL patterns to include (supports * wildcard)",
                  },
                  exclude: {
                    type: "array",
                    items: { type: "string" },
                    description: "URL patterns to exclude (supports * wildcard)",
                  },
                  max_urls: {
                    type: "number",
                    description: "Maximum number of URLs in the frontier (default: 5000)",
                  },
                },
              },
              limit: {
                type: "number",
                description: "Maximum number of URLs to return (applies after rules)",
              },
            },
            required: ["seed_url"],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "discover_sitemaps": {
        const url = args?.url as string;
        const result = await discoverSitemaps(url);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_sitemap_urls": {
        const sitemapUrl = args?.sitemap_url as string;
        const limit = args?.limit as number | undefined;
        const cursor = args?.cursor as string | null | undefined;
        const result = await listSitemapUrls(sitemapUrl, limit, cursor);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "build_crawl_frontier": {
        const seedUrl = args?.seed_url as string;
        const rules = args?.rules as CrawlFrontierRules | undefined;
        const limit = args?.limit as number | undefined;
        const result = await buildCrawlFrontier(seedUrl, rules, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: false,
                error: {
                  code: "INVALID_INPUT",
                  message: `Unknown tool: ${name}`,
                },
                meta: {
                  retrieved_at: new Date().toISOString(),
                },
              }),
            },
          ],
        };
    }
  });

  return server;
}
