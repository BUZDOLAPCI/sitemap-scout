/**
 * Configuration management for sitemap-scout MCP server
 */

export interface Config {
  port: number;
  requestTimeout: number;
  maxConcurrentRequests: number;
  userAgent: string;
}

// Default configuration values
const defaults: Config = {
  port: 8080,
  requestTimeout: 30000,
  maxConcurrentRequests: 5,
  userAgent: "sitemap-scout/1.0 (MCP Server; +https://github.com/dedalus/sitemap-scout)",
};

// Parse integer with fallback
function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Load configuration from environment
export function loadConfig(): Config {
  return {
    port: parseIntOrDefault(process.env.PORT, defaults.port),
    requestTimeout: parseIntOrDefault(process.env.REQUEST_TIMEOUT, defaults.requestTimeout),
    maxConcurrentRequests: parseIntOrDefault(
      process.env.MAX_CONCURRENT_REQUESTS,
      defaults.maxConcurrentRequests
    ),
    userAgent: process.env.USER_AGENT || defaults.userAgent,
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

// For testing - reset config
export function resetConfig(): void {
  configInstance = null;
}
