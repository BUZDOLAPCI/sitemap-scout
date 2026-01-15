# sitemap-scout

MCP server to discover sitemaps for a site, enumerate sitemap URLs, and produce a crawl frontier.

## Features

- Discover sitemaps from multiple sources (robots.txt, standard locations, sitemap indexes)
- Support for both regular sitemaps and sitemap index files
- Handle gzipped sitemaps (.xml.gz)
- Pagination support for large sitemaps
- Crawl frontier building with include/exclude pattern filtering
- Standard Dedalus response envelope format

## Installation

```bash
npm install
```

## Usage

### HTTP Transport (Production)

```bash
# Build and start
npm run build
npm start

# Or run in development mode
npm run dev:http
```

Server starts on port 8000 by default. Configure with `PORT` environment variable.

### STDIO Transport (Development)

```bash
npm run dev:stdio
```

### CLI Options

```
--stdio, -s       Use STDIO transport (for local development)
--port, -p PORT   HTTP server port (default: 8000)
--help, -h        Show help message
```

## Tools

### discover_sitemaps

Find all sitemaps for a given domain by checking:
- `/sitemap.xml` (standard location)
- `robots.txt` Sitemap: directives
- Sitemap index files (recursive discovery)

**Input:**
```json
{
  "url": "https://example.com"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "domain": "https://example.com",
    "sitemaps": [
      {
        "url": "https://example.com/sitemap.xml",
        "type": "sitemap_index",
        "discovered_from": "standard_location"
      },
      {
        "url": "https://example.com/sitemap-posts.xml",
        "type": "sitemap",
        "discovered_from": "sitemap_index"
      }
    ],
    "robots_txt_found": true
  },
  "meta": {
    "source": "https://example.com",
    "retrieved_at": "2024-01-15T10:30:00.000Z",
    "warnings": []
  }
}
```

### list_sitemap_urls

Enumerate URLs from a sitemap with pagination support.

**Input:**
```json
{
  "sitemap_url": "https://example.com/sitemap.xml",
  "limit": 100,
  "cursor": null
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "sitemap_url": "https://example.com/sitemap.xml",
    "urls": [
      {
        "loc": "https://example.com/page1",
        "lastmod": "2024-01-01",
        "changefreq": "weekly",
        "priority": "0.8"
      }
    ],
    "total_in_page": 100,
    "is_index": false
  },
  "meta": {
    "source": "https://example.com/sitemap.xml",
    "retrieved_at": "2024-01-15T10:30:00.000Z",
    "pagination": {
      "next_cursor": "eyJvZmZzZXQiOjEwMH0"
    }
  }
}
```

### build_crawl_frontier

Build a crawl frontier from discovered sitemaps with filtering rules.

**Input:**
```json
{
  "seed_url": "https://example.com",
  "rules": {
    "include": ["*blog*", "*article*"],
    "exclude": ["*admin*", "*login*"],
    "max_urls": 1000
  },
  "limit": 500
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "seed_url": "https://example.com",
    "frontier": [
      {
        "url": "https://example.com/blog/post1",
        "source_sitemap": "https://example.com/sitemap-blog.xml",
        "last_modified": "2024-01-01",
        "priority": "0.8"
      }
    ],
    "total_urls": 500,
    "sitemaps_processed": 3,
    "rules_applied": {
      "include": ["*blog*", "*article*"],
      "exclude": ["*admin*", "*login*"],
      "max_urls": 1000
    }
  },
  "meta": {
    "source": "https://example.com",
    "retrieved_at": "2024-01-15T10:30:00.000Z",
    "warnings": []
  }
}
```

## Response Envelope

All responses follow the Dedalus standard envelope format:

### Success Response
```json
{
  "ok": true,
  "data": {},
  "meta": {
    "source": "optional string",
    "retrieved_at": "ISO-8601 timestamp",
    "pagination": { "next_cursor": null },
    "warnings": []
  }
}
```

### Error Response
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT | UPSTREAM_ERROR | RATE_LIMITED | TIMEOUT | PARSE_ERROR | INTERNAL_ERROR",
    "message": "human readable message",
    "details": {}
  },
  "meta": {
    "retrieved_at": "ISO-8601 timestamp"
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8000 | HTTP server port |
| `REQUEST_TIMEOUT` | 30000 | Request timeout in milliseconds |
| `MAX_CONCURRENT_REQUESTS` | 5 | Maximum concurrent HTTP requests |

## Development

```bash
# Install dependencies
npm install

# Run in development mode (HTTP)
npm run dev:http

# Run in development mode (STDIO)
npm run dev:stdio

# Run tests
npm test

# Type check
npm run typecheck

# Build for production
npm run build
```

## Limitations

- No authentication support (stateless server)
- No JavaScript rendering (static sitemap parsing only)
- Maximum 10,000 URLs per crawl frontier request
- 30-second default timeout for HTTP requests
- Gzipped sitemaps require proper Content-Type or .gz extension

## License

MIT
