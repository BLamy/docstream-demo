import type { Block, DocumentNode, Inline, ListItemNode } from "./ast"
import { serializeInline } from "./inline"

export function serializeMarkdown(doc: DocumentNode): string {
  return serializeBlocks(doc.children).trimEnd() + "\n"
}

export function serializeBlocks(blocks: Block[]): string {
  return blocks.map(serializeBlock).join("\n\n")
}

function indent(s: string, pad: string): string {
  return s
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n")
}

function serializeBlock(b: Block): string {
  switch (b.type) {
    case "paragraph":
      return serializeInline(b.children)

    case "heading":
      return `${"#".repeat(b.level)} ${serializeInline(b.children)}`

    case "code": {
      const fence = "```" + (b.language ?? "")
      const body = `${fence}\n${b.code}\n\`\`\``
      if (b.title || b.lineNumbers) {
        const attrs = [
          b.title ? ` title="${b.title}"` : "",
          b.lineNumbers ? ` lineNumbers="true"` : "",
        ].join("")
        return `{% code${attrs} %}\n${body}\n{% endcode %}`
      }
      return body
    }

    case "hint":
      return `{% hint style="${b.style}" %}\n${serializeBlocks(b.children)}\n{% endhint %}`

    case "tabs":
      return `{% tabs %}\n${b.tabs
        .map((t) => `{% tab title="${t.title}" %}\n${serializeBlocks(t.children)}\n{% endtab %}`)
        .join("\n\n")}\n{% endtabs %}`

    case "expandable":
      return `<details>\n\n<summary>${b.summary}</summary>\n\n${serializeBlocks(b.children)}\n\n</details>`

    case "stepper":
      return `{% stepper %}\n${b.steps
        .map((s) => {
          const title = s.title ? `### ${s.title}\n\n` : ""
          return `{% step %}\n${title}${serializeBlocks(s.children)}\n{% endstep %}`
        })
        .join("\n\n")}\n{% endstepper %}`

    case "embed":
      return `{% embed url="${b.url}" %}`

    case "content-ref":
      return `{% content-ref url="${b.url}" %}\n${serializeInline(b.children)}\n{% endcontent-ref %}`

    case "columns":
      return `{% columns %}\n${b.columns
        .map((c) => `{% column %}\n${serializeBlocks(c.children)}\n{% endcolumn %}`)
        .join("\n\n")}\n{% endcolumns %}`

    case "figure": {
      const alt = b.alt ? ` alt="${b.alt}"` : ' alt=""'
      const cap = b.caption ? `<figcaption><p>${b.caption}</p></figcaption>` : "<figcaption></figcaption>"
      return `<figure><img src="${b.src}"${alt}>${cap}</figure>`
    }

    case "list":
      return b.items.map((item, idx) => serializeListItem(item, b.ordered, b.task, idx)).join("\n")

    case "blockquote":
      return serializeBlocks(b.children)
        .split("\n")
        .map((l) => (l ? `> ${l}` : ">"))
        .join("\n")

    case "divider":
      return "---"

    case "table": {
      const row = (cells: Inline[][]) => `| ${cells.map((c) => serializeInline(c)).join(" | ")} |`
      const sep = `| ${b.header.map(() => "---").join(" | ")} |`
      return [row(b.header), sep, ...b.rows.map(row)].join("\n")
    }

    case "math":
      return `$$\n${b.formula}\n$$`
  }
}

function serializeListItem(item: ListItemNode, ordered: boolean, task: boolean, idx: number): string {
  const bullet = ordered ? `${idx + 1}.` : "-"
  const check = task ? `[${item.checked ? "x" : " "}] ` : ""
  const [first, ...rest] = item.children
  const firstText = first?.type === "paragraph" ? serializeInline(first.children) : first ? serializeBlock(first) : ""
  const restText = rest.length ? "\n" + indent(serializeBlocks(rest), "  ") : ""
  return `${bullet} ${check}${firstText}${restText}`
}
