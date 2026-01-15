/**
 * build_crawl_frontier tool implementation
 * Builds a crawl frontier from discovered sitemaps with filtering rules
 */

import {
  BuildCrawlFrontierData,
  CrawlFrontierRules,
  FrontierUrl,
  Response,
  createSuccessResponse,
  createErrorResponse,
} from "../types.js";
import { isValidUrl, normalizeUrl, matchesPattern } from "./utils.js";
import { discoverSitemaps } from "./discover.js";
import { fetchSitemap } from "./list.js";

// Default limits
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10000;
const DEFAULT_MAX_URLS = 5000;

/**
 * Check if a URL passes the include/exclude filters
 */
function passesFilters(url: string, rules: CrawlFrontierRules): boolean {
  const { include, exclude } = rules;

  // If include patterns are specified, URL must match at least one
  if (include && include.length > 0) {
    const matchesInclude = include.some((pattern) => matchesPattern(url, pattern));
    if (!matchesInclude) {
      return false;
    }
  }

  // If exclude patterns are specified, URL must not match any
  if (exclude && exclude.length > 0) {
    const matchesExclude = exclude.some((pattern) => matchesPattern(url, pattern));
    if (matchesExclude) {
      return false;
    }
  }

  return true;
}

/**
 * Collect all URLs from a sitemap, recursively processing sitemap indexes
 */
async function collectUrlsFromSitemap(
  sitemapUrl: string,
  visited: Set<string>,
  rules: CrawlFrontierRules,
  maxUrls: number
): Promise<{ urls: FrontierUrl[]; sitemapsProcessed: number }> {
  if (visited.has(sitemapUrl)) {
    return { urls: [], sitemapsProcessed: 0 };
  }
  visited.add(sitemapUrl);

  const urls: FrontierUrl[] = [];
  let sitemapsProcessed = 1;

  try {
    const { urls: entries, isIndex, indexUrls } = await fetchSitemap(sitemapUrl);

    if (isIndex) {
      // Process each sitemap in the index
      for (const childSitemapUrl of indexUrls) {
        if (urls.length >= maxUrls) break;

        const { urls: childUrls, sitemapsProcessed: childProcessed } =
          await collectUrlsFromSitemap(childSitemapUrl, visited, rules, maxUrls - urls.length);

        urls.push(...childUrls);
        sitemapsProcessed += childProcessed;
      }
    } else {
      // Process regular sitemap URLs
      for (const entry of entries) {
        if (urls.length >= maxUrls) break;

        if (passesFilters(entry.loc, rules)) {
          urls.push({
            url: entry.loc,
            source_sitemap: sitemapUrl,
            last_modified: entry.lastmod,
            priority: entry.priority,
          });
        }
      }
    }
  } catch {
    // Skip failed sitemaps but continue processing others
    sitemapsProcessed = 0;
  }

  return { urls, sitemapsProcessed };
}

/**
 * Main build_crawl_frontier function
 */
export async function buildCrawlFrontier(
  seedUrl: string,
  rules?: CrawlFrontierRules,
  limit?: number
): Promise<Response<BuildCrawlFrontierData>> {
  // Validate input URL
  if (!seedUrl || typeof seedUrl !== "string") {
    return createErrorResponse(
      "INVALID_INPUT",
      "seed_url is required and must be a string"
    );
  }

  const normalizedSeedUrl = normalizeUrl(seedUrl);
  if (!normalizedSeedUrl) {
    return createErrorResponse(
      "INVALID_INPUT",
      "Invalid seed URL format. Please provide a valid HTTP or HTTPS URL."
    );
  }

  // Normalize rules
  const normalizedRules: CrawlFrontierRules = {
    include: rules?.include ?? [],
    exclude: rules?.exclude ?? [],
    max_urls: Math.min(rules?.max_urls ?? DEFAULT_MAX_URLS, MAX_LIMIT),
  };

  // Validate patterns
  if (normalizedRules.include) {
    for (const pattern of normalizedRules.include) {
      if (typeof pattern !== "string" || pattern.length === 0) {
        return createErrorResponse(
          "INVALID_INPUT",
          "Include patterns must be non-empty strings"
        );
      }
    }
  }

  if (normalizedRules.exclude) {
    for (const pattern of normalizedRules.exclude) {
      if (typeof pattern !== "string" || pattern.length === 0) {
        return createErrorResponse(
          "INVALID_INPUT",
          "Exclude patterns must be non-empty strings"
        );
      }
    }
  }

  // Effective limit
  const effectiveLimit = Math.min(
    limit ?? normalizedRules.max_urls ?? DEFAULT_LIMIT,
    normalizedRules.max_urls ?? MAX_LIMIT
  );

  try {
    // First, discover all sitemaps for the domain
    const discoverResult = await discoverSitemaps(normalizedSeedUrl);

    if (!discoverResult.ok) {
      return discoverResult;
    }

    const { sitemaps } = discoverResult.data;
    const warnings: string[] = [...(discoverResult.meta.warnings || [])];

    if (sitemaps.length === 0) {
      return createSuccessResponse<BuildCrawlFrontierData>(
        {
          seed_url: normalizedSeedUrl,
          frontier: [],
          total_urls: 0,
          sitemaps_processed: 0,
          rules_applied: normalizedRules,
        },
        {
          source: normalizedSeedUrl,
          warnings: ["No sitemaps found for this domain. Frontier is empty."],
        }
      );
    }

    // Collect URLs from all discovered sitemaps
    const allUrls: FrontierUrl[] = [];
    let totalSitemapsProcessed = 0;
    const visited = new Set<string>();

    for (const sitemap of sitemaps) {
      if (allUrls.length >= effectiveLimit) break;

      // Only process non-index sitemaps directly, indexes are handled recursively
      if (sitemap.type === "sitemap") {
        const { urls, sitemapsProcessed } = await collectUrlsFromSitemap(
          sitemap.url,
          visited,
          normalizedRules,
          effectiveLimit - allUrls.length
        );
        allUrls.push(...urls);
        totalSitemapsProcessed += sitemapsProcessed;
      } else {
        // Process sitemap index
        const { urls, sitemapsProcessed } = await collectUrlsFromSitemap(
          sitemap.url,
          visited,
          normalizedRules,
          effectiveLimit - allUrls.length
        );
        allUrls.push(...urls);
        totalSitemapsProcessed += sitemapsProcessed;
      }
    }

    // Deduplicate URLs
    const seenUrls = new Set<string>();
    const dedupedUrls: FrontierUrl[] = [];
    for (const entry of allUrls) {
      if (!seenUrls.has(entry.url)) {
        seenUrls.add(entry.url);
        dedupedUrls.push(entry);
      }
    }

    // Apply final limit
    const finalUrls = dedupedUrls.slice(0, effectiveLimit);

    if (dedupedUrls.length > effectiveLimit) {
      warnings.push(
        `Result truncated to ${effectiveLimit} URLs. Total available: ${dedupedUrls.length}`
      );
    }

    return createSuccessResponse<BuildCrawlFrontierData>(
      {
        seed_url: normalizedSeedUrl,
        frontier: finalUrls,
        total_urls: finalUrls.length,
        sitemaps_processed: totalSitemapsProcessed,
        rules_applied: normalizedRules,
      },
      {
        source: normalizedSeedUrl,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        return createErrorResponse(
          "TIMEOUT",
          `Request timed out while building crawl frontier for ${seedUrl}`
        );
      }
      return createErrorResponse("UPSTREAM_ERROR", error.message);
    }
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while building crawl frontier"
    );
  }
}
