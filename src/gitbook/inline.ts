import type { Inline, InlineImageNode, TextNode } from "./ast"

type Marks = Partial<Omit<TextNode, "type" | "text">>

// Reference-style link definitions ([ref]: url), populated by parseMarkdown
// and consumed here for [text][ref] / [text][] forms.
export const refDefinitions = new Map<string, string>()

function imgAttrs(attrStr: string): Omit<InlineImageNode, "type" | "link"> {
  const attr = (name: string) => attrStr.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1]
  const out: Omit<InlineImageNode, "type" | "link"> = { src: attr("src") ?? "" }
  const alt = attr("alt")
  const width = attr("width")
  const height = attr("height")
  if (alt) out.alt = alt
  if (width) out.width = width
  if (height) out.height = height
  return out
}

// Parses GitBook/GFM inline markdown into flat TextNodes with marks.
// Supported: **bold**, _italic_ / *italic*, ~~strike~~, `code`, [text](url),
// plus GitHub-style inline HTML: <img …>, <a href><img …></a>, <a href>text</a>.
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

    // <a href="…"><img …></a> — linked image (GitHub badge style)
    const linkedImg = rest.match(/^<a\s[^>]*href="([^"]*)"[^>]*>\s*<img\s([^>]*?)\/?>\s*<\/a>/i)
    if (linkedImg) {
      flush()
      out.push({ type: "image", ...imgAttrs(linkedImg[2]), link: linkedImg[1] })
      i += linkedImg[0].length
      continue
    }

    // <img …> — bare inline image
    const htmlImg = rest.match(/^<img\s([^>]*?)\/?>/i)
    if (htmlImg) {
      flush()
      out.push({ type: "image", ...imgAttrs(htmlImg[1]) })
      i += htmlImg[0].length
      continue
    }

    // <a href="…">text</a> — html link
    const htmlLink = rest.match(/^<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/i)
    if (htmlLink) {
      flush()
      out.push(...parseInline(htmlLink[2], { ...marks, link: htmlLink[1] }))
      i += htmlLink[0].length
      continue
    }

    // ![alt](src) — markdown inline image
    const mdImg = rest.match(/^!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (mdImg) {
      flush()
      out.push({ type: "image", src: mdImg[2], ...(mdImg[1] ? { alt: mdImg[1] } : {}) })
      i += mdImg[0].length
      continue
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
      // [text][ref] / [text][] — reference-style links
      const ref = rest.match(/^\[([^\]]*)\]\[([^\]]*)\]/)
      if (ref) {
        const key = (ref[2] || ref[1]).toLowerCase()
        const url = refDefinitions.get(key)
        if (url) {
          flush()
          out.push(...parseInline(ref[1], { ...marks, link: url }))
          i += ref[0].length
          continue
        }
      }
    }

    // <https://…> — angle-bracket autolink
    const angleLink = rest.match(/^<(https?:\/\/[^>\s]+)>/i)
    if (angleLink) {
      flush()
      out.push({ type: "text", text: angleLink[1], ...marks, link: angleLink[1] })
      i += angleLink[0].length
      continue
    }

    // bare URL autolink (GFM) — at start or after whitespace
    if (
      /^https?:\/\//i.test(rest) &&
      (buf === "" || /\s$/.test(buf))
    ) {
      const m = rest.match(/^https?:\/\/[^\s<>"')\]]+/i)!
      const url = m[0].replace(/[.,;:!?]+$/, "")
      flush()
      out.push({ type: "text", text: url, ...marks, link: url })
      i += url.length
      continue
    }

    buf += src[i]
    i++
  }
  flush()
  return out
}

const escapeText = (t: string) => t.replace(/([*_~`[\]\\])/g, "\\$1")

function serializeImage(n: InlineImageNode): string {
  const attrs = [
    `src="${n.src}"`,
    n.alt ? `alt="${n.alt}"` : "",
    n.width ? `width="${n.width}"` : "",
    n.height ? `height="${n.height}"` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const img = `<img ${attrs} />`
  return n.link ? `<a href="${n.link}">${img}</a>` : img
}

// Serializes inline nodes back to markdown.
export function serializeInline(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      if (n.type === "image") return serializeImage(n)
      // bare autolink: text identical to the URL, no other marks
      if (n.link && n.text === n.link && !n.bold && !n.italic && !n.strike && !n.code) {
        return n.link
      }
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
  return nodes.map((n) => (n.type === "text" ? n.text : (n.alt ?? ""))).join("")
}
