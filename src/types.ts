/**
 * Standard response envelope types for sitemap-scout MCP server
 */

// Error codes following Dedalus convention
export type ErrorCode =
  | "INVALID_INPUT"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "PARSE_ERROR"
  | "INTERNAL_ERROR";

// Pagination metadata
export interface PaginationMeta {
  next_cursor: string | null;
}

// Standard metadata for responses
export interface ResponseMeta {
  source?: string;
  retrieved_at: string;
  pagination?: PaginationMeta;
  warnings?: string[];
}

// Success response envelope
export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: ResponseMeta;
}

// Error details
export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// Error response envelope
export interface ErrorResponse {
  ok: false;
  error: ErrorDetails;
  meta: {
    retrieved_at: string;
  };
}

// Union type for all responses
export type Response<T> = SuccessResponse<T> | ErrorResponse;

// Sitemap entry from XML
export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

// Sitemap index entry
export interface SitemapIndexEntry {
  loc: string;
  lastmod?: string;
}

// Discovered sitemap info
export interface DiscoveredSitemap {
  url: string;
  type: "sitemap" | "sitemap_index";
  discovered_from: "robots_txt" | "standard_location" | "sitemap_index";
  last_modified?: string;
}

// discover_sitemaps response data
export interface DiscoverSitemapsData {
  domain: string;
  sitemaps: DiscoveredSitemap[];
  robots_txt_found: boolean;
}

// list_sitemap_urls response data
export interface ListSitemapUrlsData {
  sitemap_url: string;
  urls: SitemapEntry[];
  total_in_page: number;
  is_index: boolean;
}

// Crawl frontier rules
export interface CrawlFrontierRules {
  include?: string[];
  exclude?: string[];
  max_urls?: number;
}

// Frontier URL entry
export interface FrontierUrl {
  url: string;
  source_sitemap: string;
  last_modified?: string;
  priority?: string;
}

// build_crawl_frontier response data
export interface BuildCrawlFrontierData {
  seed_url: string;
  frontier: FrontierUrl[];
  total_urls: number;
  sitemaps_processed: number;
  rules_applied: CrawlFrontierRules;
}

// Helper function to create success response
export function createSuccessResponse<T>(
  data: T,
  meta: Partial<ResponseMeta> = {}
): SuccessResponse<T> {
  return {
    ok: true,
    data,
    meta: {
      retrieved_at: new Date().toISOString(),
      warnings: [],
      ...meta,
    },
  };
}

// Helper function to create error response
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    meta: {
      retrieved_at: new Date().toISOString(),
    },
  };
}
