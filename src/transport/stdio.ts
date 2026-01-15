/**
 * STDIO transport for sitemap-scout MCP server
 * Used for local development and direct integration
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

/**
 * Start the server with STDIO transport
 */
export async function startStdioTransport(server: Server): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("sitemap-scout MCP server started (STDIO transport)");
}
