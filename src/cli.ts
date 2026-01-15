/**
 * Command-line argument parsing for sitemap-scout MCP server
 */

export interface CliArgs {
  stdio: boolean;
  port?: number;
  help: boolean;
}

/**
 * Parse command-line arguments
 */
export function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    stdio: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "--stdio":
      case "-s":
        result.stdio = true;
        break;

      case "--port":
      case "-p":
        const portArg = args[++i];
        if (portArg) {
          const port = parseInt(portArg, 10);
          if (!isNaN(port) && port > 0 && port < 65536) {
            result.port = port;
          }
        }
        break;

      case "--help":
      case "-h":
        result.help = true;
        break;
    }
  }

  return result;
}

/**
 * Print help message
 */
export function printHelp(): void {
  console.log(`
sitemap-scout - MCP server for sitemap discovery and crawl frontier building

Usage:
  sitemap-scout [options]

Options:
  --stdio, -s       Use STDIO transport (for local development)
  --port, -p PORT   HTTP server port (default: 8000)
  --help, -h        Show this help message

Environment Variables:
  PORT                     HTTP server port (default: 8000)
  REQUEST_TIMEOUT          Request timeout in ms (default: 30000)
  MAX_CONCURRENT_REQUESTS  Max concurrent requests (default: 5)

Examples:
  # Start with HTTP transport on default port
  sitemap-scout

  # Start with HTTP transport on custom port
  sitemap-scout --port 3000

  # Start with STDIO transport
  sitemap-scout --stdio

Tools:
  discover_sitemaps     Find all sitemaps for a domain
  list_sitemap_urls     Enumerate URLs from a sitemap with pagination
  build_crawl_frontier  Build a crawl frontier with filtering rules
`);
}
