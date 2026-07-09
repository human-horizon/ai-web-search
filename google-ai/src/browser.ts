import type { Browser as PlaywrightBrowser, Page as PlaywrightPage } from "playwright";

type PlaywrightModule = typeof import("playwright");

const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;
const SESSION_TIMEOUT = 5 * 60 * 1000;

export interface BrowserConfig {
    headless: boolean;
    timeout: number;
}

export class BrowserSession {
    private browser: PlaywrightBrowser | null = null;
    private page: PlaywrightPage | null = null;
    private sessionStartTime = Date.now();
    private conversationActive = false;
    private playwright: PlaywrightModule | null = null;

    constructor(private config: BrowserConfig) {}

    async ensureInitialized(): Promise<void> {
        if (!this.playwright) {
            this.playwright = await this.loadPlaywright();
        }

        if (Date.now() - this.sessionStartTime > SESSION_TIMEOUT) {
            await this.reset();
        }

        if (!this.browser) {
            this.browser = await this.playwright.chromium.launch({
                headless: this.config.headless,
                args: [
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=VizDisplayCompositor",
                ],
            });
        }

        if (!this.page) {
            this.page = await this.browser.newPage({
                userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
            });

            await this.page.addInitScript(() => {
                Object.defineProperty(navigator, "webdriver", {
                    get: () => false,
                });

                const chrome = (window as unknown as { chrome?: { runtime?: { onConnect?: unknown } } }).chrome;
                if (chrome?.runtime?.onConnect) {
                    delete chrome.runtime.onConnect;
                }

                Object.defineProperty(navigator, "languages", {
                    get: () => ["en-GB", "en-US", "en"],
                });
            });
        }
    }

    async navigate(url: string, timeout: number): Promise<void> {
        await this.ensureInitialized();
        if (!this.page) throw new Error("Page not initialized");

        await this.page.goto(url, { waitUntil: "networkidle", timeout });
    }

    async waitForAIContent(maxWaitTime: number): Promise<void> {
        if (!this.page) throw new Error("Page not initialized");

        const startTime = Date.now();
        const checkInterval = 800;
        const maxWait = Math.min(maxWaitTime, 45000);
        let stableChecks = 0;
        const STABLE_THRESHOLD = 3;
        let lastLength = 0;
        let lastSnippet = "";

        while (Date.now() - startTime < maxWait) {
            await this.page.waitForTimeout(checkInterval);

            const state = await this.page.evaluate(() => {
                const body = document.body;
                if (!body) return { length: 0, snippet: "", hasAI: false };

                const text = body.innerText || "";
                // Sample middle part of content for comparison
                const snippet = text.slice(text.length / 4, text.length / 4 + 200);

                // Check for AI content presence (not hardcoded text)
                const aiContainer = body.querySelector("[data-aimmrs], #aim-chrome-initial-inline-async-container, [data-aim-chrome-rendered]");
                const hasAI = aiContainer !== null || text.length > 3000;

                return { length: text.length, snippet, hasAI };
            });

            if (!state.hasAI) {
                stableChecks = 0;
                lastLength = 0;
                lastSnippet = "";
                continue;
            }

            // Check if content is still changing
            const contentStable = state.length === lastLength && state.snippet === lastSnippet;

            if (contentStable) {
                stableChecks++;
                if (stableChecks >= STABLE_THRESHOLD) {
                    return; // Content is stable, AI finished
                }
            } else {
                stableChecks = 0;
            }

            lastLength = state.length;
            lastSnippet = state.snippet;
        }

        // Timeout - proceed with current content
    }

    async evaluate<T>(fn: () => T): Promise<T> {
        if (!this.page) throw new Error("Page not initialized");
        return this.page.evaluate(fn as () => T);
    }

    async waitForTimeout(ms: number): Promise<void> {
        if (!this.page) throw new Error("Page not initialized");
        await this.page.waitForTimeout(ms);
    }

    getPage(): PlaywrightPage | null {
        return this.page;
    }

    isConversationActive(): boolean {
        return this.conversationActive;
    }

    setConversationActive(active: boolean): void {
        this.conversationActive = active;
    }

    async reset(): Promise<void> {
        this.conversationActive = false;
        this.sessionStartTime = Date.now();

        if (this.page) {
            try {
                await this.page.getByRole("button", { name: "Start new search" }).click({ timeout: 2000 });
            } catch {
                if (this.page) {
                    await this.page.goto("https://www.google.com", { waitUntil: "load" });
                }
            }
        }
    }

    async dispose(): Promise<void> {
        if (this.page) {
            await this.page.close().catch(() => undefined);
            this.page = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => undefined);
            this.browser = null;
        }
        this.conversationActive = false;
    }

    private async loadPlaywright(): Promise<PlaywrightModule> {
        try {
            return await import("playwright");
        } catch {
            throw new Error(
                "ai_search requires Playwright. Install it with: bun install playwright && bunx playwright install chromium",
            );
        }
    }

    static getDefaultTimeout(): number {
        return DEFAULT_TIMEOUT;
    }

    static getMaxTimeout(): number {
        return MAX_TIMEOUT;
    }
}