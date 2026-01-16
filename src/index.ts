/**
 * sitemap-scout MCP Server
 *
 * Discover sitemaps for a site, enumerate sitemap URLs, and produce a crawl frontier.
 * HTTP-only transport for Dedalus platform deployment.
 */

import "dotenv/config";
import { startHttpTransport } from "./transport/http.js";

async function main(): Promise<void> {
  // Start HTTP transport directly on port 8080
  await startHttpTransport({ port: 8080 });
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
