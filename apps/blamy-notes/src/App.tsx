import { useCallback, useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Book,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  GitPullRequest,
  Globe,
  Loader2,
  Lock,
  LogOut,
  PenLine,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { GitbookEditor } from "@brett_lamy/docstream-editor"
import { DocsRenderer, parseMarkdown, setAssetBase } from "@brett_lamy/docstream"
import { api, type PublicRepoSource } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import DocsSite from "@/docs/DocsSite"

type View = "edit" | "preview" | "markdown"

interface PublicGithubPreview {
  owner: string
  name: string
  repo: string
  source: PublicRepoSource
}

function isPublicGithubRoute(pathname: string) {
  return pathname === "/github.com" || pathname.startsWith("/github.com/")
}

function isDocsRoute(pathname: string) {
  return pathname === "/docs" || pathname.startsWith("/docs/")
}

function decodePathPart(part: string) {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

function parsePublicGithubPreview(pathname: string): PublicGithubPreview | null {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[0] !== "github.com" || parts.length < 3) return null

  const owner = decodePathPart(parts[1])
  const name = decodePathPart(parts[2])
  if (!owner || !name) return null

  if (parts.length === 3) {
    return { owner, name, repo: `${owner}/${name}`, source: { type: "default" } }
  }

  if (parts[3] === "pull" && parts.length === 5) {
    const number = Number(decodePathPart(parts[4]))
    if (!Number.isInteger(number) || number < 1) return null
    return { owner, name, repo: `${owner}/${name}`, source: { type: "pull", number } }
  }

  if (parts[3] === "tree" && parts.length > 4) {
    const branch = parts.slice(4).map(decodePathPart).join("/")
    if (!branch) return null
    return { owner, name, repo: `${owner}/${name}`, source: { type: "branch", branch } }
  }

  return null
}

function preferredMarkdownFile(files: string[]) {
  const byLower = new Map(files.map((path) => [path.toLowerCase(), path]))
  for (const candidate of ["readme.md", "docs/readme.md", "summary.md"]) {
    const match = byLower.get(candidate)
    if (match) return match
  }
  return files.find((path) => !path.includes("/")) ?? files[0] ?? null
}

function publicSourceLabel(preview: PublicGithubPreview) {
  if (preview.source.type === "pull") return `PR #${preview.source.number}`
  if (preview.source.type === "branch") return preview.source.branch
  return "default branch"
}

function githubUrlForPreview(preview: PublicGithubPreview) {
  const base = `https://github.com/${preview.repo}`
  if (preview.source.type === "pull") return `${base}/pull/${preview.source.number}`
  if (preview.source.type === "branch") {
    const branchPath = preview.source.branch.split("/").map(encodeURIComponent).join("/")
    return `${base}/tree/${branchPath}`
  }
  return base
}

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
  if (isDocsRoute(window.location.pathname)) {
    return <DocsSite />
  }
  return <NotesApp />
}

function NotesApp() {
  const publicRouteRequested = isPublicGithubRoute(window.location.pathname)
  const publicPreview = useMemo(
    () => parsePublicGithubPreview(window.location.pathname),
    []
  )
  const queryClient = useQueryClient()
  const [repo, setRepo] = useState<string | null>(() => publicPreview?.repo ?? null)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [view, setView] = useState<View>(() => (publicPreview ? "preview" : "edit"))
  const [owner, setOwner] = useState<string | null>(null)
  const [ownerMenuOpen, setOwnerMenuOpen] = useState(false)
  const [search, setSearch] = useState("")
  const shouldLoadUserRepos = !publicRouteRequested

  // Repos come from the logged-in user's own GitHub identity (Auth0 Token
  // Vault exchanges the session's refresh token for their GitHub token).
  const reposQuery = useQuery({
    queryKey: ["repos"],
    queryFn: api.githubRepos,
    enabled: shouldLoadUserRepos,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: api.githubProfile,
    enabled: shouldLoadUserRepos,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const allRepos = useMemo(() => reposQuery.data ?? [], [reposQuery.data])
  const githubNotConnected =
    shouldLoadUserRepos &&
    reposQuery.isError &&
    String(reposQuery.error).includes("github_not_connected")

  // Plan + published repos (the SaaS surface).
  const billing = useQuery({
    queryKey: ["billing"],
    queryFn: api.billing,
    enabled: shouldLoadUserRepos,
    staleTime: 60_000,
    retry: false,
  })
  const shares = useQuery({
    queryKey: ["shares"],
    queryFn: api.shares,
    enabled: shouldLoadUserRepos,
    staleTime: 60_000,
    retry: false,
  })
  const plan = billing.data?.plan ?? "free"
  const proPriceLabel = billing.data?.proPrice
    ? `$${(billing.data.proPrice.unitAmount / 100).toFixed(0)}`
    : null

  // Landing back from Stripe Checkout: verify the session server-side, then
  // drop the marker URL.
  useEffect(() => {
    if (window.location.pathname !== "/billing/success") return
    const sessionId = new URLSearchParams(window.location.search).get("session_id")
    window.history.replaceState({}, "", "/")
    if (!sessionId) return
    api
      .billingConfirm(sessionId)
      .then((res) => {
        if (res.plan === "pro") {
          toast.success("Welcome to Pro! Publishing is now unlocked.")
        } else {
          toast.error(`Payment not completed (status: ${res.paymentStatus})`)
        }
        queryClient.invalidateQueries({ queryKey: ["billing"] })
      })
      .catch((e) => toast.error(String(e instanceof Error ? e.message : e)))
  }, [queryClient])

  const [upgrading, setUpgrading] = useState(false)
  const upgrade = async () => {
    setUpgrading(true)
    try {
      const { url } = await api.billingCheckout()
      window.location.assign(url)
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
      setUpgrading(false)
    }
  }

  // Owner switcher: the user plus their orgs (plus any other owners that
  // appear among accessible repos, e.g. collaborator repos).
  const owners = useMemo(() => {
    const known = new Map<string, string>() // login -> avatar
    if (profile.data) {
      known.set(profile.data.user.login, profile.data.user.avatar)
      for (const o of profile.data.orgs) known.set(o.login, o.avatar)
    }
    for (const r of allRepos) {
      const o = r.full_name.split("/")[0]
      if (!known.has(o)) known.set(o, `https://github.com/${o}.png?size=48`)
    }
    return [...known.entries()].map(([login, avatar]) => ({ login, avatar }))
  }, [profile.data, allRepos])

  // Default to the personal account once known.
  useEffect(() => {
    if (shouldLoadUserRepos && !owner && profile.data) setOwner(profile.data.user.login)
  }, [owner, profile.data, shouldLoadUserRepos])

  const activeOwner = owners.find((o) => o.login === owner) ?? owners[0] ?? null

  // No query: show the active owner's repos. With a query: search EVERY repo
  // the user can access, across all owners.
  const searching = search.trim().length > 0
  const repos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q) return allRepos.filter((r) => r.full_name.toLowerCase().includes(q))
    return allRepos.filter(
      (r) => !activeOwner || r.full_name.split("/")[0] === activeOwner.login
    )
  }, [allRepos, activeOwner, search])

  // Publish state for the selected repo.
  const selectedRepoInfo = allRepos.find((r) => r.full_name === repo) ?? null
  const activeShare = shares.data?.shares.find((s) => s.repo === repo) ?? null
  const [sharePanelOpen, setSharePanelOpen] = useState(false)
  const [shareBusy, setShareBusy] = useState(false)
  const publicShareUrl = repo ? `${window.location.origin}/github.com/${repo}` : ""

  const publish = async () => {
    if (!repo) return
    setShareBusy(true)
    try {
      await api.createShare(repo)
      await queryClient.invalidateQueries({ queryKey: ["shares"] })
      toast.success("Published! Anyone with the link can read these docs.", {
        action: {
          label: "Copy link",
          onClick: () => navigator.clipboard.writeText(publicShareUrl),
        },
      })
    } catch (e) {
      const message = String(e instanceof Error ? e.message : e)
      if (message.includes("pro_plan_required")) {
        toast.error("Publishing requires the Pro plan.")
      } else {
        toast.error(message)
      }
    } finally {
      setShareBusy(false)
    }
  }

  const unpublish = async () => {
    if (!activeShare) return
    setShareBusy(true)
    try {
      await api.deleteShare(activeShare.id)
      await queryClient.invalidateQueries({ queryKey: ["shares"] })
      toast.success("Unpublished. The public link no longer works.")
    } catch (e) {
      toast.error(String(e instanceof Error ? e.message : e))
    } finally {
      setShareBusy(false)
    }
  }

  const tree = useQuery({
    queryKey: ["tree", repo, publicPreview?.source],
    queryFn: () =>
      publicPreview
        ? api.publicRepoTree(repo!, publicPreview.source)
        : api.repoTree(repo!),
    enabled: !!repo,
    staleTime: 60_000,
  })

  const file = useQuery({
    queryKey: ["file", repo, filePath, publicPreview?.source],
    queryFn: () =>
      publicPreview
        ? api.publicRepoFile(repo!, filePath!, publicPreview.source)
        : api.repoFile(repo!, filePath!),
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

  useEffect(() => {
    if (!publicPreview || filePath || !tree.data) return
    const nextPath = preferredMarkdownFile(tree.data.files)
    if (nextPath) setFilePath(nextPath)
  }, [filePath, publicPreview, tree.data])

  // Relative image srcs in the file resolve against the repo's raw URL.
  useEffect(() => {
    setAssetBase(
      tree.data?.assetRepo ?? repo,
      tree.data?.ref ?? tree.data?.branch ?? null,
      filePath
    )
  }, [repo, tree.data?.assetRepo, tree.data?.branch, tree.data?.ref, filePath])

  const handleChange = useCallback((md: string) => {
    if (publicPreview) return
    setMarkdown(md)
    setDirty(true)
  }, [publicPreview])

  const selectRepo = (r: string) => {
    if (publicPreview) return
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
    if (publicPreview) return
    setCommitMessage(`docs: update ${filePath}`)
    setPendingMode(mode)
  }

  const sync = async (mode: "main" | "pr", message: string) => {
    if (publicPreview || !repo || !filePath || !file.data || !message) return
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

  const viewTabs = publicPreview
    ? ([
        ["preview", Eye, "Preview"],
        ["markdown", FileText, "Markdown"],
      ] as const)
    : ([
        ["edit", PenLine, "Editor"],
        ["preview", Eye, "Preview"],
        ["markdown", FileText, "Markdown"],
      ] as const)

  if (publicRouteRequested && !publicPreview) {
    return (
      <div className="gb-route-error">
        <Book className="size-6" />
        <div>
          <h1>Invalid GitHub preview URL</h1>
          <p>Use /github.com/:owner/:repo, /pull/:number, or /tree/:branch.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="gb-app">
      <aside className="gb-sidebar">
        <div className="gb-sidebar-head">
          {publicPreview ? (
            <div className="gb-public-title">
              <Book className="size-5 shrink-0" />
              <span className="font-semibold truncate">{publicPreview.repo}</span>
              <span className="gb-readonly-badge">read-only</span>
            </div>
          ) : activeOwner ? (
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

        {!publicPreview && (
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
        )}

        <div className="gb-sidebar-scroll">
          <div className="gb-section-label">
            {publicPreview ? "Markdown files" : "Repositories"}
          </div>
          {!publicPreview && reposQuery.isLoading && (
            <div className="gb-sidebar-note">Loading repositories…</div>
          )}
          {!publicPreview && githubNotConnected && (
            <div className="gb-sidebar-note">
              This login isn't connected to GitHub. Log out and sign in with{" "}
              <strong>Continue with GitHub</strong> to see your repositories.
            </div>
          )}
          {!publicPreview && reposQuery.isError && !githubNotConnected && (
            <div className="gb-sidebar-note">
              Failed to load repositories: {String(reposQuery.error)}
            </div>
          )}
          {!publicPreview && reposQuery.data && repos.length === 0 && (
            <div className="gb-sidebar-note">
              {search
                ? `No repositories match “${search}”.`
                : `No repositories in ${activeOwner?.login ?? "this org"}.`}
            </div>
          )}
          {publicPreview ? (
            <div>
              <div className="repo-item repo-item-active gb-public-repo">
                {publicPreview.source.type === "pull" ? (
                  <GitPullRequest className="size-3.5 shrink-0" />
                ) : (
                  <GitBranch className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{publicPreview.name}</span>
                <span className="repo-owner truncate">
                  {tree.data?.branch ?? publicSourceLabel(publicPreview)}
                </span>
              </div>
              <div className="repo-tree">
                {tree.isLoading && <div className="gb-sidebar-note">Loading files…</div>}
                {tree.isError && (
                  <div className="gb-sidebar-note">Failed to load files: {String(tree.error)}</div>
                )}
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
            </div>
          ) : repos.map((r) => {
            const [repoOwner, name] = r.full_name.split("/")
            const active = r.full_name === repo
            const foreign = searching && repoOwner !== activeOwner?.login
            const published = shares.data?.shares.some((s) => s.repo === r.full_name)
            return (
              <div key={r.full_name}>
                <button
                  className={`repo-item ${active ? "repo-item-active" : ""}`}
                  onClick={() => selectRepo(r.full_name)}
                >
                  {active ? (
                    <ChevronDown className="size-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0" />
                  )}
                  <GitBranch className="size-3.5 shrink-0" />
                  <span className="truncate">{name}</span>
                  {r.private && (
                    <Lock className="gb-repo-visibility size-3" aria-label="Private repository" />
                  )}
                  {published && <span className="gb-published-dot" title="Published" />}
                  {foreign && <span className="repo-owner">{repoOwner}</span>}
                </button>
                {active && (
                  <div className="repo-tree">
                    {tree.isLoading && <div className="gb-sidebar-note">Loading files…</div>}
                    {tree.isError && (
                      <div className="gb-sidebar-note">
                        Failed to load files: {String(tree.error)}
                      </div>
                    )}
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
          {publicPreview ? (
            <a
              className="gb-sidebar-link"
              href={tree.data?.htmlUrl ?? githubUrlForPreview(publicPreview)}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-4" /> View on GitHub
            </a>
          ) : (
            <>
              <div className="gb-plan-row">
                <span
                  className={`gb-plan-badge ${plan === "pro" ? "gb-plan-badge-pro" : ""}`}
                  data-testid="plan-badge"
                >
                  {plan === "pro" ? "Pro" : "Free"}
                </span>
                {plan === "free" && (
                  <Button
                    className="gb-upgrade-btn"
                    size="sm"
                    variant="outline"
                    disabled={upgrading}
                    onClick={upgrade}
                  >
                    {upgrading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="size-3.5" />
                    )}
                    Upgrade{proPriceLabel ? ` · ${proPriceLabel}` : ""}
                  </Button>
                )}
              </div>
              <a className="gb-sidebar-link" href="/docs">
                <BookOpen className="size-4" /> Documentation
              </a>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="size-4" /> Log out
              </Button>
            </>
          )}
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
          {publicPreview && (
            <span className="gb-ref-pill">
              {tree.data?.branch ?? publicSourceLabel(publicPreview)}
            </span>
          )}
          <div className="gb-view-tabs">
            {viewTabs.map(([v, Icon, label]) => (
              <button
                key={v}
                className={`gb-view-tab ${view === v ? "gb-view-tab-active" : ""}`}
                onClick={() => setView(v)}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          {!publicPreview && repo && (
            <Button
              size="sm"
              variant={activeShare ? "outline" : "ghost"}
              onClick={() => setSharePanelOpen((o) => !o)}
              data-testid="publish-toggle"
            >
              <Globe className="size-3.5" />
              {activeShare ? "Public" : "Publish"}
            </Button>
          )}
          {!publicPreview && filePath && (
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

        {!publicPreview && sharePanelOpen && repo && (
          <div className="gb-share-panel" data-testid="share-panel">
            {activeShare ? (
              <>
                <div className="gb-share-copy">
                  <Globe className="size-3.5 shrink-0" />
                  <span>{publicShareUrl}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(publicShareUrl)
                    toast.success("Public link copied")
                  }}
                >
                  <Copy className="size-3.5" /> Copy link
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a href={publicShareUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-3.5" /> Open
                  </a>
                </Button>
                <Button size="sm" variant="ghost" disabled={shareBusy} onClick={unpublish}>
                  {shareBusy && <Loader2 className="size-3.5 animate-spin" />}
                  Unpublish
                </Button>
                <span className="gb-share-note">
                  Anyone with this link can read the rendered markdown in{" "}
                  <strong>{repo}</strong>
                  {selectedRepoInfo?.private ? " — including this private repo." : "."}
                </span>
              </>
            ) : plan === "pro" || !selectedRepoInfo?.private ? (
              <>
                <span className="gb-share-note">
                  Publish <strong>{repo}</strong> as a public, read-only docs site at{" "}
                  <code>{publicShareUrl}</code>
                  {selectedRepoInfo?.private &&
                    " — this repo is private; anyone with the link will be able to read its markdown."}
                </span>
                <Button size="sm" disabled={shareBusy} onClick={publish} data-testid="publish-confirm">
                  {shareBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Globe className="size-3.5" />
                  )}
                  Publish to the web
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSharePanelOpen(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <span className="gb-share-note">
                  <strong>{repo}</strong> is a private repository. Publishing private repos
                  as public docs sites is a <strong>Pro</strong> feature.
                </span>
                <Button size="sm" disabled={upgrading} onClick={upgrade} data-testid="paywall-upgrade">
                  {upgrading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Upgrade to Pro{proPriceLabel ? ` — ${proPriceLabel}` : ""}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSharePanelOpen(false)}>
                  Not now
                </Button>
              </>
            )}
          </div>
        )}

        {!publicPreview && pendingMode && (
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
          ) : publicPreview && tree.isLoading && !filePath ? (
            <div className="gb-empty">Loading markdown files…</div>
          ) : publicPreview && tree.isError && !filePath ? (
            <div className="gb-empty">Failed to load repository: {String(tree.error)}</div>
          ) : !filePath ? (
            <div className="gb-empty">Select a markdown file from the tree.</div>
          ) : file.isLoading ? (
            <div className="gb-empty">Loading {filePath}…</div>
          ) : file.isError ? (
            <div className="gb-empty">Failed to load file: {String(file.error)}</div>
          ) : !publicPreview && view === "edit" ? (
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
              readOnly={!!publicPreview}
              spellCheck={false}
            />
          )}
        </div>
      </main>
    </div>
  )
}
