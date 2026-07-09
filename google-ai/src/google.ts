import TurndownService from "turndown";
import { BrowserSession } from "./browser.js";
import { parseGoogleAIResponse, type ParsedContent } from "./parser.js";
import { formatAIResponse, type AISearchResult } from "./formatter.js";

const GOOGLE_URL = "https://www.google.com";
const AI_MODE_PARAMS = "?udm=50&aep=22&hl=en";

export interface SearchOptions {
    query: string;
    timeout: number;
    followUp: boolean;
    abortSignal?: AbortSignal;
}

export class GoogleAIModeEngine {
    constructor(private session: BrowserSession) {}

    async search(options: SearchOptions): Promise<AISearchResult> {
        const { query, timeout, followUp, abortSignal } = options;
        const startTime = Date.now();

        if (!followUp || !this.session.isConversationActive()) {
            await this.navigateToAIMode();
            this.session.setConversationActive(true);
        }

        const aiModeUrl = this.buildAIModeURL(query);
        await this.session.navigate(aiModeUrl, timeout);

        // Wait for captcha to be resolved if detected
        await this.waitForCaptchaResolution();

        await this.session.waitForAIContent(timeout);

        const hasContent = await this.session.evaluate(() => {
            const body = document.body.textContent ?? "";
            return body.length > 1000;
        });

        if (!hasContent) {
            throw new Error("AI content did not load. Try again or check if captcha is required.");
        }

        if (abortSignal?.aborted) {
            throw new Error("Operation aborted");
        }

        const parsed = await parseGoogleAIResponse(this.session);

        if (abortSignal?.aborted) {
            throw new Error("Operation aborted");
        }

        return this.buildResult(query, parsed, Date.now() - startTime);
    }

    private buildAIModeURL(query: string): string {
        const baseURL = `${GOOGLE_URL}/search`;
        const params = new URLSearchParams({
            udm: "50",
            aep: "22",
            q: query,
            hl: "en",
        });
        return `${baseURL}?${params.toString()}`;
    }

    private async navigateToAIMode(): Promise<void> {
        await this.session.navigate(GOOGLE_URL, 10_000);
    }

    private async waitForCaptchaResolution(): Promise<void> {
        const checkInterval = 2000;

        // eslint-disable-next-line no-constant-condition
        while (true) {
            const currentUrl = this.session.getPage()?.url();

            // User passed captcha - URL no longer contains /sorry/
            if (!currentUrl?.includes("/sorry/")) {
                return;
            }

            await this.session.waitForTimeout(checkInterval);
        }

        // Timeout waiting for captcha - continue anyway, content may still load
    }

    private buildResult(query: string, parsed: ParsedContent, responseTime: number): AISearchResult {
        const answerSections: string[] = [];
        const tableRows: { feature: string; column1: string; column2: string }[] = [];
        const tableHeaders = (parsed.table?.header ?? []).slice(0, 3);

        parsed.blocks?.forEach((block) => {
            if (!block || !block.type) return;

            if (block.type === "heading" && block.text) {
                const level = Math.min(6, Math.max(3, (block.level as number) || 3));
                const prefix = "#".repeat(level);
                answerSections.push(`${prefix} ${block.text}`);
                return;
            }

            if (block.type === "paragraph" && block.text) {
                answerSections.push(block.text);
                return;
            }

            if (block.type === "list" && Array.isArray(block.items)) {
                if (block.heading) {
                    answerSections.push(`**${block.heading}:**`);
                }
                block.items.forEach((item) => {
                    answerSections.push(`- ${item}`);
                });
                return;
            }

            if (block.type === "table" && parsed.table) {
                const headers = ((parsed.table as { header?: string[] }).header || []).slice(0, 3);
                const rows = ((parsed.table as { rows?: string[][] }).rows || []) as string[][];
                if (headers.length >= 2 && rows.length > 0) {
                    const headerLine = `| ${headers.join(" | ")} |`;
                    const separator = `|${headers.map(() => "---").join("|")}|`;
                    const body = rows.map(
                        (row) => `| ${headers.map((_, idx) => row[idx] || "").join(" | ")} |`,
                    );

                    answerSections.push(headerLine);
                    answerSections.push(separator);
                    answerSections.push(...body);

                    rows.forEach((row) => {
                        tableRows.push({
                            feature: row[0] || "",
                            column1: row[1] || "",
                            column2: row[2] || "",
                        });
                    });
                }
            }
        });

        const summary = parsed.summary || "";
        if (summary && !answerSections.find((section) => section.includes(summary))) {
            answerSections.unshift(summary);
        }

        let formattedAnswer = answerSections
            .filter((section) => section && section.trim())
            .join("\n\n");

        const sourceEntries = parsed.sources?.entries ?? [];
        const sourceNames = sourceEntries
            .map((entry) => entry.publisher)
            .filter((name): name is string => Boolean(name));
        const uniqueSites = Array.from(new Set(sourceNames));

        let markdownAnswer = "";
        const turndownService = new TurndownService({
            headingStyle: "atx",
            hr: "---",
            bulletListMarker: "-",
            codeBlockStyle: "fenced",
            emDelimiter: "*",
        });
        turndownService.remove(["script", "style", "meta", "link", "img", "picture", "figure"]);

        if (parsed.rawHtml) {
            try {
                markdownAnswer = turndownService.turndown(parsed.rawHtml);
            } catch {
                markdownAnswer = "";
            }
        }

        const fallbackContent = (parsed.fallbackParagraphs ?? [])
            .filter((paragraph) => paragraph.length > 40)
            .filter((paragraph) => !formattedAnswer.includes(paragraph.slice(0, Math.min(60, paragraph.length))));

        if ((!formattedAnswer || formattedAnswer.length < 500) && fallbackContent.length > 0) {
            const fallbackBlock = fallbackContent.join("\n\n");
            formattedAnswer = formattedAnswer ? `${formattedAnswer}\n\n---\n${fallbackBlock}` : fallbackBlock;
        }

        if (parsed.isConsent) {
            formattedAnswer = formattedAnswer || parsed.rawText || formattedAnswer;
        }

        if (markdownAnswer && fallbackContent.length > 0) {
            const fallbackBlock = fallbackContent.join("\n\n");
            if (fallbackBlock && !markdownAnswer.includes(fallbackBlock.slice(0, Math.min(80, fallbackBlock.length)))) {
                markdownAnswer = `${markdownAnswer}\n\n---\n${fallbackBlock}`;
            }
        }

        if (!markdownAnswer || markdownAnswer.trim().length < 200) {
            markdownAnswer = formattedAnswer;
        }

        if (!markdownAnswer && parsed.rawText) {
            markdownAnswer = parsed.rawText;
        }

        return {
            query,
            answer: markdownAnswer || summary || `Google AI response for: ${query}`,
            summary,
            tableData: tableRows,
            tableHeaders,
            sources: {
                count: parsed.sources?.count ?? sourceEntries.length,
                hasVideo: Boolean(parsed.sources?.hasVideo),
                sites: uniqueSites,
                references: sourceEntries,
            },
            metadata: {
                responseTime,
                engine: "google",
                sessionId: `session_${Date.now()}`,
                timestamp: new Date().toISOString(),
            },
        };
    }
}

export { formatAIResponse };
export type { AISearchResult } from "./formatter.js";