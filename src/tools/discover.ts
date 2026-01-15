/**
 * discover_sitemaps tool implementation
 * Finds all sitemaps for a given domain by checking:
 * 1. /sitemap.xml (standard location)
 * 2. robots.txt Sitemap: directives
 * 3. sitemap index files (recursive discovery)
 */

import { XMLParser } from "fast-xml-parser";
import { getConfig } from "../config.js";
import {
  DiscoverSitemapsData,
  DiscoveredSitemap,
  Response,
  createSuccessResponse,
  createErrorResponse,
} from "../types.js";
import { fetchWithTimeout, isValidUrl, normalizeUrl, decompressGzip } from "./utils.js";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Check if a sitemap URL exists and determine its type
 */
async function checkSitemap(
  url: string,
  discoveredFrom: DiscoveredSitemap["discovered_from"]
): Promise<DiscoveredSitemap | null> {
  try {
    const config = getConfig();
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": config.userAgent },
      timeout: config.requestTimeout,
    });

    if (!response.ok) {
      return null;
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

    // Determine if it's a sitemap or sitemap index
    const isSitemapIndex =
      content.includes("<sitemapindex") || content.includes("<sitemapindex>");

    return {
      url,
      type: isSitemapIndex ? "sitemap_index" : "sitemap",
      discovered_from: discoveredFrom,
    };
  } catch {
    return null;
  }
}

/**
 * Parse robots.txt and extract Sitemap directives
 */
async function parseSitemapsFromRobotsTxt(
  robotsTxtUrl: string
): Promise<{ sitemaps: string[]; found: boolean }> {
  try {
    const config = getConfig();
    const response = await fetchWithTimeout(robotsTxtUrl, {
      headers: { "User-Agent": config.userAgent },
      timeout: config.requestTimeout,
    });

    if (!response.ok) {
      return { sitemaps: [], found: false };
    }

    const content = await response.text();
    const sitemaps: string[] = [];

    // Parse Sitemap: directives (case-insensitive)
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*sitemap:\s*(.+)\s*$/i);
      if (match && match[1]) {
        const sitemapUrl = match[1].trim();
        if (isValidUrl(sitemapUrl)) {
          sitemaps.push(sitemapUrl);
        }
      }
    }

    return { sitemaps, found: true };
  } catch {
    return { sitemaps: [], found: false };
  }
}

/**
 * Discover sitemaps from a sitemap index
 */
async function discoverFromSitemapIndex(
  indexUrl: string,
  visited: Set<string>
): Promise<DiscoveredSitemap[]> {
  if (visited.has(indexUrl)) {
    return [];
  }
  visited.add(indexUrl);

  try {
    const config = getConfig();
    const response = await fetchWithTimeout(indexUrl, {
      headers: { "User-Agent": config.userAgent },
      timeout: config.requestTimeout,
    });

    if (!response.ok) {
      return [];
    }

    let content: string;
    const contentType = response.headers.get("content-type") || "";

    // Handle gzipped content
    if (indexUrl.endsWith(".gz") || contentType.includes("gzip")) {
      const buffer = await response.arrayBuffer();
      content = await decompressGzip(Buffer.from(buffer));
    } else {
      content = await response.text();
    }

    const parsed = xmlParser.parse(content);
    const sitemaps: DiscoveredSitemap[] = [];

    // Handle sitemap index
    if (parsed.sitemapindex?.sitemap) {
      const sitemapEntries = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];

      for (const entry of sitemapEntries) {
        const loc = entry.loc;
        if (loc && isValidUrl(loc) && !visited.has(loc)) {
          const sitemap = await checkSitemap(loc, "sitemap_index");
          if (sitemap) {
            sitemaps.push(sitemap);

            // Recursively discover from nested sitemap indexes
            if (sitemap.type === "sitemap_index") {
              const nestedSitemaps = await discoverFromSitemapIndex(loc, visited);
              sitemaps.push(...nestedSitemaps);
            }
          }
        }
      }
    }

    return sitemaps;
  } catch {
    return [];
  }
}

/**
 * Main discover_sitemaps function
 */
export async function discoverSitemaps(
  url: string
): Promise<Response<DiscoverSitemapsData>> {
  // Validate input URL
  if (!url || typeof url !== "string") {
    return createErrorResponse(
      "INVALID_INPUT",
      "URL is required and must be a string"
    );
  }

  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) {
    return createErrorResponse(
      "INVALID_INPUT",
      "Invalid URL format. Please provide a valid HTTP or HTTPS URL."
    );
  }

  try {
    const urlObj = new URL(normalizedUrl);
    const domain = urlObj.origin;
    const sitemaps: DiscoveredSitemap[] = [];
    const visited = new Set<string>();
    const warnings: string[] = [];

    // 1. Check standard /sitemap.xml location
    const standardSitemapUrl = `${domain}/sitemap.xml`;
    const standardSitemap = await checkSitemap(standardSitemapUrl, "standard_location");
    if (standardSitemap) {
      sitemaps.push(standardSitemap);
      visited.add(standardSitemapUrl);

      // If it's an index, discover child sitemaps
      if (standardSitemap.type === "sitemap_index") {
        const childSitemaps = await discoverFromSitemapIndex(
          standardSitemapUrl,
          visited
        );
        sitemaps.push(...childSitemaps);
      }
    }

    // 2. Check robots.txt for Sitemap directives
    const robotsTxtUrl = `${domain}/robots.txt`;
    const { sitemaps: robotsSitemaps, found: robotsTxtFound } =
      await parseSitemapsFromRobotsTxt(robotsTxtUrl);

    for (const sitemapUrl of robotsSitemaps) {
      if (!visited.has(sitemapUrl)) {
        const sitemap = await checkSitemap(sitemapUrl, "robots_txt");
        if (sitemap) {
          sitemaps.push(sitemap);
          visited.add(sitemapUrl);

          // If it's an index, discover child sitemaps
          if (sitemap.type === "sitemap_index") {
            const childSitemaps = await discoverFromSitemapIndex(
              sitemapUrl,
              visited
            );
            sitemaps.push(...childSitemaps);
          }
        }
      }
    }

    // 3. Check common alternative sitemap locations
    const alternativeLocations = [
      `${domain}/sitemap_index.xml`,
      `${domain}/sitemap.xml.gz`,
      `${domain}/sitemaps/sitemap.xml`,
    ];

    for (const altUrl of alternativeLocations) {
      if (!visited.has(altUrl)) {
        const sitemap = await checkSitemap(altUrl, "standard_location");
        if (sitemap) {
          sitemaps.push(sitemap);
          visited.add(altUrl);

          if (sitemap.type === "sitemap_index") {
            const childSitemaps = await discoverFromSitemapIndex(altUrl, visited);
            sitemaps.push(...childSitemaps);
          }
        }
      }
    }

    if (sitemaps.length === 0) {
      warnings.push("No sitemaps found for this domain");
    }

    return createSuccessResponse<DiscoverSitemapsData>(
      {
        domain,
        sitemaps,
        robots_txt_found: robotsTxtFound,
      },
      {
        source: normalizedUrl,
        warnings,
      }
    );
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("timeout")) {
        return createErrorResponse(
          "TIMEOUT",
          `Request timed out while discovering sitemaps for ${url}`
        );
      }
      return createErrorResponse("UPSTREAM_ERROR", error.message);
    }
    return createErrorResponse(
      "INTERNAL_ERROR",
      "An unexpected error occurred while discovering sitemaps"
    );
  }
}
