# AI Web Search — Multi-Engine Web Search

## Concept & Vision

**Назначение:** Go CLI + Browser plugin для веб-поиска через различные поисковые движки.

**Подход:**
- API-first для скорости и надёжности (без браузера)
- Google AI Mode (Playwright) для сложных запросов с AI-ответами
- Хабр через Google AI Mode с site:habr.com

**Суть:** Выбор оптимального поисковика для запроса. Каждый движок возвращает структурированные результаты.

---

## Поисковые движки

### Go CLI (API)

| Engine | API | Бесплатный | Notes |
|--------|-----|------------|-------|
| **wikipedia** | MediaWiki REST API | ✅ | Факты, статьи |
| **hackernews** | Algolia HN API | ✅ | `hn.algolia.com` |
| **mdn** | MDN API | ✅ | Web-документация |
| **github** | GitHub REST API | ✅ | Код, репозитории |
| **stackoverflow** | Stack Exchange API | ✅ | Q&A |

### Browser (Playwright) — через google-ai/

| Engine | CLI | Notes |
|--------|-----|-------|
| **google** | `cd google-ai && bun run cli.ts --engine google` | Google AI Mode |
| **habr** | `cd google-ai && bun run cli.ts --engine habr` | Через Google AI Mode с `site:habr.com` |

**Важно:** Go binary (`bin/ai-search`) не поддерживает google/habr — используй google-ai плагин.

---

## CLI Usage

### Go CLI (api-based engines)

```bash
./bin/ai-search --query "golang"              # Все движки параллельно
./bin/ai-search --engine wikipedia --query "golang"  # Конкретный движок
./bin/ai-search --engine wikipedia,hackernews --query "golang"  # Несколько движков
```

**Flags:**
- `--query` — поисковый запрос (обязательно)
- `--engine` — движок: wikipedia, hackernews, mdn, github, stackoverflow (default: все движки параллельно)

### google-ai CLI (browser-based)

```bash
cd google-ai && bun run cli.ts --query "golang"           # Google AI Mode
cd google-ai && bun run cli.ts --engine habr --query "golang"  # Habr
```

**Flags:**
- `--engine` — google, habr (default: google)
- `--timeout` — секунды (default: 30)
- `--headless` — headless режим

---

## Auto-selection логика

**По умолчанию:** все движки запускаются параллельно, результаты агрегируются.

При указании конкретного движка (`--engine`):

| Ключевые слова | Движок |
|----------------|--------|
| documentation, javascript, html, css, api, web | mdn |
| github, repository, npm, package | github |
| hacker news, hn, startup, y combinator | hackernews |
| stackoverflow, how to | stackoverflow |
| википедия, wikipedia | wikipedia |
| хабр, habr | habr |

---

## Архитектура

```
ai-web-search/
├── bin/
│   └── ai-search              # Go CLI binary
├── search/                     # Go движки
│   └── main.go               # All engines in one file
├── google-ai/                 # Browser-based (Playwright)
│   ├── cli.ts                # CLI entry
│   └── src/                  # Plugin source
└── SPEC.md                     # Этот файл
```

---

## Engine Implementation Notes

### Wikipedia
- API: `https://en.wikipedia.org/w/api.php?action=query&list=search`
- Returns: Articles with snippets

### Hacker News
- API: `https://hn.algolia.com/api/v1/search?query=`
- Returns: Stories with scores, authors, URLs

### MDN
- API: `https://developer.mozilla.org/api/v1/search?q=`
- Returns: Documentation pages

### GitHub
- API: `https://api.github.com/search/repositories?q=`
- Returns: Repositories with stars, description

### Stack Overflow
- API: `https://api.stackexchange.com/2.3/similar?title=`
- Returns: Questions with scores, answers

### Google (Browser)
- Playwright Chromium
- Google AI Mode URL params: `?udm=50&aep=22`

### Habr (Browser)
- Через Google AI Mode
- query = "site:habr.com {user_query}"

---

## Success Criteria

1. ✅ Все Go движки возвращают структурированные результаты
2. ✅ Auto-selection работает корректно
3. ✅ Google AI Mode дожидается окончания генерации
4. ✅ Graceful error handling для каждого движка
5. ✅ Metadata с responseTime для каждого запроса

---

## Tech Stack

- Go (CLI binary)
- TypeScript (OpenCode plugin)
- Playwright (только для google/habr)

---

## Environment Variables

```bash
# Optional
GITHUB_TOKEN=...          # Для higher rate limits
```