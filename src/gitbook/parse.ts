import type {
  Block,
  ColumnNode,
  DocumentNode,
  HintStyle,
  Inline,
  ListItemNode,
  StepNode,
  TabNode,
  UpdateNode,
} from "./ast"
import { parseInline, plainText, refDefinitions } from "./inline"

// Minimal HTML-inline → markdown-inline bridge for HTML table cells.
function htmlToInlineMd(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<strong>(.*?)<\/strong>/gis, "**$1**")
    .replace(/<b>(.*?)<\/b>/gis, "**$1**")
    .replace(/<em>(.*?)<\/em>/gis, "_$1_")
    .replace(/<i>(.*?)<\/i>/gis, "_$1_")
    .replace(/<code>(.*?)<\/code>/gis, "`$1`")
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gis, "[$2]($1)")
    .replace(/<[^>]+>/g, "")
    .trim()
}

const TEMPLATE_RE = /^\s*\{%\s*(\S+?)(\s+[^%]*?)?\s*%\}\s*$/

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  for (const m of raw.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attrs[m[1]] = m[2]
  }
  return attrs
}

interface TemplateTag {
  name: string
  attrs: Record<string, string>
}

function templateTag(line: string): TemplateTag | null {
  const m = line.match(TEMPLATE_RE)
  if (!m) return null
  return { name: m[1], attrs: parseAttrs(m[2]) }
}

// Collects the lines between an opening {% name %} and its matching
// {% endname %}, honoring nesting of the same tag.
function collectUntil(lines: string[], start: number, name: string): { body: string[]; next: number } {
  const body: string[] = []
  let depth = 1
  let i = start
  for (; i < lines.length; i++) {
    const tag = templateTag(lines[i])
    if (tag?.name === name) depth++
    if (tag?.name === `end${name}`) {
      depth--
      if (depth === 0) return { body, next: i + 1 }
    }
    body.push(lines[i])
  }
  return { body, next: i }
}

function collectHtmlUntil(lines: string[], start: number, closeTag: string): { body: string[]; next: number } {
  const body: string[] = []
  let i = start
  for (; i < lines.length; i++) {
    if (lines[i].includes(closeTag)) {
      const before = lines[i].slice(0, lines[i].indexOf(closeTag))
      if (before.trim()) body.push(before)
      return { body, next: i + 1 }
    }
    body.push(lines[i])
  }
  return { body, next: i }
}

const HINT_STYLES: HintStyle[] = ["info", "success", "warning", "danger"]

export function parseMarkdown(src: string): DocumentNode {
  const lines = src.split(/\r?\n/)
  refDefinitions.clear()
  const content: string[] = []
  for (const line of lines) {
    const def = line.match(/^\[([^\]]+)\]:\s*(\S+)\s*$/)
    if (def) refDefinitions.set(def[1].toLowerCase(), def[2])
    else content.push(line)
  }
  return { type: "doc", children: parseBlocks(content) }
}

export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0

  const paragraph: string[] = []
  const flushParagraph = () => {
    if (paragraph.length) {
      const text = paragraph.join(" ").trim()
      if (text) blocks.push({ type: "paragraph", children: parseInline(text) })
      paragraph.length = 0
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      i++
      continue
    }

    const tag = templateTag(line)
    if (tag) {
      flushParagraph()

      if (tag.name === "hint") {
        const { body, next } = collectUntil(lines, i + 1, "hint")
        const style = (HINT_STYLES as string[]).includes(tag.attrs.style)
          ? (tag.attrs.style as HintStyle)
          : "info"
        blocks.push({ type: "hint", style, children: parseBlocks(body) })
        i = next
        continue
      }

      if (tag.name === "tabs") {
        const { body, next } = collectUntil(lines, i + 1, "tabs")
        blocks.push({ type: "tabs", tabs: parseTabs(body) })
        i = next
        continue
      }

      if (tag.name === "stepper") {
        const { body, next } = collectUntil(lines, i + 1, "stepper")
        blocks.push({ type: "stepper", steps: parseSteps(body) })
        i = next
        continue
      }

      if (tag.name === "columns") {
        const { body, next } = collectUntil(lines, i + 1, "columns")
        blocks.push({ type: "columns", columns: parseColumns(body) })
        i = next
        continue
      }

      if (tag.name === "code") {
        const { body, next } = collectUntil(lines, i + 1, "code")
        const inner = parseBlocks(body)
        const code = inner.find((b) => b.type === "code")
        if (code && code.type === "code") {
          code.title = tag.attrs.title ?? null
          code.lineNumbers = tag.attrs.lineNumbers === "true"
          blocks.push(code)
        }
        i = next
        continue
      }

      if (tag.name === "embed") {
        blocks.push({ type: "embed", url: tag.attrs.url ?? "" })
        i++
        // tolerate optional {% endembed %}
        if (i < lines.length && templateTag(lines[i])?.name === "endembed") i++
        continue
      }

      if (tag.name === "content-ref") {
        const { body, next } = collectUntil(lines, i + 1, "content-ref")
        const inner: Inline[] = parseInline(body.join(" ").trim())
        blocks.push({ type: "content-ref", url: tag.attrs.url ?? "", children: inner })
        i = next
        continue
      }

      if (tag.name === "updates") {
        const { body, next } = collectUntil(lines, i + 1, "updates")
        blocks.push({
          type: "updates",
          format: tag.attrs.format ?? null,
          updates: parseUpdates(body),
        })
        i = next
        continue
      }

      if (tag.name === "openapi-operation" || tag.name === "openapi") {
        const { body, next } = collectUntil(lines, i + 1, tag.name)
        const link = body.join(" ").match(/\[([^\]]*)\]\(([^)\s]+)\)/)
        blocks.push({
          type: "openapi-operation",
          spec: tag.attrs.spec ?? "",
          path: tag.attrs.path ?? "",
          method: tag.attrs.method ?? "",
          specUrl: link?.[2] ?? "",
          label: link?.[1] ?? "",
        })
        i = next
        continue
      }

      if (tag.name === "file") {
        // Render file blocks as content-refs for now — same shape, different chrome.
        blocks.push({ type: "content-ref", url: tag.attrs.src ?? "", children: parseInline(tag.attrs.caption ?? tag.attrs.src ?? "") })
        i++
        continue
      }

      // Unknown template tag: skip the line rather than corrupting output.
      i++
      continue
    }

    // <details><summary>…</summary> … </details>  (GitBook expandable)
    if (/^<details>/i.test(trimmed)) {
      flushParagraph()
      let summary = ""
      let bodyStart = i + 1
      const sameLine = trimmed.match(/<summary>(.*?)<\/summary>/i)
      if (sameLine) {
        summary = sameLine[1]
      } else {
        let j = i + 1
        while (j < lines.length && !lines[j].trim()) j++
        const m = lines[j]?.trim().match(/^<summary>(.*?)<\/summary>$/i)
        if (m) {
          summary = m[1]
          bodyStart = j + 1
        }
      }
      const { body, next } = collectHtmlUntil(lines, bodyStart, "</details>")
      blocks.push({ type: "expandable", summary, children: parseBlocks(body) })
      i = next
      continue
    }

    // <table …>…</table> — GitBook exports complex/cards tables as HTML
    if (/^<table[\s>]/i.test(trimmed)) {
      flushParagraph()
      const chunkLines = [line]
      let j = i
      while (!chunkLines.join("\n").includes("</table>") && j + 1 < lines.length) {
        j++
        chunkLines.push(lines[j])
      }
      const chunk = chunkLines.join("\n")
      const view = chunk.match(/<table[^>]*data-view="([^"]*)"/i)?.[1]
      const rowsHtml = [...chunk.matchAll(/<tr[^>]*>(.*?)<\/tr>/gis)].map((m) => m[1])
      const parseCells = (rowHtml: string): Inline[][] =>
        [...rowHtml.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((m) =>
          parseInline(htmlToInlineMd(m[1]))
        )
      const allRows = rowsHtml.map(parseCells)
      const [header, ...rest] = allRows.length ? allRows : [[]]
      blocks.push({
        type: "table",
        header: header ?? [],
        rows: rest,
        ...(view ? { view } : {}),
      })
      i = j + 1
      continue
    }

    // standalone <img …> line (e.g. GitBook drawings)
    const soloHtmlImg = trimmed.match(/^<img[^>]*src="([^"]*)"[^>]*>$/i)
    if (soloHtmlImg) {
      flushParagraph()
      const alt = trimmed.match(/alt="([^"]*)"/i)?.[1] ?? ""
      blocks.push({ type: "figure", src: soloHtmlImg[1], alt, caption: "" })
      i++
      continue
    }

    // <figure><img …><figcaption>…</figcaption></figure>
    if (/^<figure>/i.test(trimmed)) {
      flushParagraph()
      const chunkLines = [line]
      let j = i
      while (!chunkLines.join("\n").includes("</figure>") && j + 1 < lines.length) {
        j++
        chunkLines.push(lines[j])
      }
      const chunk = chunkLines.join("\n")
      const img = chunk.match(/<img[^>]*src="([^"]*)"[^>]*>/i)
      const alt = chunk.match(/<img[^>]*alt="([^"]*)"[^>]*>/i)
      const cap = chunk.match(/<figcaption>(.*?)<\/figcaption>/is)
      blocks.push({
        type: "figure",
        src: img?.[1] ?? "",
        alt: alt?.[1] ?? "",
        caption: (cap?.[1] ?? "").replace(/<\/?p>/g, "").trim(),
      })
      i = j + 1
      continue
    }

    // plain markdown image on its own line
    const soloImg = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
    if (soloImg) {
      flushParagraph()
      blocks.push({ type: "figure", src: soloImg[2], alt: soloImg[1], caption: "" })
      i++
      continue
    }

    // $$ math $$
    if (trimmed === "$$") {
      flushParagraph()
      const formula: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== "$$") {
        formula.push(lines[i])
        i++
      }
      i++
      blocks.push({ type: "math", formula: formula.join("\n") })
      continue
    }

    // fenced code (``` or ~~~)
    const fence = trimmed.match(/^(`{3,}|~{3,})(\S*)\s*$/)
    if (fence) {
      flushParagraph()
      const marker = fence[1][0]
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith(marker.repeat(3))) {
        code.push(lines[i])
        i++
      }
      i++
      blocks.push({
        type: "code",
        language: fence[2] || null,
        title: null,
        lineNumbers: false,
        code: code.join("\n"),
      })
      continue
    }

    // indented code block (4+ spaces, GFM)
    if (paragraph.length === 0 && /^ {4,}\S/.test(line) && !line.trim().match(/^([-*+]|\d+[.)])\s/)) {
      const code: string[] = []
      while (
        i < lines.length &&
        (/^ {4,}\S/.test(lines[i]) || (!lines[i].trim() && /^ {4,}\S/.test(lines[i + 1] ?? "")))
      ) {
        code.push(lines[i].slice(4))
        i++
      }
      blocks.push({ type: "code", language: null, title: null, lineNumbers: false, code: code.join("\n") })
      continue
    }

    // setext headings: a paragraph line followed by ==== (h1) or ---- (h2)
    if (paragraph.length && /^=+$/.test(trimmed)) {
      const text = paragraph.join(" ").trim()
      paragraph.length = 0
      blocks.push({ type: "heading", level: 1, children: parseInline(text) })
      i++
      continue
    }
    if (paragraph.length && /^-+$/.test(trimmed)) {
      const text = paragraph.join(" ").trim()
      paragraph.length = 0
      blocks.push({ type: "heading", level: 2, children: parseInline(text) })
      i++
      continue
    }

    // heading (GitBook exports can contain empty headings like a bare "##")
    const heading = trimmed.match(/^(#{1,6})(?:\s+(.*))?$/)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2] ?? ""),
      })
      i++
      continue
    }

    // divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph()
      blocks.push({ type: "divider" })
      i++
      continue
    }

    // blockquote
    if (trimmed.startsWith(">")) {
      flushParagraph()
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push({ type: "blockquote", children: parseBlocks(quote) })
      continue
    }

    // table
    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:|-]+\|$/)) {
      flushParagraph()
      const parseRow = (row: string): Inline[][] =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => parseInline(cell.trim()))
      const header = parseRow(lines[i])
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(parseRow(lines[i]))
        i++
      }
      blocks.push({ type: "table", header, rows })
      continue
    }

    // list (unordered / ordered / task, with GFM nesting)
    const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (listMatch && listMatch[1].length < 4) {
      flushParagraph()
      const { list, next } = parseList(lines, i)
      blocks.push(list)
      i = next
      continue
    }

    paragraph.push(trimmed)
    i++
  }

  flushParagraph()
  return blocks
}

function parseTabs(lines: string[]): TabNode[] {
  const tabs: TabNode[] = []
  let i = 0
  while (i < lines.length) {
    const tag = templateTag(lines[i])
    if (tag?.name === "tab") {
      const { body, next } = collectUntil(lines, i + 1, "tab")
      tabs.push({ type: "tab", title: tag.attrs.title ?? "Tab", children: parseBlocks(body) })
      i = next
    } else {
      i++
    }
  }
  return tabs
}

function parseSteps(lines: string[]): StepNode[] {
  const steps: StepNode[] = []
  let i = 0
  while (i < lines.length) {
    const tag = templateTag(lines[i])
    if (tag?.name === "step") {
      const { body, next } = collectUntil(lines, i + 1, "step")
      // GitBook convention: the step's first heading is its title
      const inner = parseBlocks(body)
      let title = ""
      if (inner[0]?.type === "heading") {
        title = plainText(inner[0].children)
        inner.shift()
      }
      steps.push({ type: "step", title, children: inner })
      i = next
    } else {
      i++
    }
  }
  return steps
}

interface ParsedList {
  list: Extract<Block, { type: "list" }>
  next: number
}

// Indent-aware list parser: deeper-indented marker lines become nested lists
// inside the item (handled recursively via parseBlocks on dedented lines).
function parseList(lines: string[], start: number): ParsedList {
  const first = lines[start].match(/^(\s*)([-*+]|\d+[.)])\s+/)!
  const baseIndent = first[1].length
  const ordered = /^\d/.test(first[2])
  const items: ListItemNode[] = []
  let task = false
  let i = start

  while (i < lines.length) {
    const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/)
    if (!m || m[1].length !== baseIndent || /^\d/.test(m[2]) !== ordered) break

    let content = m[3]
    let checked: boolean | undefined
    const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/)
    if (taskMatch) {
      task = true
      checked = taskMatch[1] !== " "
      content = taskMatch[2]
    }

    // Everything indented deeper than the marker belongs to this item.
    const contIndent = baseIndent + m[2].length + 1
    const body: string[] = []
    i++
    while (i < lines.length) {
      const raw = lines[i]
      if (!raw.trim()) {
        // blank line stays in the item only if more indented content follows
        const lookahead = lines[i + 1]
        if (lookahead !== undefined && /^\s+/.test(lookahead) && lookahead.search(/\S/) >= Math.min(contIndent, baseIndent + 2)) {
          body.push("")
          i++
          continue
        }
        break
      }
      const indent = raw.search(/\S/)
      if (indent >= Math.min(contIndent, baseIndent + 2)) {
        body.push(raw.slice(Math.min(indent, contIndent)))
        i++
        continue
      }
      break
    }

    const para: Block = { type: "paragraph", children: parseInline(content) }
    const children: Block[] = body.length ? [para, ...parseBlocks(body)] : [para]
    items.push(
      checked === undefined ? { type: "listItem", children } : { type: "listItem", children, checked }
    )

    // skip a single blank line between sibling items
    if (i < lines.length && !lines[i].trim()) {
      const after = lines[i + 1]?.match(/^(\s*)([-*+]|\d+[.)])\s+/)
      if (after && after[1].length === baseIndent) i++
      else break
    }
  }

  return { list: { type: "list", ordered, task, items }, next: i }
}

function parseUpdates(lines: string[]): UpdateNode[] {
  const updates: UpdateNode[] = []
  let i = 0
  while (i < lines.length) {
    const tag = templateTag(lines[i])
    if (tag?.name === "update") {
      const { body, next } = collectUntil(lines, i + 1, "update")
      updates.push({
        type: "update",
        date: tag.attrs.date ?? "",
        children: parseBlocks(body),
      })
      i = next
    } else {
      i++
    }
  }
  return updates
}

function parseColumns(lines: string[]): ColumnNode[] {
  const cols: ColumnNode[] = []
  let i = 0
  while (i < lines.length) {
    const tag = templateTag(lines[i])
    if (tag?.name === "column") {
      const { body, next } = collectUntil(lines, i + 1, "column")
      cols.push({ type: "column", children: parseBlocks(body) })
      i = next
    } else {
      i++
    }
  }
  return cols
}
