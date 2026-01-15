/**
 * sitemap-scout MCP Server
 *
 * Discover sitemaps for a site, enumerate sitemap URLs, and produce a crawl frontier.
 */

import "dotenv/config";
import { parseArgs, printHelp } from "./cli.js";
import { createServer } from "./server.js";
import { startStdioTransport, startHttpTransport } from "./transport/index.js";

async function main(): Promise<void> {
  // Parse command-line arguments
  const args = parseArgs(process.argv.slice(2));

  // Handle help flag
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Override port from CLI if provided
  if (args.port) {
    process.env.PORT = args.port.toString();
  }

  // Create the MCP server
  const server = createServer();

  // Start with appropriate transport
  if (args.stdio) {
    await startStdioTransport(server);
  } else {
    await startHttpTransport(server);
  }
}

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  process.exit(1);
});

// Run main
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
