import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { AlignLeft, Search } from "lucide-react"

interface TocEntry {
  id: string
  text: string
  level: number
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * The dark three-column documentation chrome: topbar (brand / search /
 * actions), optional subnav row, left navigation rail, content column, and a
 * self-wiring "On this page" scrollspy rail built from the rendered h2/h3s.
 * Used by the product docs (/docs) and by published repo docs sites.
 */
export default function DocsShell({
  brand,
  actions,
  subnav,
  nav,
  searchValue,
  onSearchChange,
  tocKey,
  footer,
  children,
}: {
  brand: ReactNode
  actions?: ReactNode
  subnav?: ReactNode
  nav: ReactNode
  searchValue?: string
  onSearchChange?: (value: string) => void
  /** Changes whenever the content column re-renders a new page. */
  tocKey: string
  footer?: ReactNode
  children: ReactNode
}) {
  const [toc, setToc] = useState<TocEntry[]>([])
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  // The renderer emits plain h2/h3 tags; anchors and the "On this page"
  // rail are wired up after each page render.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const headings = [...root.querySelectorAll<HTMLElement>("h2, h3")]
    const entries = headings.map((el) => {
      const text = el.textContent ?? ""
      const id = slugify(text)
      el.id = id
      return { id, text, level: el.tagName === "H2" ? 2 : 3 }
    })
    setToc(entries)
    setActiveAnchor(entries[0]?.id ?? null)
    scrollRef.current?.scrollTo({ top: 0 })

    const scroller = scrollRef.current
    if (!scroller) return
    const onScroll = () => {
      let current: string | null = entries[0]?.id ?? null
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= 120) current = el.id
      }
      setActiveAnchor(current)
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", onScroll)
  }, [tocKey])

  const jumpTo = (id: string, e: MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveAnchor(id)
  }

  return (
    <div className="docs-root dark">
      <header className="docs-topbar">
        {brand}
        {onSearchChange && (
          <div className="docs-search">
            <Search className="size-3.5" />
            <input
              value={searchValue ?? ""}
              placeholder="Search…"
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <kbd>⌘K</kbd>
          </div>
        )}
        <div className="docs-topbar-actions">{actions}</div>
      </header>

      {subnav}

      <div className="docs-body">
        <aside className="docs-nav">{nav}</aside>

        <main className="docs-content" ref={scrollRef}>
          <div className="docs-prose" ref={contentRef}>
            {children}
          </div>
          {footer}
        </main>

        <aside className="docs-toc">
          {toc.length > 0 && (
            <div className="docs-toc-label">
              <AlignLeft className="size-3.5" /> On this page
            </div>
          )}
          {toc.map((entry) => (
            <a
              key={entry.id}
              href={`#${entry.id}`}
              className={`docs-toc-item ${entry.level === 3 ? "docs-toc-item-sub" : ""} ${
                entry.id === activeAnchor ? "docs-toc-item-active" : ""
              }`}
              onClick={(e) => jumpTo(entry.id, e)}
            >
              {entry.text}
            </a>
          ))}
        </aside>
      </div>
    </div>
  )
}
