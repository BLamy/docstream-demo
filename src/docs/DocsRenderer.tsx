import { useState, type ReactNode } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  File,
  Info,
  XCircle,
} from "lucide-react"

import type { Block, DocumentNode, Inline } from "@/gitbook/ast"

function InlineText({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        let el: ReactNode = n.text
        if (n.code) el = <code>{el}</code>
        if (n.bold) el = <strong>{el}</strong>
        if (n.italic) el = <em>{el}</em>
        if (n.strike) el = <s>{el}</s>
        if (n.link)
          el = (
            <a href={n.link} target="_blank" rel="noreferrer">
              {el}
            </a>
          )
        return <span key={i}>{el}</span>
      })}
    </>
  )
}

const HINT_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
}

function embedSrc(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  return yt ? `https://www.youtube.com/embed/${yt[1]}` : null
}

function Tabs({ block }: { block: Extract<Block, { type: "tabs" }> }) {
  const [active, setActive] = useState(0)
  return (
    <div className="docs-tabs">
      <div className="docs-tabs-header">
        {block.tabs.map((t, i) => (
          <button
            key={i}
            className={i === active ? "docs-tab-active" : ""}
            onClick={() => setActive(i)}
          >
            {t.title}
          </button>
        ))}
      </div>
      <div className="docs-tabs-body">
        <Blocks blocks={block.tabs[active]?.children ?? []} />
      </div>
    </div>
  )
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p>
          <InlineText nodes={block.children} />
        </p>
      )
    case "heading": {
      const Tag = `h${block.level}` as const
      return (
        <Tag>
          <InlineText nodes={block.children} />
        </Tag>
      )
    }
    case "code":
      return (
        <div className="docs-code">
          {(block.title || block.language) && (
            <div className="docs-code-header">
              <span>{block.title}</span>
              <span className="docs-code-lang">{block.language}</span>
            </div>
          )}
          <pre className={block.lineNumbers ? "docs-code-numbered" : ""}>
            {block.lineNumbers ? (
              block.code.split("\n").map((l, i) => (
                <div key={i} className="docs-code-line">
                  <span className="docs-code-lineno">{i + 1}</span>
                  <span>{l}</span>
                </div>
              ))
            ) : (
              <code>{block.code}</code>
            )}
          </pre>
        </div>
      )
    case "hint": {
      const Icon = HINT_ICONS[block.style] ?? Info
      return (
        <div className={`docs-hint docs-hint-${block.style}`}>
          <Icon className="docs-hint-icon" />
          <div>
            <Blocks blocks={block.children} />
          </div>
        </div>
      )
    }
    case "tabs":
      return <Tabs block={block} />
    case "expandable":
      return (
        <details className="docs-expandable">
          <summary>{block.summary}</summary>
          <div className="docs-expandable-body">
            <Blocks blocks={block.children} />
          </div>
        </details>
      )
    case "stepper":
      return (
        <div className="docs-stepper">
          {block.steps.map((s, i) => (
            <div key={i} className="docs-step">
              <div className="docs-step-rail">
                <div className="docs-step-badge">{i + 1}</div>
                {i < block.steps.length - 1 && <div className="docs-step-line" />}
              </div>
              <div className="docs-step-main">
                {s.title && <div className="docs-step-title">{s.title}</div>}
                <Blocks blocks={s.children} />
              </div>
            </div>
          ))}
        </div>
      )
    case "embed": {
      const src = embedSrc(block.url)
      return src ? (
        <iframe className="docs-embed" src={src} title={block.url} allowFullScreen />
      ) : (
        <a className="docs-content-ref" href={block.url} target="_blank" rel="noreferrer">
          <File className="size-4" /> {block.url}
        </a>
      )
    }
    case "content-ref":
      return (
        <a className="docs-content-ref" href={block.url}>
          <File className="size-4" />
          <span>
            <InlineText nodes={block.children} />
          </span>
          <ChevronRight className="size-4 ml-auto" />
        </a>
      )
    case "columns":
      return (
        <div className="docs-columns">
          {block.columns.map((c, i) => (
            <div key={i} className="docs-column">
              <Blocks blocks={c.children} />
            </div>
          ))}
        </div>
      )
    case "figure":
      return (
        <figure className="docs-figure">
          {block.src && <img src={block.src} alt={block.alt} />}
          {block.caption && <figcaption>{block.caption}</figcaption>}
        </figure>
      )
    case "list": {
      const Tag = block.ordered ? "ol" : "ul"
      return (
        <Tag className={block.task ? "docs-tasklist" : undefined}>
          {block.items.map((item, i) => (
            <li key={i}>
              {block.task && <input type="checkbox" checked={!!item.checked} readOnly />}
              <Blocks blocks={item.children} inline />
            </li>
          ))}
        </Tag>
      )
    }
    case "blockquote":
      return (
        <blockquote>
          <Blocks blocks={block.children} />
        </blockquote>
      )
    case "divider":
      return <hr />
    case "table":
      return (
        <table className="docs-table">
          <thead>
            <tr>
              {block.header.map((cell, i) => (
                <th key={i}>
                  <InlineText nodes={cell} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>
                    <InlineText nodes={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "math":
      return <pre className="docs-math">{block.formula}</pre>
  }
}

function Blocks({ blocks, inline }: { blocks: Block[]; inline?: boolean }) {
  return (
    <div className={inline ? "docs-blocks-inline" : undefined} style={inline ? { display: "inline" } : undefined}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  )
}

export function DocsRenderer({ doc }: { doc: DocumentNode }) {
  return (
    <article className="docs-article">
      <Blocks blocks={doc.children} />
    </article>
  )
}
