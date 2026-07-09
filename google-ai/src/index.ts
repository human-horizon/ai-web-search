import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { BrowserSession } from "./browser.js";
import { GoogleAIModeEngine } from "./google.js";
import { formatAIResponse } from "./formatter.js";

export const AISearchPlugin: Plugin = async ({ client }) => {
    return {
        tool: {
            ai_search: tool({
                description:
                    "Search the web using Google AI Mode. Opens a visible browser so you can complete captchas if needed. Returns comprehensive, AI-enhanced search results with contextual information, summaries, and source references. Use for web searches, current events, factual lookups, and research questions. Returns structured markdown responses with sources.",
                args: {
                    query: tool.schema
                        .string()
                        .describe("Question or topic to submit to Google AI Mode"),
                    timeout: tool.schema
                        .number()
                        .min(5)
                        .max(120)
                        .optional()
                        .describe("Timeout in seconds (default: 30, max: 120)"),
                    headless: tool.schema
                        .boolean()
                        .optional()
                        .describe("Run browser in headless mode (default: false - visible browser)"),
                    followUp: tool.schema
                        .boolean()
                        .optional()
                        .describe("Treat the query as a follow-up in the same session"),
                },
                async execute(params, ctx) {
                    const timeoutSec = params.timeout ?? 30;
                    const headless = params.headless ?? false;
                    const timeoutMs = Math.min(timeoutSec * 1000, 120_000);

                    const session = new BrowserSession({ headless, timeout: timeoutMs });
                    const engine = new GoogleAIModeEngine(session);

                    const abortSignal = ctx.abort ?? new AbortController().signal;
                    const abortHandler = () => {
                        session.dispose().catch(() => undefined);
                    };
                    abortSignal.addEventListener("abort", abortHandler, { once: true });

                    let success = false;
                    try {
                        const result = await engine.search({
                            query: params.query,
                            timeout: timeoutMs,
                            followUp: params.followUp ?? false,
                            abortSignal,
                        });
                        success = true;
                        return formatAIResponse(result);
                    } catch (error) {
                        const message = (error as Error).message;
                        if (
                            message.includes("Timeout") ||
                            message.includes("forSelector") ||
                            message.includes("captcha") ||
                            message.includes("blocked")
                        ) {
                            throw new Error(
                                `AI Search failed: ${message}. If captcha appeared, complete it in the visible browser.`,
                            );
                        }
                        throw error;
                    } finally {
                        abortSignal.removeEventListener("abort", abortHandler);
                        if (success) {
                            await session.dispose();
                        }
                    }
                },
            }),
        },
    };
};

export default AISearchPlugin;