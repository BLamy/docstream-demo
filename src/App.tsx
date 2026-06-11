import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Book,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  Loader2,
  LogOut,
  PenLine,
  Search,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { GitbookEditor } from "@/editor/Editor"
import { DocsRenderer } from "@/docs/DocsRenderer"
import { parseMarkdown } from "@/gitbook/parse"
import { api } from "@/lib/api"
import { setAssetBase } from "@/lib/assets"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type View = "edit" | "preview" | "markdown"


// ---------- File tree ----------

interface TreeDir {
  dirs: Map<string, TreeDir>
  files: string[] // full paths
}

function buildTree(paths: string[]): TreeDir {
  const root: TreeDir = { dirs: new Map(), files: [] }
  for (const path of paths) {
    const parts = path.split("/")
    let node = root
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] })
      node = node.dirs.get(part)!
    }
    node.files.push(path)
  }
  return root
}

function FileTree({
  node,
  name,
  depth,
  selected,
  onSelect,
}: {
  node: TreeDir
  name?: string
  depth: number
  selected: string | null
  onSelect: (path: string) => void
}) {
  const [open, setOpen] = useState(depth < 1)
  const inner = (
    <>
      {[...node.dirs.entries()].map(([dir, child]) => (
        <FileTree
          key={dir}
          node={child}
          name={dir}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
      {node.files.map((path) => (
        <button
          key={path}
          className={`tree-file ${selected === path ? "tree-file-active" : ""}`}
          style={{ paddingLeft: 10 + depth * 14 }}
          onClick={() => onSelect(path)}
        >
          <FileText className="size-3.5 shrink-0" />
          <span className="truncate">{path.split("/").pop()}</span>
        </button>
      ))}
    </>
  )
  if (name === undefined) return inner
  return (
    <div>
      <button
        className="tree-dir"
        style={{ paddingLeft: 10 + (depth - 1) * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Folder className="size-3.5" />
        <span className="truncate">{name}</span>
      </button>
      {open && inner}
    </div>
  )
}

// ---------- App ----------

export default function App() {
  const [repo, setRepo] = useState<string | null>(null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [view, setView] = useState<View>("edit")
  const [owner, setOwner] = useState<string | null>(null)
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false)
  const [search, setSearch] = useState("")

  // Repos come from the logged-in user's own GitHub identity (Auth0 Token
  // Vault exchanges the session's refresh token for their GitHub token).
  const reposQuery = useQuery({
    queryKey: ["repos"],
    queryFn: api.githubRepos,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: api.githubProfile,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const allRepos = useMemo(() => reposQuery.data ?? [], [reposQuery.data])
  const githubNotConnected =
    reposQuery.isError && String(reposQuery.error).includes("github_not_connected")

  // Owner switcher: the user plus their orgs (plus any other owners that
  // appear among accessible repos, e.g. collaborator repos).
  const owners = useMemo(() => {
    const known = new Map<string, string>() // login -> avatar
    if (profile.data) {
      known.set(profile.data.user.login, profile.data.user.avatar)
      for (const o of profile.data.orgs) known.set(o.login, o.avatar)
    }
    for (const r of allRepos) {
      const o = r.split("/")[0]
      if (!known.has(o)) known.set(o, `https://github.com/${o}.png?size=48`)
    }
    return [...known.entries()].map(([login, avatar]) => ({ login, avatar }))
  }, [profile.data, allRepos])

  // Default to the personal account once known.
  useEffect(() => {
    if (!owner && profile.data) setOwner(profile.data.user.login)
  }, [owner, profile.data])

  const activeOwner = owners.find((o) => o.login === owner) ?? owners[0] ?? null

  // No query: show the active owner's repos. With a query: search EVERY repo
  // the user can access, across all owners.
  const searching = search.trim().length > 0
  const repos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) return allRepos.filter((r) => r.toLowerCase().includes(q))
    return allRepos.filter((r) => !activeOwner || r.split("/")[0] === activeOwner.login)
  }, [allRepos, activeOwner, search])

  const tree = useQuery({
    queryKey: ["tree", repo],
    queryFn: () => api.repoTree(repo!),
    enabled: !!repo,
    staleTime: 60_000,
  })

  const file = useQuery({
    queryKey: ["file", repo, filePath],
    queryFn: () => api.repoFile(repo!, filePath!),
    enabled: !!repo && !!filePath,
  })

  // Local editing buffer; synced to GitHub only on demand.
  const [markdown, setMarkdown] = useState("")
  const [dirty, setDirty] = useState(false)
  const [syncing, setSyncing] = useState<"main" | "pr" | null>(null)

  useEffect(() => {
    if (file.data) {
      setMarkdown(file.data.content)
      setDirty(false)
    }
  }, [file.data])

  // Relative image srcs in the file resolve against the repo's raw URL.
  useEffect(() => {
    setAssetBase(repo, tree.data?.branch ?? null, filePath)
  }, [repo, tree.data?.branch, filePath])

  const handleChange = useCallback((md: string) => {
    setMarkdown(md)
    setDirty(true)
  }, [])

  const selectRepo = (r: string) => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return
    setRepo(r === repo ? null : r)
    setFilePath(null)
    setDirty(false)
  }

  const selectFile = (path: string) => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return
    setFilePath(path)
    setDirty(false)
  }

  const [pendingMode, setPendingMode] = useState<"main" | "pr" | null>(null)
  const [commitMessage, setCommitMessage] = useState("")

  const openSyncPanel = (mode: "main" | "pr") => {
    setCommitMessage(`docs: update ${filePath}`)
    setPendingMode(mode)
  }

  const sync = async (mode: "main" | "pr", message: string) => {
    if (!repo || !filePath || !file.data || !message) return
    setPendingMode(null)
    setSyncing(mode)
    try {
      const result = await api.repoSave(repo, {
        path: filePath,
        content: markdown,
        message,
        mode,
        sha: file.data.sha,
      })
      setDirty(false)
      if (result.prUrl) {
        toast.success(`Opened PR #${result.number}`, {
          action: { label: "View", onClick: () => window.open(result.prUrl, "_blank") },
        })
      } else {
        toast.success(`Committed to ${tree.data?.branch ?? "main"}`, {
          action: { label: "View", onClick: () => window.open(result.commitUrl, "_blank") },
        })
      }
      file.refetch()
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setSyncing(null)
    }
  }

  const logout = async () => {
    await api.logout()
    window.location.reload()
  }

  return (
    <div className="gb-app">
      <aside className="gb-sidebar">
        <div className="gb-sidebar-head">
          {activeOwner ? (
            <button className="gb-owner-switch" onClick={() => setOwnerMenuOpen((o) => !o)}>
              <img className="gb-owner-avatar" src={activeOwner.avatar} alt="" />
              <span className="font-semibold truncate">{activeOwner.login}</span>
              <ChevronDown className="size-4 shrink-0" />
            </button>
          ) : (
            <>
              <Book className="size-5" />
              <span className="font-semibold">blamy-notes</span>
            </>
          )}
          {ownerMenuOpen && (
            <div className="gb-owner-menu">
              {owners.map((o) => (
                <button
                  key={o.login}
                  className={`gb-owner-item ${o.login === activeOwner?.login ? "gb-owner-item-active" : ""}`}
                  onClick={() => {
                    setOwner(o.login)
                    setOwnerMenuOpen(false)
                    setRepo(null)
                    setFilePath(null)
                  }}
                >
                  <img className="gb-owner-avatar" src={o.avatar} alt="" />
                  <span className="truncate">{o.login}</span>
                  {o.login === profile.data?.user.login && (
                    <span className="gb-owner-tag">you</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="gb-sidebar-search">
          <Search className="size-3.5" />
          <input
            value={search}
            placeholder="Find repositories…"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} title="Clear">
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="gb-sidebar-scroll">
          <div className="gb-section-label">Repositories</div>
          {reposQuery.isLoading && (
            <div className="gb-sidebar-note">Loading repositories…</div>
          )}
          {githubNotConnected && (
            <div className="gb-sidebar-note">
              This login isn't connected to GitHub. Log out and sign in with{" "}
              <strong>Continue with GitHub</strong> to see your repositories.
            </div>
          )}
          {reposQuery.isError && !githubNotConnected && (
            <div className="gb-sidebar-note">
              Failed to load repositories: {String(reposQuery.error)}
            </div>
          )}
          {reposQuery.data && repos.length === 0 && (
            <div className="gb-sidebar-note">
              {search
                ? `No repositories match “${search}”.`
                : `No repositories in ${activeOwner?.login ?? "this org"}.`}
            </div>
          )}
          {repos.map((r) => {
            const [repoOwner, name] = r.split("/")
            const active = r === repo
            const foreign = searching && repoOwner !== activeOwner?.login
            return (
              <div key={r}>
                <button
                  className={`repo-item ${active ? "repo-item-active" : ""}`}
                  onClick={() => selectRepo(r)}
                >
                  {active ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  <GitBranch className="size-3.5 shrink-0" />
                  <span className="truncate">{name}</span>
                  {foreign && <span className="repo-owner">{repoOwner}</span>}
                </button>
                {active && (
                  <div className="repo-tree">
                    {tree.isLoading && <div className="gb-sidebar-note">Loading files…</div>}
                    {tree.data && tree.data.files.length === 0 && (
                      <div className="gb-sidebar-note">No markdown files</div>
                    )}
                    {tree.data && (
                      <FileTree
                        node={buildTree(tree.data.files)}
                        depth={0}
                        selected={filePath}
                        onSelect={selectFile}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="gb-sidebar-foot">
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" /> Log out
          </Button>
        </div>
      </aside>

      <main className="gb-main">
        <header className="gb-header">
          <span className="gb-file-path">
            {filePath ? (
              <>
                <FileText className="size-4" /> {filePath}
              </>
            ) : (
              <span className="text-muted-foreground">No file selected</span>
            )}
          </span>
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
          {filePath && (
            <div className="gb-sync">
              <span className={`gb-sync-state ${dirty ? "gb-sync-dirty" : ""}`}>
                {dirty ? (
                  "Unsaved changes"
                ) : (
                  <>
                    <Check className="size-3.5" /> Synced
                  </>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!dirty || !!syncing}
                onClick={() => openSyncPanel("pr")}
              >
                {syncing === "pr" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <GitPullRequest className="size-3.5" />
                )}
                Open PR
              </Button>
              <Button size="sm" disabled={!dirty || !!syncing} onClick={() => openSyncPanel("main")}>
                {syncing === "main" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <GitBranch className="size-3.5" />
                )}
                Commit to {tree.data?.branch ?? "main"}
              </Button>
            </div>
          )}
        </header>

        {pendingMode && (
          <div className="gb-commit-panel">
            <Input
              autoFocus
              className="gb-commit-message"
              value={commitMessage}
              placeholder={pendingMode === "pr" ? "Pull request title" : "Commit message"}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sync(pendingMode, commitMessage)
                if (e.key === "Escape") setPendingMode(null)
              }}
            />
            <Button size="sm" disabled={!commitMessage} onClick={() => sync(pendingMode, commitMessage)}>
              {pendingMode === "pr" ? "Create pull request" : `Commit to ${tree.data?.branch ?? "main"}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingMode(null)}>
              Cancel
            </Button>
          </div>
        )}

        <div className="gb-content">
          {!repo ? (
            <div className="gb-empty">Select a repository to browse its markdown files.</div>
          ) : !filePath ? (
            <div className="gb-empty">Select a markdown file from the tree.</div>
          ) : file.isLoading ? (
            <div className="gb-empty">Loading {filePath}…</div>
          ) : file.isError ? (
            <div className="gb-empty">Failed to load file: {String(file.error)}</div>
          ) : view === "edit" ? (
            <GitbookEditor
              key={`${repo}:${filePath}`}
              markdown={markdown}
              onChange={handleChange}
            />
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
