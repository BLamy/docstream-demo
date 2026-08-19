import { useEffect, useMemo, useState, type MouseEvent } from "react"
import { AlignLeft, ArrowRight, Book, ChevronRight } from "lucide-react"

import { DocsRenderer, parseMarkdown } from "@brett_lamy/docstream"
import DocsShell from "./DocsShell"

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

export default function DocsSite() {
  const [page, setPage] = useState(() => pageFromPath(window.location.pathname))
  const [query, setQuery] = useState("")

  const doc = useMemo(() => parseMarkdown(page.markdown), [page])

  const navigate = (next: DocPage, e?: MouseEvent) => {
    e?.preventDefault()
    window.history.pushState({}, "", `/docs/${next.slug}`)
    setPage(next)
  }

  useEffect(() => {
    const onPop = () => setPage(pageFromPath(window.location.pathname))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // Internal /docs/* links inside rendered markdown stay in the SPA.
  const onContentClick = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a")
    if (!link) return
    const href = link.getAttribute("href") ?? ""
    if (!href.startsWith("/docs/")) return
    const target = ALL_PAGES.find((p) => `/docs/${p.slug}` === href)
    if (target) navigate(target, e)
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
    <DocsShell
      tocKey={page.slug}
      searchValue={query}
      onSearchChange={setQuery}
      brand={
        <a className="docs-brand" href="/docs" onClick={(e) => navigate(ALL_PAGES[0], e)}>
          <span className="docs-brand-mark">
            <span />
            <span />
            <span />
          </span>
          Blamy Notes
        </a>
      }
      actions={
        <a className="docs-dashboard-link" href="/">
          Dashboard <ChevronRight className="size-3.5" />
        </a>
      }
      subnav={
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
      }
      nav={
        <>
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
        </>
      }
      footer={
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
      }
    >
      <div onClick={onContentClick}>
        <DocsRenderer doc={doc} />
      </div>
    </DocsShell>
  )
}
