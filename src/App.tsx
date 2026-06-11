import { useCallback, useEffect, useRef, useState } from "react"
import {
  BookOpen,
  Eye,
  FileText,
  GitBranch,
  Loader2,
  LogOut,
  PenLine,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { GitbookEditor } from "@/editor/Editor"
import { DocsRenderer } from "@/docs/DocsRenderer"
import { parseMarkdown } from "@/gitbook/parse"
import { api } from "@/lib/api"
import {
  useCreatePage,
  useDeletePage,
  usePage,
  usePages,
  useUpdatePage,
} from "@/queries/pages"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type View = "edit" | "preview" | "markdown"

function GithubPanel({ onClose }: { onClose: () => void }) {
  const [repo, setRepo] = useState("")
  const [busy, setBusy] = useState<"sync" | "pull" | null>(null)
  const [installations, setInstallations] = useState<string[] | null>(null)

  useEffect(() => {
    api
      .githubInstallations()
      .then((list) => {
        const repos = list.flatMap((i) => i.repositories)
        setInstallations(repos)
        if (repos[0]) setRepo((r) => r || repos[0])
      })
      .catch(() => setInstallations([]))
  }, [])

  const run = async (kind: "sync" | "pull") => {
    setBusy(kind)
    try {
      if (kind === "sync") {
        const { committed } = await api.githubSync(repo)
        toast.success(
          committed.length
            ? `Committed ${committed.length} file(s) to ${repo}`
            : "Already up to date"
        )
      } else {
        const { imported } = await api.githubPull(repo)
        toast.success(`Imported ${imported} page(s) from ${repo}`)
        window.location.reload()
      }
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="gb-github-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Git Sync</h3>
        <button className="text-muted-foreground" onClick={onClose}>
          ✕
        </button>
      </div>
      {installations === null ? (
        <p className="text-sm text-muted-foreground">Checking installations…</p>
      ) : installations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No repositories yet —{" "}
          <a
            className="underline"
            href="https://github.com/apps/blamy-notes/installations/new"
            target="_blank"
            rel="noreferrer"
          >
            install the blamy-notes GitHub App
          </a>{" "}
          on a repo first.
        </p>
      ) : (
        <select
          className="gb-repo-select"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
        >
          {installations.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={!repo || !!busy} onClick={() => run("sync")}>
          {busy === "sync" && <Loader2 className="size-3 animate-spin" />} Push to repo
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!repo || !!busy}
          onClick={() => run("pull")}
        >
          {busy === "pull" && <Loader2 className="size-3 animate-spin" />} Pull from repo
        </Button>
      </div>
    </div>
  )
}

export default function App() {
  const { data: pageList } = usePages()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<View>("edit")
  const [showGithub, setShowGithub] = useState(false)

  useEffect(() => {
    if (!selectedId && pageList?.length) setSelectedId(pageList[0].id)
  }, [pageList, selectedId])

  // Landing back from the GitHub App install/OAuth callback.
  useEffect(() => {
    const url = new URL(window.location.href)
    const github = url.searchParams.get("github")
    if (!github) return
    if (github === "connected") {
      toast.success("GitHub connected — open Git Sync to push or pull.")
      setShowGithub(true)
    } else {
      toast.error("GitHub connection failed — try installing the app again.")
    }
    url.searchParams.delete("github")
    url.searchParams.delete("installation_id")
    window.history.replaceState({}, "", url)
  }, [])

  const { data: page } = usePage(selectedId)
  const createPage = useCreatePage()
  const updatePage = useUpdatePage()
  const deletePage = useDeletePage()

  // Local editing buffer with debounced auto-save.
  const [markdown, setMarkdown] = useState("")
  const [dirty, setDirty] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (page) {
      setMarkdown(page.markdown)
      setDirty(false)
    }
  }, [page?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback(
    (md: string) => {
      setMarkdown(md)
      setDirty(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        if (selectedId) {
          updatePage.mutate(
            { id: selectedId, patch: { markdown: md } },
            { onSuccess: () => setDirty(false) }
          )
        }
      }, 800)
    },
    [selectedId, updatePage]
  )

  const addPage = () => {
    const title = window.prompt("Page title")
    if (!title) return
    createPage.mutate({ title }, { onSuccess: (p) => setSelectedId(p.id) })
  }

  const removePage = (id: string) => {
    if (!window.confirm("Delete this page?")) return
    deletePage.mutate(id, {
      onSuccess: () => {
        if (selectedId === id) setSelectedId(null)
      },
    })
  }

  const logout = async () => {
    await api.logout()
    window.location.reload()
  }

  return (
    <div className="gb-app">
      <aside className="gb-sidebar">
        <div className="gb-sidebar-head">
          <BookOpen className="size-5" />
          <span className="font-semibold">blamy-notes</span>
        </div>
        <div className="gb-sidebar-pages">
          {(pageList ?? []).map((p) => (
            <div
              key={p.id}
              className={`gb-page-item ${p.id === selectedId ? "gb-page-item-active" : ""}`}
              onClick={() => setSelectedId(p.id)}
            >
              <FileText className="size-4 shrink-0" />
              <span className="truncate">{p.title}</span>
              <button
                className="gb-page-delete"
                title="Delete page"
                onClick={(e) => {
                  e.stopPropagation()
                  removePage(p.id)
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <button className="gb-page-add" onClick={addPage}>
            <Plus className="size-4" /> New page
          </button>
        </div>
        <div className="gb-sidebar-foot">
          <Button variant="ghost" size="sm" onClick={() => setShowGithub((s) => !s)}>
            <GitBranch className="size-4" /> Git Sync
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" /> Log out
          </Button>
        </div>
        {showGithub && <GithubPanel onClose={() => setShowGithub(false)} />}
      </aside>

      <main className="gb-main">
        <header className="gb-header">
          {page && (
            <Input
              className="gb-title-input"
              value={page.title}
              onChange={(e) =>
                updatePage.mutate({ id: page.id, patch: { title: e.target.value } })
              }
            />
          )}
          <div className="gb-view-tabs">
            {(
              [
                ["edit", PenLine, "Editor"],
                ["preview", Eye, "Preview"],
                ["markdown", FileText, "Markdown"],
              ] as const
            ).map(([v, Icon, label]) => (
              <button
                key={v}
                className={`gb-view-tab ${view === v ? "gb-view-tab-active" : ""}`}
                onClick={() => setView(v)}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <span className="gb-save-state">
            {dirty ? "Saving…" : page ? "Saved" : ""}
          </span>
        </header>

        <div className="gb-content">
          {!page ? (
            <div className="gb-empty">Select or create a page.</div>
          ) : view === "edit" ? (
            <GitbookEditor key={page.id} markdown={markdown} onChange={handleChange} />
          ) : view === "preview" ? (
            <DocsRenderer doc={parseMarkdown(markdown)} />
          ) : (
            <textarea
              className="gb-raw"
              value={markdown}
              onChange={(e) => handleChange(e.target.value)}
              spellCheck={false}
            />
          )}
        </div>
      </main>
    </div>
  )
}
