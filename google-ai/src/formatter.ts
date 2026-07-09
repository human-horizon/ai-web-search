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

export interface AISearchResult {
    query: string;
    answer: string;
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

export function formatAIResponse(response: AISearchResult): string {
    let output = `# ${response.query}\n\n`;

    if (response.summary && response.summary !== response.answer) {
        output += `**Summary**: ${response.summary}\n\n`;
    }

    output += `## Answer\n\n${response.answer}\n\n`;

    if (response.tableData && response.tableData.length > 0) {
        const headers =
            response.tableHeaders && response.tableHeaders.length >= 3
                ? response.tableHeaders.slice(0, 3)
                : ["Feature", "Option 1", "Option 2"];

        const signature = `| ${headers[0]} | ${headers[1]} |`;
        const alreadyPresent = response.answer.includes(signature);

        if (!alreadyPresent) {
            output += `## Comparison Table\n\n`;
            output += `| ${headers.join(" | ")} |\n`;
            output += `|${headers.map(() => "---").join("|")}|\n`;
            response.tableData.forEach((row) => {
                const values = [row.feature, row.column1, row.column2];
                output += `| ${headers.map((_, idx) => values[idx] || "").join(" | ")} |\n`;
            });
            output += "\n";
        }
    }

    output += "## Sources\n\n";
    output += `- **Sources Referenced**: ${response.sources.count} sites\n`;
    if (response.sources.hasVideo) {
        output += "- **Includes Video Sources**: Yes\n";
    }
    output += `- **Response Time**: ${response.metadata.responseTime}ms\n`;
    output += `- **Session**: ${response.metadata.sessionId}\n`;

    if (response.sources.references && response.sources.references.length > 0) {
        output += "- **Source Links:**\n";
        response.sources.references.forEach((ref) => {
            if (!ref?.title) return;
            const label = ref.url ? `[${ref.title}](${ref.url})` : ref.title;
            output += `  - ${label}\n`;
        });
    }

    return output;
}