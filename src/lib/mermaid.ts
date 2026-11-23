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

    // A truncated model response must never be posted as a broken code block.
    if (!/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|journey|gantt)\b/m.test(text)) return "";
    if ((text.match(/"/g) || []).length % 2 !== 0) return "";
    if ((text.match(/\[/g) || []).length !== (text.match(/\]/g) || []).length) return "";

    return text;
}
