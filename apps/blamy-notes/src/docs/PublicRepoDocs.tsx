import { useEffect, useMemo, useState, type MouseEvent } from "react"
import { useQuery } from "@tanstack/react-query"
import { Book, Check, Copy, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { DocsRenderer, parseMarkdown, setAssetBase } from "@brett_lamy/docstream"
import { api } from "@/lib/api"
import {
  githubUrlForPreview,
  preferredMarkdownFile,
  publicSourceLabel,
  titleFromPath,
  type PublicGithubPreview,
} from "@/lib/public-preview"
import DocsShell from "./DocsShell"

interface NavSection {
  label: string
  files: string[]
}

/** Group markdown paths into nav sections by top-level directory. */
function buildSections(files: string[], repoName: string): NavSection[] {
  const bySection = new Map<string, string[]>()
  for (const path of files) {
    const slash = path.indexOf("/")
    const section = slash === -1 ? repoName : titleFromPath(path.slice(0, slash))
    if (!bySection.has(section)) bySection.set(section, [])
    bySection.get(section)!.push(path)
  }
  // Root files first, then directories alphabetically.
  return [...bySection.entries()]
    .sort(([a], [b]) => (a === repoName ? -1 : b === repoName ? 1 : a.localeCompare(b)))
    .map(([label, sectionFiles]) => ({ label, files: sectionFiles }))
}

function fileFromLocation(files: string[]): string | null {
  const requested = new URLSearchParams(window.location.search).get("file")
  if (requested && files.includes(requested)) return requested
  return preferredMarkdownFile(files)
}

/** Resolve an href relative to the directory of the current file. */
function resolveRelativePath(from: string, href: string): string {
  const dir = from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : ""
  const out: string[] = []
  for (const part of (dir + href).split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

/**
 * The published docs site for a repo: markdown files rendered as a dark
 * documentation site (same shell as /docs), automatically structured from
 * the repository's markdown tree. Read-only — no editor chrome.
 */
export default function PublicRepoDocs({ preview }: { preview: PublicGithubPreview }) {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [copied, setCopied] = useState(false)

  const tree = useQuery({
    queryKey: ["public-tree", preview.repo, preview.source],
    queryFn: () => api.publicRepoTree(preview.repo, preview.source),
    staleTime: 60_000,
    retry: false,
  })

  useEffect(() => {
    if (!filePath && tree.data) setFilePath(fileFromLocation(tree.data.files))
  }, [filePath, tree.data])

  const file = useQuery({
    queryKey: ["public-file", preview.repo, filePath, preview.source],
    queryFn: () => api.publicRepoFile(preview.repo, filePath!, preview.source),
    enabled: !!filePath,
    staleTime: 60_000,
    retry: false,
  })

  // Relative image srcs in the file resolve against the repo's raw URL.
  useEffect(() => {
    setAssetBase(
      tree.data?.assetRepo ?? preview.repo,
      tree.data?.ref ?? tree.data?.branch ?? null,
      filePath
    )
  }, [preview.repo, tree.data?.assetRepo, tree.data?.branch, tree.data?.ref, filePath])

  const doc = useMemo(
    () => (file.data ? parseMarkdown(file.data.content) : null),
    [file.data]
  )

  const selectFile = (path: string) => {
    setFilePath(path)
    const url = new URL(window.location.href)
    url.searchParams.set("file", path)
    window.history.replaceState({}, "", url)
  }

  // Relative markdown links inside pages ("notes/architecture.md") switch
  // pages in place instead of navigating the browser to a broken URL.
  const onContentClick = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a")
    if (!link) return
    const href = link.getAttribute("href") ?? ""
    if (!href || /^([a-z]+:|\/|#)/i.test(href)) return
    const target = resolveRelativePath(filePath ?? "", href.split(/[?#]/)[0])
    if (target.endsWith(".md") && tree.data?.files.includes(target)) {
      e.preventDefault()
      selectFile(target)
    }
  }

  const copyMarkdown = async () => {
    if (!file.data) return
    await navigator.clipboard.writeText(file.data.content)
    setCopied(true)
    toast.success("Markdown copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  const q = query.trim().toLowerCase()
  const sections = useMemo(() => {
    const files = tree.data?.files ?? []
    const visible = q
      ? files.filter(
          (path) =>
            path.toLowerCase().includes(q) || titleFromPath(path).toLowerCase().includes(q)
        )
      : files
    return buildSections(visible, preview.name)
  }, [tree.data?.files, q, preview.name])

  const refLabel = tree.data?.branch ?? publicSourceLabel(preview)

  return (
    <DocsShell
      tocKey={`${preview.repo}:${filePath ?? ""}:${file.data ? "ready" : "loading"}`}
      searchValue={query}
      onSearchChange={setQuery}
      brand={
        <span className="docs-brand docs-brand-repo">
          <Book className="size-4" />
          {preview.repo}
          <span className="docs-ref-pill">{refLabel}</span>
        </span>
      }
      actions={
        <>
          <button
            className="docs-topbar-btn"
            onClick={copyMarkdown}
            disabled={!file.data}
            data-testid="copy-markdown"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            Copy as Markdown
          </button>
          <a
            className="docs-topbar-btn"
            href={tree.data?.htmlUrl ?? githubUrlForPreview(preview)}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" /> GitHub
          </a>
        </>
      }
      nav={
        <>
          {tree.isLoading && <div className="docs-nav-empty">Loading pages…</div>}
          {tree.isError && (
            <div className="docs-nav-empty">
              This repository isn't published. {String(tree.error)}
            </div>
          )}
          {sections.map((section) => (
            <div key={section.label} className="docs-nav-section">
              <div className="docs-nav-label">{section.label}</div>
              {section.files.map((path) => (
                <a
                  key={path}
                  href={`?file=${encodeURIComponent(path)}`}
                  className={`docs-nav-item ${path === filePath ? "docs-nav-item-active" : ""}`}
                  onClick={(e) => {
                    e.preventDefault()
                    selectFile(path)
                  }}
                >
                  {titleFromPath(path)}
                </a>
              ))}
            </div>
          ))}
          {tree.data && sections.length === 0 && (
            <div className="docs-nav-empty">
              {q ? `No pages match “${query}”.` : "No markdown files in this repository."}
            </div>
          )}
        </>
      }
      footer={
        <footer className="docs-public-footer">
          Published with <a href="/docs">Blamy Notes</a> · read-only
        </footer>
      }
    >
      {tree.isError ? (
        <div className="docs-public-empty">
          <h1>Not published</h1>
          <p>
            This repository has no public docs site. If you own it, publish it from the
            Blamy Notes editor.
          </p>
        </div>
      ) : file.isLoading || tree.isLoading ? (
        <div className="docs-public-empty">Loading…</div>
      ) : file.isError ? (
        <div className="docs-public-empty">Failed to load page: {String(file.error)}</div>
      ) : doc ? (
        <div onClick={onContentClick}>
          <DocsRenderer doc={doc} />
        </div>
      ) : (
        <div className="docs-public-empty">Select a page.</div>
      )}
    </DocsShell>
  )
}
