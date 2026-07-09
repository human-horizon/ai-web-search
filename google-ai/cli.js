#!/usr/bin/env bun
import { BrowserSession } from "./src/browser.js";
import { GoogleAIModeEngine } from "./src/google.js";
import { formatAIResponse } from "./src/formatter.js";
const args = process.argv.slice(2);
function parseArgs() {
    const result = {
        query: "",
        engine: "google",
        timeout: 30,
        headless: false,
        help: false,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "--help" || arg === "-h") {
            result.help = true;
        }
        else if (arg === "--engine" || arg === "-e") {
            result.engine = args[++i] || "google";
        }
        else if (arg === "--timeout" || arg === "-t") {
            result.timeout = parseInt(args[++i] || "30", 10);
        }
        else if (arg === "--headless" || arg === "-H") {
            result.headless = true;
        }
        else if (!arg.startsWith("-")) {
            result.query = arg;
        }
    }
    return result;
}
function printHelp() {
    console.log(`
ai-google-search — Web search via Google AI Mode

Usage:
  ai-google-search [options] <query>

Options:
  -e, --engine <name>   Search engine: google, habr (default: google)
  -t, --timeout <sec>   Timeout in seconds (default: 30, max: 120)
  -H, --headless        Run browser in headless mode
  -h, --help            Show this help

Examples:
  ai-google-search "what is typescript"
  ai-google-search -e habr --timeout 60 "golang best practices"
  ai-google-search -H "rust vs go"
`);
}
async function main() {
    const opts = parseArgs();
    if (opts.help) {
        printHelp();
        process.exit(0);
    }
    if (!opts.query) {
        console.error("Error: query is required");
        printHelp();
        process.exit(1);
    }
    if (opts.engine !== "google" && opts.engine !== "habr") {
        console.error(`Error: unknown engine "${opts.engine}". Use google or habr.`);
        process.exit(1);
    }
    const query = opts.engine === "habr" ? `site:habr.com ${opts.query}` : opts.query;
    const session = new BrowserSession({
        headless: opts.headless,
        timeout: opts.timeout * 1000,
    });
    const engine = new GoogleAIModeEngine(session);
    try {
        console.error(`Searching: ${opts.query}`);
        console.error(`Engine: ${opts.engine}, Timeout: ${opts.timeout}s`);
        const result = await engine.search({
            query,
            timeout: opts.timeout * 1000,
            followUp: false,
        });
        console.log(formatAIResponse(result));
    }
    catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
    finally {
        await session.dispose();
    }
}
main();
//# sourceMappingURL=cli.js.map