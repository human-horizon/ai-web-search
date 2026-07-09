# AI Search Plugin — Спецификация

## Concept & Vision

**Назначение:** OpenCode плагин для веб-поиска через браузер с интеллектуальной обработкой результатов.

**Отличие от оригинала:** Видимый режим браузера для решения капчи, поддержка нескольких поисковых движков, улучшенная стабильность.

**Суть:** Агент открывает браузер → выполняет поиск → парсит результаты → возвращает структурированный ответ. Если Google блокирует — пользователь видит окно и решает капчу вручную.

---

## Функциональность

### Основные возможности

1. **Web Search через браузер**
   - Google AI Mode (основной и единственный)

2. **Видимый режим браузера**
   - `headless: false` по умолчанию
   - Пользователь может ввести капчу если появится
   - Браузер закрывается после завершения

3. **Парсинг результатов**
   - Извлечение summary/answer
   - Сравнительные таблицы
   - Источники (sources) с ссылками
   - Метаданные (response time, session)

4. **Обработка ошибок**
   - Капча → видимый браузер → ручной ввод
   - Timeout → retry или fallback на другой движок
   - Блокировка → информативное сообщение

### Tool API

```typescript
interface AISearchParams {
    query: string;           // Поисковый запрос
    engine?: 'google' | 'duckduckgo' | 'wikipedia';
    timeout?: number;        // Таймаут в секундах (default: 30, max: 120)
    headless?: boolean;     // Видимый/невидимый режим (default: false)
    followUp?: boolean;      // Продолжить сессию
}

interface AISearchResult {
    query: string;
    answer: string;          // Markdown
    summary?: string;
    tableData?: ComparisonRow[];
    tableHeaders?: string[];
    sources: {
        count: number;
        hasVideo: boolean;
        sites: string[];
        references: SourceReference[];
    };
    metadata: {
        responseTime: number;
        engine: string;
        sessionId: string;
        timestamp: string;
    };
}
```

---

## Архитектура

```
ai-search/
├── src/
│   ├── index.ts           # Plugin entry, tool definition
│   ├── browser.ts         # Browser session management
│   ├── google.ts          # Google AI Mode engine
│   ├── parser.ts          # DOM parsing logic
│   └── formatter.ts       # Output formatting
├── cli.ts                 # CLI entry (bun run cli.ts)
├── package.json
└── tsconfig.json
```

### Browser Session

- Playwright Chromium (headless = configurable)
- Один browser instance на сессию (session reuse)
- Timeout 30s по умолчанию
- abort signal handling

### Parser

- TurndownService для HTML → Markdown
- Селекторы для каждого движка свои
- Стабилизация контента (ожидание пока контент перестанет меняться)

---

## Параметры запуска

| Параметр | Type | Default | Description |
|----------|------|---------|-------------|
| `query` | string | — | Обязательный. Поисковый запрос |
| `engine` | 'google' | 'google' | Поисковый движок |
| `timeout` | number | 30 | Секунды, max 120 |
| `headless` | boolean | false | Видимый/невидимый браузер |
| `followUp` | boolean | false | Продолжить сессию |

---

## Примеры использования

```bash
# CLI — Google AI Mode
bun run cli.ts "what is typescript"

# CLI — Habr
bun run cli.ts --engine habr "golang best practices"

# CLI — с увеличенным таймаутом
bun run cli.ts --timeout 60 "complex technical question"

# CLI — headless режим
bun run cli.ts --headless "latest AI news"

# Plugin tool (OpenCode)
ai_search "Что такое TypeScript?"
```

---

## Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Captcha detected | "Google требует капчу. Введите её в открывшемся браузере." | Показать браузер |
| Timeout | "Поиск занял слишком долго. Попробуйте ещё раз." | Retry |
| No content | "Не удалось получить результаты." | Fallback parsing |

---

## Success Criteria

1. ✅ Поиск работает на Google AI Mode
2. ✅ Видимый браузер открывается при капче
3. ✅ Результаты парсятся в Markdown с таблицами
4. ✅ Source ссылки сохраняются
5. ✅ Сессия переиспользуется между запросами
6. ✅ Graceful shutdown (abort signal)

---

## Tech Stack

- TypeScript
- Playwright
- TurndownService
- @opencode-ai/plugin