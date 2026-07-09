# AI Web Search

Multi-engine web search CLI. API-first for speed, Playwright for browser-based engines.

## Engines

### Go CLI (API-based)

| Engine | API |
|--------|-----|
| Wikipedia | MediaWiki REST API |
| Hacker News | Algolia HN API |
| MDN | MDN API |
| GitHub | GitHub REST API |
| Stack Overflow | Stack Exchange API |
| DuckDuckGo | HTML scraping |

### Browser (Playwright)

| Engine | Notes |
|--------|-------|
| Google AI Mode | `google-ai/` plugin |
| Habr | via `site:habr.com` |

## Usage

```bash
# All engines (auto-select)
./bin/ai-search --query "golang"

# Specific engine
./bin/ai-search --engine wikipedia --query "golang"

# Google AI Mode (browser)
cd google-ai && bun run cli.ts --query "golang"

# Habr via Google
cd google-ai && bun run cli.ts --engine habr --query "golang"
```

## Build

```bash
# Go binary
cd search && go build -o ../bin/ai-search .

# Browser plugin
cd google-ai && bun install && bun run build
```

## License

MIT
