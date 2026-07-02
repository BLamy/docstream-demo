import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { AlignLeft, ArrowRight, Book, ChevronRight, Search } from "lucide-react"

import { DocsRenderer, parseMarkdown } from "@brett_lamy/docstream"

import quickstart from "./content/quickstart.md?raw"
import editor from "./content/editor.md?raw"
import publishing from "./content/publishing.md?raw"
import billing from "./content/billing.md?raw"
import apiReference from "./content/api-reference.md?raw"
import localEmulators from "./content/local-emulators.md?raw"

interface DocPage {
  slug: string
  title: string
  markdown: string
}

interface DocSection {
  label: string
  pages: DocPage[]
}

const SECTIONS: DocSection[] = [
  {
    label: "Getting Started",
    pages: [
      { slug: "quickstart", title: "Quickstart", markdown: quickstart },
      { slug: "editor", title: "Editor Guide", markdown: editor },
    ],
  },
  {
    label: "Publishing",
    pages: [{ slug: "publishing", title: "Public Docs Sites", markdown: publishing }],
  },
  {
    label: "Platform",
    pages: [
      { slug: "billing", title: "Plans & Billing", markdown: billing },
      { slug: "api-reference", title: "API Reference", markdown: apiReference },
    ],
  },
  {
    label: "Development",
    pages: [{ slug: "local-emulators", title: "Local Emulators", markdown: localEmulators }],
  },
]

const ALL_PAGES = SECTIONS.flatMap((s) => s.pages)

function pageFromPath(pathname: string): DocPage {
  const slug = pathname.replace(/^\/docs\/?/, "").replace(/\/$/, "")
  return ALL_PAGES.find((p) => p.slug === slug) ?? ALL_PAGES[0]
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

interface TocEntry {
  id: string
  text: string
  level: number
}

export default function DocsSite() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname))
  const [query, setQuery] = useState("")
  const [toc, setToc] = useState<TocEntry[]>([])
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  const doc = useMemo(() => parseMarkdown(page.markdown), [page])

  const navigate = (next: DocPage, e?: MouseEvent) => {
    e?.preventDefault()
    window.history.pushState({}, "", `/docs/${next.slug}`)
    setPage(next)
    scrollRef.current?.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onPop = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // The renderer emits plain h2/h3 tags; anchors and the "On this page" rail
  // are wired up after each render.
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
  }, [doc])

  // Internal /docs/* links inside rendered markdown stay in the SPA.
  const onContentClick = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a")
    if (!link) return
    const href = link.getAttribute("href") ?? ""
    if (!href.startsWith("/docs/")) return
    const target = ALL_PAGES.find((p) => `/docs/${p.slug}` === href)
    if (target) navigate(target, e)
  }

  const jumpTo = (id: string, e: MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
    setActiveAnchor(id)
  }

  const q = query.trim().toLowerCase()
  const visibleSections = q
    ? SECTIONS.map((s) => ({
        ...s,
        pages: s.pages.filter((p) => p.title.toLowerCase().includes(q)),
      })).filter((s) => s.pages.length > 0)
    : SECTIONS

  const pageIndex = ALL_PAGES.indexOf(page)
  const prev = pageIndex > 0 ? ALL_PAGES[pageIndex - 1] : null
  const next = pageIndex < ALL_PAGES.length - 1 ? ALL_PAGES[pageIndex + 1] : null

  return (
    <div className="docs-root dark">
      <header className="docs-topbar">
        <a
          className="docs-brand"
          href="/docs"
          onClick={(e) => navigate(ALL_PAGES[0], e)}
        >
          <span className="docs-brand-mark">
            <span />
            <span />
            <span />
          </span>
          Blamy Notes
        </a>
        <div className="docs-search">
          <Search className="size-3.5" />
          <input
            value={query}
            placeholder="Search…"
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>⌘K</kbd>
        </div>
        <div className="docs-topbar-actions">
          <a className="docs-dashboard-link" href="/">
            Dashboard <ChevronRight className="size-3.5" />
          </a>
        </div>
      </header>

      <div className="docs-subnav">
        <span className="docs-subnav-item docs-subnav-item-active">
          <Book className="size-3.5" /> Documentation
        </span>
        <a
          className="docs-subnav-item"
          href="/docs/api-reference"
          onClick={(e) => navigate(ALL_PAGES.find((p) => p.slug === "api-reference")!, e)}
        >
          <AlignLeft className="size-3.5" /> API Reference
        </a>
      </div>

      <div className="docs-body">
        <aside className="docs-nav">
          {visibleSections.map((section) => (
            <div key={section.label} className="docs-nav-section">
              <div className="docs-nav-label">{section.label}</div>
              {section.pages.map((p) => (
                <a
                  key={p.slug}
                  href={`/docs/${p.slug}`}
                  className={`docs-nav-item ${p.slug === page.slug ? "docs-nav-item-active" : ""}`}
                  onClick={(e) => navigate(p, e)}
                >
                  {p.title}
                </a>
              ))}
            </div>
          ))}
          {visibleSections.length === 0 && (
            <div className="docs-nav-empty">No pages match “{query}”.</div>
          )}
        </aside>

        <main className="docs-content" ref={scrollRef}>
          <div className="docs-prose" ref={contentRef} onClick={onContentClick}>
            <DocsRenderer doc={doc} />
          </div>
          <footer className="docs-pager">
            {prev ? (
              <a href={`/docs/${prev.slug}`} onClick={(e) => navigate(prev, e)}>
                <span>Previous</span>
                {prev.title}
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a
                className="docs-pager-next"
                href={`/docs/${next.slug}`}
                onClick={(e) => navigate(next, e)}
              >
                <span>
                  Next <ArrowRight className="size-3" />
                </span>
                {next.title}
              </a>
            )}
          </footer>
        </main>

        <aside className="docs-toc">
          <div className="docs-toc-label">
            <AlignLeft className="size-3.5" /> On this page
          </div>
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
