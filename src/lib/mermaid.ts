/**
 * Defensive cleanup for model-generated Mermaid diagrams.
 *
 * Mermaid treats `(` and `)` inside an unquoted square-bracket node label as
 * syntax (e.g. `C[charge(amount)]` fails to parse). Quoting every node label
 * makes diagrams render reliably regardless of how the model formatted them.
 */
export function sanitizeMermaidDiagram(raw: string): string {
    let text = (raw || "")
        .replace(/```mermaid\n?/gi, "")
        .replace(/```\n?/g, "")
        .trim();

    text = text.replace(/\b([A-Za-z][A-Za-z0-9_-]*)\[([^\]\r\n]*)\]/g, (_match, id: string, label: string) => {
        const trimmed = label.trim();
        if (/^".*"$/.test(trimmed)) return `${id}[${trimmed}]`;
        const safe = trimmed.replace(/"/g, "'");
        return `${id}["${safe}"]`;
    });

    return text;
}
