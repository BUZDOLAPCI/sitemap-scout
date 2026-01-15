/**
 * Utility functions for sitemap-scout tools
 */

import { createGunzip } from "zlib";
import { Readable } from "stream";

/**
 * Fetch with timeout support using AbortController
 */
export async function fetchWithTimeout(
  url: string,
  options: { headers?: Record<string, string>; timeout?: number } = {}
): Promise<globalThis.Response> {
  const { timeout = 30000, headers = {} } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalize URL to ensure it has a protocol
 */
export function normalizeUrl(url: string): string | null {
  let normalizedUrl = url.trim();

  // Add https:// if no protocol specified
  if (!normalizedUrl.match(/^https?:\/\//i)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // Validate the result
  if (!isValidUrl(normalizedUrl)) {
    return null;
  }

  return normalizedUrl;
}

/**
 * Decompress gzipped content
 */
export async function decompressGzip(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const gunzip = createGunzip();

    gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    gunzip.on("error", reject);

    // Create readable stream from buffer
    const readable = Readable.from(buffer);
    readable.pipe(gunzip);
  });
}

/**
 * Check if a URL matches a pattern (supports wildcards)
 */
export function matchesPattern(url: string, pattern: string): boolean {
  // Convert glob-like pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars except *
    .replace(/\*/g, ".*"); // Convert * to .*

  try {
    const regex = new RegExp(`^${regexPattern}$`, "i");
    return regex.test(url);
  } catch {
    // If regex is invalid, do simple includes check
    return url.includes(pattern.replace(/\*/g, ""));
  }
}

/**
 * Encode cursor for pagination
 */
export function encodeCursor(data: { offset: number; sitemap_url?: string }): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decode cursor for pagination
 */
export function decodeCursor(cursor: string): { offset: number; sitemap_url?: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}
