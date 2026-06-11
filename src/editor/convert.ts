import type { Block, DocumentNode, Inline, ListItemNode } from "@/gitbook/ast"
import { plainText } from "@/gitbook/inline"

// TipTap/ProseMirror JSON shape (loosely typed on purpose)
export interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

// ---------- AST → TipTap ----------

function inlineToPM(nodes: Inline[]): PMNode[] {
  return nodes
    .filter((n) => n.type === "image" || n.text.length > 0)
    .map((n) => {
      if (n.type === "image") {
        return {
          type: "gbInlineImage",
          attrs: {
            src: n.src,
            alt: n.alt ?? "",
            width: n.width ?? "",
            height: n.height ?? "",
            link: n.link ?? "",
          },
        }
      }
      const marks: PMNode["marks"] = []
      if (n.bold) marks.push({ type: "bold" })
      if (n.italic) marks.push({ type: "italic" })
      if (n.strike) marks.push({ type: "strike" })
      if (n.code) marks.push({ type: "code" })
      if (n.link) marks.push({ type: "link", attrs: { href: n.link } })
      return { type: "text", text: n.text, ...(marks.length ? { marks } : {}) }
    })
}

const paragraphPM = (children: Inline[]): PMNode => {
  const content = inlineToPM(children)
  return content.length ? { type: "paragraph", content } : { type: "paragraph" }
}

// Containers require block+ content; empty GitBook blocks get a placeholder paragraph.
const blocksPM = (children: Block[]): PMNode[] =>
  children.length ? children.map(blockToPM) : [{ type: "paragraph" }]

function listItemToPM(item: ListItemNode, task: boolean): PMNode {
  return {
    type: task ? "taskItem" : "listItem",
    ...(task ? { attrs: { checked: !!item.checked } } : {}),
    content: item.children.map(blockToPM),
  }
}

function blockToPM(b: Block): PMNode {
  switch (b.type) {
    case "paragraph":
      return paragraphPM(b.children)
    case "heading":
      return { type: "heading", attrs: { level: b.level }, content: inlineToPM(b.children) }
    case "code":
      return {
        type: "codeBlock",
        attrs: { language: b.language, title: b.title, lineNumbers: b.lineNumbers },
        content: b.code ? [{ type: "text", text: b.code }] : [],
      }
    case "hint":
      return { type: "gbHint", attrs: { style: b.style }, content: blocksPM(b.children) }
    case "tabs":
      return {
        type: "gbTabs",
        content: b.tabs.map((t) => ({
          type: "gbTab",
          attrs: { title: t.title },
          content: blocksPM(t.children),
        })),
      }
    case "expandable":
      return {
        type: "gbExpandable",
        attrs: { summary: b.summary },
        content: blocksPM(b.children),
      }
    case "stepper":
      return {
        type: "gbStepper",
        content: b.steps.map((s) => ({
          type: "gbStep",
          attrs: { title: s.title },
          content: blocksPM(s.children),
        })),
      }
    case "embed":
      return { type: "gbEmbed", attrs: { url: b.url } }
    case "content-ref":
      return { type: "gbContentRef", attrs: { url: b.url, label: plainText(b.children) } }
    case "columns":
      return {
        type: "gbColumns",
        content: b.columns.map((c) => ({ type: "gbColumn", content: blocksPM(c.children) })),
      }
    case "figure":
      return { type: "gbFigure", attrs: { src: b.src, alt: b.alt, caption: b.caption } }
    case "list":
      return {
        type: b.task ? "taskList" : b.ordered ? "orderedList" : "bulletList",
        content: b.items.map((item) => listItemToPM(item, b.task)),
      }
    case "blockquote":
      return { type: "blockquote", content: blocksPM(b.children) }
    case "divider":
      return { type: "horizontalRule" }
    case "table":
      return {
        type: "table",
        ...(b.view ? { attrs: { view: b.view } } : {}),
        content: [
          {
            type: "tableRow",
            content: b.header.map((cell) => ({
              type: "tableHeader",
              content: [paragraphPM(cell)],
            })),
          },
          ...b.rows.map((row) => ({
            type: "tableRow",
            content: row.map((cell) => ({ type: "tableCell", content: [paragraphPM(cell)] })),
          })),
        ],
      }
    case "math":
      return { type: "gbMath", attrs: { formula: b.formula } }
    case "updates":
      return {
        type: "gbUpdates",
        attrs: { format: b.format },
        content: b.updates.map((u) => ({
          type: "gbUpdate",
          attrs: { date: u.date },
          content: blocksPM(u.children),
        })),
      }
    case "openapi-operation":
      return {
        type: "gbOpenapi",
        attrs: {
          spec: b.spec,
          path: b.path,
          method: b.method,
          specUrl: b.specUrl,
          label: b.label,
        },
      }
  }
}

export function astToTiptap(doc: DocumentNode): PMNode {
  const content = doc.children.map(blockToPM)
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] }
}

// ---------- TipTap → AST ----------

function pmTextToInline(nodes: PMNode[] | undefined): Inline[] {
  if (!nodes) return []
  return nodes
    .filter((n) => (n.type === "text" && n.text) || n.type === "gbInlineImage")
    .map((n): Inline => {
      if (n.type === "gbInlineImage") {
        const a = n.attrs ?? {}
        return {
          type: "image",
          src: String(a.src ?? ""),
          ...(a.alt ? { alt: String(a.alt) } : {}),
          ...(a.width ? { width: String(a.width) } : {}),
          ...(a.height ? { height: String(a.height) } : {}),
          ...(a.link ? { link: String(a.link) } : {}),
        }
      }
      const inline: Inline = { type: "text", text: n.text! }
      for (const mark of n.marks ?? []) {
        if (mark.type === "bold") inline.bold = true
        if (mark.type === "italic") inline.italic = true
        if (mark.type === "strike") inline.strike = true
        if (mark.type === "code") inline.code = true
        if (mark.type === "link") inline.link = String(mark.attrs?.href ?? "")
      }
      return inline
    })
}

function pmCellToInline(cell: PMNode): Inline[] {
  // table cells contain paragraphs; flatten the first one
  return pmTextToInline(cell.content?.[0]?.content)
}

function pmToBlock(n: PMNode): Block | null {
  switch (n.type) {
    case "paragraph": {
      const children = pmTextToInline(n.content)
      if (!children.length) return null // drop empty paragraphs from markdown
      return { type: "paragraph", children }
    }
    case "heading":
      return {
        type: "heading",
        level: (Number(n.attrs?.level) || 1) as 1 | 2 | 3 | 4 | 5 | 6,
        children: pmTextToInline(n.content),
      }
    case "codeBlock":
      return {
        type: "code",
        language: (n.attrs?.language as string) || null,
        title: (n.attrs?.title as string) || null,
        lineNumbers: !!n.attrs?.lineNumbers,
        code: n.content?.map((c) => c.text ?? "").join("") ?? "",
      }
    case "gbHint":
      return {
        type: "hint",
        style: (n.attrs?.style as never) ?? "info",
        children: pmToBlocks(n.content),
      }
    case "gbTabs":
      return {
        type: "tabs",
        tabs: (n.content ?? []).map((t) => ({
          type: "tab",
          title: String(t.attrs?.title ?? "Tab"),
          children: pmToBlocks(t.content),
        })),
      }
    case "gbExpandable":
      return {
        type: "expandable",
        summary: String(n.attrs?.summary ?? ""),
        children: pmToBlocks(n.content),
      }
    case "gbStepper":
      return {
        type: "stepper",
        steps: (n.content ?? []).map((s) => ({
          type: "step",
          title: String(s.attrs?.title ?? ""),
          children: pmToBlocks(s.content),
        })),
      }
    case "gbEmbed":
      return { type: "embed", url: String(n.attrs?.url ?? "") }
    case "gbContentRef":
      return {
        type: "content-ref",
        url: String(n.attrs?.url ?? ""),
        children: [{ type: "text", text: String(n.attrs?.label ?? "") }],
      }
    case "gbColumns":
      return {
        type: "columns",
        columns: (n.content ?? []).map((c) => ({ type: "column", children: pmToBlocks(c.content) })),
      }
    case "gbFigure":
      return {
        type: "figure",
        src: String(n.attrs?.src ?? ""),
        alt: String(n.attrs?.alt ?? ""),
        caption: String(n.attrs?.caption ?? ""),
      }
    case "gbMath":
      return { type: "math", formula: String(n.attrs?.formula ?? "") }
    case "gbUpdates":
      return {
        type: "updates",
        format: (n.attrs?.format as string) || null,
        updates: (n.content ?? []).map((u) => ({
          type: "update",
          date: String(u.attrs?.date ?? ""),
          children: pmToBlocks(u.content),
        })),
      }
    case "gbOpenapi":
      return {
        type: "openapi-operation",
        spec: String(n.attrs?.spec ?? ""),
        path: String(n.attrs?.path ?? ""),
        method: String(n.attrs?.method ?? ""),
        specUrl: String(n.attrs?.specUrl ?? ""),
        label: String(n.attrs?.label ?? ""),
      }
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const task = n.type === "taskList"
      return {
        type: "list",
        ordered: n.type === "orderedList",
        task,
        items: (n.content ?? []).map((item) => {
          const base: ListItemNode = { type: "listItem", children: pmToBlocks(item.content) }
          if (task) base.checked = !!item.attrs?.checked
          if (!base.children.length) base.children = [{ type: "paragraph", children: [] }]
          return base
        }),
      }
    }
    case "blockquote":
      return { type: "blockquote", children: pmToBlocks(n.content) }
    case "horizontalRule":
      return { type: "divider" }
    case "table": {
      const rows = n.content ?? []
      const [head, ...body] = rows
      const view = n.attrs?.view as string | undefined
      return {
        type: "table",
        header: (head?.content ?? []).map(pmCellToInline),
        rows: body.map((r) => (r.content ?? []).map(pmCellToInline)),
        ...(view ? { view } : {}),
      }
    }
    default:
      return null
  }
}

function pmToBlocks(nodes: PMNode[] | undefined): Block[] {
  return (nodes ?? []).map(pmToBlock).filter((b): b is Block => b !== null)
}

export function tiptapToAst(doc: PMNode): DocumentNode {
  return { type: "doc", children: pmToBlocks(doc.content) }
}
