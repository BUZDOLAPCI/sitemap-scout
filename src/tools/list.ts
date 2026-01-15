/**
 * list_sitemap_urls tool implementation
 * Enumerates URLs from a sitemap with pagination support
 */

import { XMLParser } from "fast-xml-parser";
import { getConfig } from "../config.js";
import {
  ListSitemapUrlsData,
  SitemapEntry,
  Response,
  createSuccessResponse,
  createErrorResponse,
} from "../types.js";
import {
  fetchWithTimeout,
  isValidUrl,
  decompressGzip,
  encodeCursor,
  decodeCursor,
} from "./utils.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

// Default page size
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/**
 * Parse sitemap XML content and extract URLs
 */
function parseSitemapContent(content: string): {
  urls: SitemapEntry[];
  isIndex: boolean;
  indexUrls: string[];
} {
  const parsed = xmlParser.parse(content);
  const urls: SitemapEntry[] = [];
  const indexUrls: string[] = [];
  let isIndex = false;

  // Check if it's a sitemap index
  if (parsed.sitemapindex?.sitemap) {
    isIndex = true;
    const sitemapEntries = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap];

    for (const entry of sitemapEntries) {
      if (entry.loc) {
        indexUrls.push(entry.loc);
        // Also add as URL entry for listing
        urls.push({
          loc: entry.loc,
          lastmod: entry.lastmod,
        });
      }
    }
  }
  // Regular sitemap with urlset
  else if (parsed.urlset?.url) {
    const urlEntries = Array.isArray(parsed.urlset.url)
      ? parsed.urlset.url
      : [parsed.urlset.url];

    for (const entry of urlEntries) {
      if (entry.loc) {
        urls.push({
          loc: entry.loc,
          lastmod: entry.lastmod,
          changefreq: entry.changefreq,
          priority: entry.priority?.toString(),
        });
      }
    }
  }

  return { urls, isIndex, indexUrls };
}

/**
 * Fetch and parse sitemap content
 */
async function fetchSitemap(url: string): Promise<{
  urls: SitemapEntry[];
  isIndex: boolean;
  indexUrls: string[];
}> {
  const config = getConfig();
  const response = await fetchWithTimeout(url, {
    headers: { "User-Agent": config.userAgent },
    timeout: config.requestTimeout,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  let content: string;
  const contentType = response.headers.get("content-type") || "";

  // Handle gzipped content
  if (url.endsWith(".gz") || contentType.includes("gzip")) {
    const buffer = await response.arrayBuffer();
    content = await decompressGzip(Buffer.from(buffer));
  } else {
    content = await response.text();
  }

  return parseSitemapContent(content);
}

/**
 * Main list_sitemap_urls function
 */
export async function listSitemapUrls(
  sitemapUrl: string,
  limit?: number,
  cursor?: string | null
): Promise<Response<ListSitemapUrlsData>> {
  // Validate input URL
  if (!sitemapUrl || typeof sitemapUrl !== "string") {
    return createErrorResponse(
      "INVALID_INPUT",
      "sitemap_url is required and must be a string"
    );
  }

  if (!isValidUrl(sitemapUrl)) {
    return createErrorResponse(
      "INVALID_INPUT",
      "Invalid sitemap URL format. Please provide a valid HTTP or HTTPS URL."
    );
  }

  // Validate and normalize limit
  const pageLimit = Math.min(
    Math.max(1, limit ?? DEFAULT_LIMIT),
    MAX_LIMIT
  );

  // Decode cursor if provided
  let offset = 0;
  if (cursor) {
    const cursorData = decodeCursor(cursor);
    if (!cursorData) {
      return createErrorResponse(
        "INVALID_INPUT",
        "Invalid cursor format"
      );
    }
    offset = cursorData.offset;
  }

  try {
    const { urls, isIndex } = await fetchSitemap(sitemapUrl);

    // Apply pagination
    const paginatedUrls = urls.slice(offset, offset + pageLimit);
    const hasMore = offset + pageLimit < urls.length;

    // Create next cursor if there are more results
    const nextCursor = hasMore
      ? encodeCursor({ offset: offset + pageLimit })
      : null;

    return createSuccessResponse<ListSitemapUrlsData>(
      {
        sitemap_url: sitemapUrl,
        urls: paginatedUrls,
        total_in_page: paginatedUrls.length,
        is_index: isIndex,
      },
      {
        source: sitemapUrl,
        pagination: { next_cursor: nextCursor },
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        return createErrorResponse(
          "TIMEOUT",
          `Request timed out while fetching sitemap: ${sitemapUrl}`
        );
      }
      if (error.message.includes("HTTP")) {
        return createErrorResponse("UPSTREAM_ERROR", error.message);
      }
      if (
        error.message.includes("parse") ||
        error.message.includes("XML") ||
        error.message.includes("Unexpected")
      ) {
        return createErrorResponse(
          "PARSE_ERROR",
          `Failed to parse sitemap XML: ${error.message}`
        );
      }
      return createErrorResponse("UPSTREAM_ERROR", error.message);
    }
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while listing sitemap URLs"
    );
  }
}

/**
 * Export the parser for use by other tools
 */
export { fetchSitemap, parseSitemapContent };
