export interface SourceReference {
    title: string;
    url?: string;
    publisher?: string;
}

export interface ComparisonRow {
    feature: string;
    column1: string;
    column2: string;
}

export interface ParsedContent {
    summary: string;
    blocks: ContentBlock[];
    table: { header: string[]; rows: string[][] } | null;
    rawHtml: string;
    rawText: string;
    fallbackParagraphs: string[];
    isConsent: boolean;
    sources: {
        count: number;
        entries: SourceReference[];
        hasVideo: boolean;
    };
}

export interface ContentBlock {
    type: "heading" | "paragraph" | "list" | "table";
    text?: string;
    level?: number;
    heading?: string;
    items?: string[];
    ordered?: boolean;
}

export async function parseGoogleAIResponse(page: { evaluate: <T>(fn: () => T) => Promise<T> }): Promise<ParsedContent> {
    return page.evaluate(() => {
        const shouldSkipText = (text: string): boolean => {
            if (!text) return true;
            if (/AI responses may include mistakes/i.test(text)) return true;
            if (/learn more$/i.test(text)) return true;
            return false;
        };

        const clean = (text?: string | null) => {
            if (!text) return "";
            return text
                .replace(/\u00a0/g, " ")
                .replace(/\r\n?/g, "\n")
                .replace(/[\t ]+\n/g, "\n")
                .replace(/\n[\t ]+/g, "\n")
                .replace(/[ \t]{2,}/g, " ")
                .replace(/\n{3,}/g, "\n\n")
                .replace(/\s([,:;.!?])/g, "$1")
                .trim();
        };

        const root =
            (document.querySelector('[data-aimmrs="true"]') as HTMLElement | null) ||
            (document.querySelector("#aim-chrome-initial-inline-async-container") as HTMLElement | null) ||
            (document.querySelector('[data-aim-chrome-rendered="true"]') as HTMLElement | null) ||
            document.body;

        const main =
            (root.querySelector(".mZJni.Dn7Fzd") as HTMLElement | null) ||
            root;
        const contentContainer =
            (main.querySelector(".Zkbeff") as HTMLElement | null) ||
            main;

        const blockSelectors =
            '[role="heading"], h1, h2, h3, h4, h5, h6, .Y3BBE, .Fv6NCb, table, ul, ol, p';
        const orderedNodes = Array.from(
            contentContainer.querySelectorAll(blockSelectors),
        ) as HTMLElement[];

        const blocks: ContentBlock[] = [];
        const listHeadingMarkers = new Set<HTMLElement>();
        const paragraphTexts = new Set<string>();
        let summary = "";
        let tableBlock: { header: string[]; rows: string[][] } | null = null;

        orderedNodes.forEach((node) => {
            const text = clean(node.innerText);
            if (shouldSkipText(text)) {
                return;
            }

            if (
                node.classList.contains("otQkpb") ||
                node.matches('[role="heading"], h1, h2, h3, h4, h5, h6')
            ) {
                const level = parseInt(
                    node.getAttribute("aria-level") || "3",
                    10,
                );
                blocks.push({ type: "heading", text, level });
                return;
            }

            if (node.classList.contains("Fv6NCb")) {
                const table = node.querySelector("table");
                if (table) {
                    const rows = Array.from(table.querySelectorAll("tr"))
                        .map((row) =>
                            Array.from(row.querySelectorAll("th,td")).map(
                                (cell) =>
                                    clean((cell as HTMLElement).innerText),
                            ),
                        )
                        .filter((row) => row.some((cell) => cell));

                    if (rows.length > 1) {
                        tableBlock = {
                            header: rows[0],
                            rows: rows.slice(1),
                        };
                        blocks.push({ type: "table" });
                    }
                }
                return;
            }

            if (node.tagName === "UL" || node.tagName === "OL") {
                const items = Array.from(
                    node.querySelectorAll(":scope > li"),
                )
                    .map((li) => clean((li as HTMLElement).innerText))
                    .filter(Boolean);

                if (items.length === 0) return;

                let heading: string | undefined;
                const prev =
                    node.previousElementSibling as HTMLElement | null;
                if (prev && listHeadingMarkers.has(prev)) {
                    heading = clean(prev.innerText).replace(/:\s*$/, "");
                }

                blocks.push({
                    type: "list",
                    ordered: node.tagName === "OL",
                    heading,
                    items,
                });
                return;
            }

            if (node.classList.contains("Y3BBE") || node.tagName === "P") {
                if (node.tagName === "P" && node.closest("li")) {
                    return;
                }
                if (!summary) {
                    summary = text;
                }

                const next = node.nextElementSibling;
                if (
                    next &&
                    (next.tagName === "UL" || next.tagName === "OL")
                ) {
                    listHeadingMarkers.add(node);
                    return;
                }

                if (!paragraphTexts.has(text)) {
                    paragraphTexts.add(text);
                    blocks.push({ type: "paragraph", text });
                }
            }
        });

        if (!summary) {
            summary = clean(
                contentContainer.innerText.split("\n").find(Boolean) || "",
            );
        }

        // Clone and remove images to avoid base64 noise in output
        const contentClone = contentContainer.cloneNode(true) as HTMLElement;
        contentClone.querySelectorAll("img, picture, figure, [data-tbnid], .BVG0Nb").forEach((el) => el.remove());
        contentClone.querySelectorAll("svg").forEach((el) => el.remove());
        const rawHtml = contentClone.innerHTML;
        const rawText = clean(contentContainer.innerText);
        const fallbackParagraphs = rawText
            .split(/\n{2,}/)
            .map((part) => clean(part))
            .filter((value) => value.length > 0);

        const consentIndicators = [
            "Before you continue to Google Search",
            "We use cookies",
            "By using our services, you agree",
            "We value your privacy",
        ];
        const isConsent = consentIndicators.some((phrase) =>
            root.innerText.includes(phrase),
        );

        const sourceContainer = root.querySelector(
            ".ofHStc",
        ) as HTMLElement | null;
        let sourceCount = 0;
        const sources: SourceReference[] = [];
        let hasVideo = false;

        if (sourceContainer) {
            const countMatch =
                sourceContainer.innerText.match(/(\d+)\s+sites?/i);
            if (countMatch) {
                sourceCount = parseInt(countMatch[1], 10);
            }

            const list = sourceContainer.querySelector("ul");
            if (list) {
                const seenLinks = new Set<string>();
                Array.from(list.querySelectorAll(":scope > li")).forEach(
                    (li) => {
                        const itemText = clean(
                            (li as HTMLElement).innerText,
                        );
                        const link = (
                            li.querySelector("a") as HTMLAnchorElement | null
                        )?.href || undefined;

                        if (/sites?$/i.test(itemText)) {
                            return;
                        }
                        if (link) {
                            if (seenLinks.has(link)) return;
                            seenLinks.add(link);
                        }
                        const lines = itemText
                            .split("\n")
                            .map((part) => part.trim())
                            .filter(Boolean);
                        const titleLine = lines[0] || itemText;
                        if (/YouTube/i.test(itemText)) {
                            hasVideo = true;
                        }
                        const publisherMatch =
                            lines.length > 1
                                ? lines[lines.length - 1]
                                : undefined;
                        sources.push({
                            title: titleLine,
                            url: link,
                            publisher:
                                publisherMatch &&
                                publisherMatch !== titleLine
                                    ? publisherMatch
                                    : undefined,
                        });
                    },
                );
            }
        }

        if (!sourceCount && sources.length > 0) {
            sourceCount = sources.length;
        }

        return {
            summary,
            blocks,
            table: tableBlock,
            rawHtml,
            rawText,
            fallbackParagraphs,
            isConsent,
            sources: {
                count: sourceCount,
                entries: sources,
                hasVideo,
            },
        };
    });
}
