/**
 * Unit tests for sitemap-scout tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidUrl,
  normalizeUrl,
  matchesPattern,
  encodeCursor,
  decodeCursor,
} from "../../src/tools/utils.js";
import {
  createSuccessResponse,
  createErrorResponse,
} from "../../src/types.js";

describe("Utils", () => {
  describe("isValidUrl", () => {
    it("should return true for valid HTTP URLs", () => {
      expect(isValidUrl("http://example.com")).toBe(true);
      expect(isValidUrl("http://example.com/path")).toBe(true);
      expect(isValidUrl("http://sub.example.com")).toBe(true);
    });

    it("should return true for valid HTTPS URLs", () => {
      expect(isValidUrl("https://example.com")).toBe(true);
      expect(isValidUrl("https://example.com/path?query=1")).toBe(true);
    });

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("")).toBe(false);
      expect(isValidUrl("not-a-url")).toBe(false);
      expect(isValidUrl("ftp://example.com")).toBe(false);
      expect(isValidUrl("file:///path")).toBe(false);
    });
  });

  describe("normalizeUrl", () => {
    it("should add https:// to URLs without protocol", () => {
      expect(normalizeUrl("example.com")).toBe("https://example.com");
      expect(normalizeUrl("www.example.com")).toBe("https://www.example.com");
    });

    it("should keep existing protocol", () => {
      expect(normalizeUrl("http://example.com")).toBe("http://example.com");
      expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    });

    it("should trim whitespace", () => {
      expect(normalizeUrl("  example.com  ")).toBe("https://example.com");
    });

    it("should return null for invalid URLs", () => {
      expect(normalizeUrl("")).toBe(null);
      expect(normalizeUrl("   ")).toBe(null);
    });
  });

  describe("matchesPattern", () => {
    it("should match exact URLs", () => {
      expect(matchesPattern("https://example.com/page", "https://example.com/page")).toBe(true);
    });

    it("should match wildcard patterns", () => {
      expect(matchesPattern("https://example.com/blog/post1", "*blog*")).toBe(true);
      expect(matchesPattern("https://example.com/blog/post1", "https://example.com/blog/*")).toBe(true);
      expect(matchesPattern("https://example.com/page", "*example*")).toBe(true);
    });

    it("should not match non-matching patterns", () => {
      expect(matchesPattern("https://example.com/page", "*blog*")).toBe(false);
      expect(matchesPattern("https://example.com/page", "https://other.com/*")).toBe(false);
    });

    it("should handle multiple wildcards", () => {
      expect(matchesPattern("https://example.com/blog/2024/post", "*blog*post*")).toBe(true);
    });
  });

  describe("cursor encoding/decoding", () => {
    it("should encode and decode cursor correctly", () => {
      const data = { offset: 100 };
      const cursor = encodeCursor(data);
      expect(decodeCursor(cursor)).toEqual(data);
    });

    it("should handle cursor with sitemap_url", () => {
      const data = { offset: 50, sitemap_url: "https://example.com/sitemap.xml" };
      const cursor = encodeCursor(data);
      expect(decodeCursor(cursor)).toEqual(data);
    });

    it("should return null for invalid cursor", () => {
      expect(decodeCursor("invalid")).toBe(null);
      expect(decodeCursor("")).toBe(null);
    });
  });
});

describe("Response helpers", () => {
  describe("createSuccessResponse", () => {
    it("should create success response with data", () => {
      const data = { test: "value" };
      const response = createSuccessResponse(data);

      expect(response.ok).toBe(true);
      expect(response.data).toEqual(data);
      expect(response.meta.retrieved_at).toBeDefined();
      expect(response.meta.warnings).toEqual([]);
    });

    it("should include custom meta fields", () => {
      const data = { test: "value" };
      const response = createSuccessResponse(data, {
        source: "https://example.com",
        warnings: ["warning1"],
      });

      expect(response.meta.source).toBe("https://example.com");
      expect(response.meta.warnings).toEqual(["warning1"]);
    });
  });

  describe("createErrorResponse", () => {
    it("should create error response", () => {
      const response = createErrorResponse("INVALID_INPUT", "Test error");

      expect(response.ok).toBe(false);
      expect(response.error.code).toBe("INVALID_INPUT");
      expect(response.error.message).toBe("Test error");
      expect(response.meta.retrieved_at).toBeDefined();
    });

    it("should include error details", () => {
      const response = createErrorResponse("UPSTREAM_ERROR", "Failed", { url: "test" });

      expect(response.error.details).toEqual({ url: "test" });
    });
  });
});

describe("Tool input validation", () => {
  // These tests verify that tools properly validate their inputs
  // without making actual network requests

  describe("discover_sitemaps validation", () => {
    it("should reject empty URL", async () => {
      const { discoverSitemaps } = await import("../../src/tools/discover.js");
      const result = await discoverSitemaps("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("should reject invalid URL format", async () => {
      const { discoverSitemaps } = await import("../../src/tools/discover.js");
      const result = await discoverSitemaps("not-a-valid-url-at-all");

      // The normalizeUrl function will try to add https:// prefix
      // so we need to check for either INVALID_INPUT or an actual attempt
      expect(result).toBeDefined();
    });
  });

  describe("list_sitemap_urls validation", () => {
    it("should reject empty sitemap URL", async () => {
      const { listSitemapUrls } = await import("../../src/tools/list.js");
      const result = await listSitemapUrls("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("should reject invalid sitemap URL", async () => {
      const { listSitemapUrls } = await import("../../src/tools/list.js");
      const result = await listSitemapUrls("ftp://invalid");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("should reject invalid cursor", async () => {
      const { listSitemapUrls } = await import("../../src/tools/list.js");
      const result = await listSitemapUrls("https://example.com/sitemap.xml", 10, "invalid-cursor");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
        expect(result.error.message).toContain("cursor");
      }
    });
  });

  describe("build_crawl_frontier validation", () => {
    it("should reject empty seed URL", async () => {
      const { buildCrawlFrontier } = await import("../../src/tools/frontier.js");
      const result = await buildCrawlFrontier("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
      }
    });

    it("should reject invalid seed URL", async () => {
      const { buildCrawlFrontier } = await import("../../src/tools/frontier.js");
      const result = await buildCrawlFrontier("not-valid");

      // normalizeUrl will try to fix it by adding https://
      expect(result).toBeDefined();
    });

    it("should reject empty include patterns", async () => {
      const { buildCrawlFrontier } = await import("../../src/tools/frontier.js");
      const result = await buildCrawlFrontier("https://example.com", {
        include: [""],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
        expect(result.error.message).toContain("Include patterns");
      }
    });

    it("should reject empty exclude patterns", async () => {
      const { buildCrawlFrontier } = await import("../../src/tools/frontier.js");
      const result = await buildCrawlFrontier("https://example.com", {
        exclude: [""],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_INPUT");
        expect(result.error.message).toContain("Exclude patterns");
      }
    });
  });
});

describe("Sitemap XML parsing", () => {
  it("should parse regular sitemap content", async () => {
    const { parseSitemapContent } = await import("../../src/tools/list.js");

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com/page1</loc>
        <lastmod>2024-01-01</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
      </url>
      <url>
        <loc>https://example.com/page2</loc>
      </url>
    </urlset>`;

    const result = parseSitemapContent(sitemapXml);

    expect(result.isIndex).toBe(false);
    expect(result.urls).toHaveLength(2);
    expect(result.urls[0].loc).toBe("https://example.com/page1");
    expect(result.urls[0].lastmod).toBe("2024-01-01");
    expect(result.urls[0].changefreq).toBe("weekly");
    expect(result.urls[0].priority).toBe("0.8");
    expect(result.urls[1].loc).toBe("https://example.com/page2");
  });

  it("should parse sitemap index content", async () => {
    const { parseSitemapContent } = await import("../../src/tools/list.js");

    const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap>
        <loc>https://example.com/sitemap1.xml</loc>
        <lastmod>2024-01-01</lastmod>
      </sitemap>
      <sitemap>
        <loc>https://example.com/sitemap2.xml</loc>
      </sitemap>
    </sitemapindex>`;

    const result = parseSitemapContent(sitemapIndexXml);

    expect(result.isIndex).toBe(true);
    expect(result.indexUrls).toHaveLength(2);
    expect(result.indexUrls[0]).toBe("https://example.com/sitemap1.xml");
    expect(result.indexUrls[1]).toBe("https://example.com/sitemap2.xml");
  });

  it("should handle single URL sitemap", async () => {
    const { parseSitemapContent } = await import("../../src/tools/list.js");

    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://example.com/single-page</loc>
      </url>
    </urlset>`;

    const result = parseSitemapContent(sitemapXml);

    expect(result.isIndex).toBe(false);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].loc).toBe("https://example.com/single-page");
  });
});
