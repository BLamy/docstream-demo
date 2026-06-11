import type { Inline, TextNode } from "./ast"

type Marks = Partial<Omit<TextNode, "type" | "text">>

// Parses GitBook/GFM inline markdown into flat TextNodes with marks.
// Supported: **bold**, _italic_ / *italic*, ~~strike~~, `code`, [text](url).
export function parseInline(src: string, marks: Marks = {}): Inline[] {
  const out: Inline[] = []
  let buf = ""

  const flush = () => {
    if (buf) {
      out.push({ type: "text", text: buf, ...marks })
      buf = ""
    }
  }

  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)

    if (rest.startsWith("\\") && rest.length > 1) {
      buf += rest[1]
      i += 2
      continue
    }

    // inline code: no nested marks inside
    if (rest[0] === "`") {
      const end = src.indexOf("`", i + 1)
      if (end !== -1) {
        flush()
        out.push({ type: "text", text: src.slice(i + 1, end), ...marks, code: true })
        i = end + 1
        continue
      }
    }

    const delims: Array<[string, Marks]> = [
      ["**", { bold: true }],
      ["~~", { strike: true }],
      ["*", { italic: true }],
      ["_", { italic: true }],
    ]
    let matched = false
    for (const [d, mark] of delims) {
      if (rest.startsWith(d)) {
        const end = src.indexOf(d, i + d.length)
        if (end > i + d.length - 1 && end !== -1 && src.slice(i + d.length, end).length > 0) {
          flush()
          out.push(...parseInline(src.slice(i + d.length, end), { ...marks, ...mark }))
          i = end + d.length
          matched = true
          break
        }
      }
    }
    if (matched) continue

    // [text](url)
    if (rest[0] === "[") {
      const m = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/)
      if (m) {
        flush()
        out.push(...parseInline(m[1], { ...marks, link: m[2] }))
        i += m[0].length
        continue
      }
    }

    buf += src[i]
    i++
  }
  flush()
  return out
}

const escapeText = (t: string) => t.replace(/([*_~`[\]\\])/g, "\\$1")

// Serializes TextNodes back to markdown. Adjacent nodes with identical marks
// are merged before wrapping so round-trips stay stable.
export function serializeInline(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      let s = n.code ? n.text : escapeText(n.text)
      if (n.code) s = `\`${s}\``
      if (n.bold) s = `**${s}**`
      if (n.italic) s = `_${s}_`
      if (n.strike) s = `~~${s}~~`
      if (n.link) s = `[${s}](${n.link})`
      return s
    })
    .join("")
}

export function plainText(nodes: Inline[]): string {
  return nodes.map((n) => n.text).join("")
}
