import { useEffect, useMemo, useState } from "react"
import { Moon, Palette, Pause, Play, RotateCcw, Sparkles, Sun } from "lucide-react"
import { GitbookStreamdown } from "@brett_lamy/docstream"

const SAMPLE = `# Weekly engineering summary

The renderer receives partial markdown safely while the model is still producing tokens.

## Active work

- [x] Move the GitBook parser into a reusable package
- [x] Keep the full TipTap editor separate from readonly rendering
- [ ] Add package-level tests around custom GitBook blocks

| Surface | Status | Notes |
| --- | --- | --- |
| Editor app | migrated | Uses the TipTap package |
| AI streams | ready | Uses the Streamdown extension package |

{% hint style="success" %}
GitBook export blocks can live in the same markdown stream as regular GFM.
{% endhint %}

{% tabs %}
{% tab title="npm" %}
\`\`\`bash
npm install
npm run dev
\`\`\`
{% endtab %}

{% tab title="pnpm" %}
\`\`\`bash
pnpm install
pnpm nx serve blamy-notes
\`\`\`
{% endtab %}
{% endtabs %}

\`\`\`ts
export function summarizeToken(token: string) {
  return token.trim().toLowerCase()
}
\`\`\`

{% openapi-operation spec="gitbook-petstore" path="/store/orders" method="get" %}
[OpenAPI gitbook-petstore](https://gitbookio.github.io/onboarding-template-images/gitbook-petstore.yaml)
{% endopenapi-operation %}

> The stream can pause mid-list, mid-table, or mid-code-fence without breaking the UI.
`

const CHUNK_SIZE = 18
const THEME_OPTIONS = [
  { id: "neutral", label: "Neutral", swatch: "oklch(0.45 0.02 250)" },
  { id: "supabase", label: "Supabase", swatch: "oklch(0.62 0.16 155)" },
  { id: "claude", label: "Claude", swatch: "oklch(0.66 0.16 55)" },
  { id: "amethyst", label: "Amethyst", swatch: "oklch(0.58 0.2 305)" },
] as const

type ThemeId = (typeof THEME_OPTIONS)[number]["id"]
type Appearance = "light" | "dark"

function storedTheme(): ThemeId {
  const stored = localStorage.getItem("streamdown-theme")
  return THEME_OPTIONS.some((theme) => theme.id === stored) ? (stored as ThemeId) : "neutral"
}

function storedAppearance(): Appearance {
  return localStorage.getItem("streamdown-appearance") === "dark" ? "dark" : "light"
}

export default function App() {
  const [source, setSource] = useState(SAMPLE)
  const [streamedLength, setStreamedLength] = useState(SAMPLE.length)
  const [streaming, setStreaming] = useState(false)
  const [theme, setTheme] = useState<ThemeId>(storedTheme)
  const [appearance, setAppearance] = useState<Appearance>(storedAppearance)

  const rendered = useMemo(() => source.slice(0, streamedLength), [source, streamedLength])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.classList.toggle("dark", appearance === "dark")
    root.style.colorScheme = appearance
    localStorage.setItem("streamdown-theme", theme)
    localStorage.setItem("streamdown-appearance", appearance)
  }, [appearance, theme])

  useEffect(() => {
    if (!streaming) return
    const timer = window.setInterval(() => {
      setStreamedLength((current) => {
        const next = Math.min(source.length, current + CHUNK_SIZE)
        if (next >= source.length) setStreaming(false)
        return next
      })
    }, 90)
    return () => window.clearInterval(timer)
  }, [source.length, streaming])

  const restart = () => {
    setStreamedLength(0)
    setStreaming(true)
  }

  const toggle = () => {
    if (streamedLength >= source.length) {
      restart()
      return
    }
    setStreaming((value) => !value)
  }

  return (
    <main className="stream-shell">
      <header className="stream-topbar">
        <div className="stream-brand">
          <Sparkles className="size-5" />
          <span>Streamdown Renderer</span>
        </div>
        <div className="stream-actions">
          <div className="stream-theme-switcher">
            <Palette className="size-4" />
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={theme === option.id ? "stream-theme-active" : ""}
                onClick={() => setTheme(option.id)}
                title={option.label}
              >
                <span className="stream-swatch" style={{ background: option.swatch }} />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <button
            className="stream-button stream-icon-button"
            onClick={() => setAppearance((value) => (value === "dark" ? "light" : "dark"))}
            title={appearance === "dark" ? "Light" : "Dark"}
          >
            {appearance === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button className="stream-button stream-button-primary" onClick={toggle}>
            {streaming ? <Pause className="size-4" /> : <Play className="size-4" />}
            {streaming ? "Pause" : streamedLength >= source.length ? "Replay" : "Resume"}
          </button>
          <button className="stream-button" onClick={restart}>
            <RotateCcw className="size-4" />
            Reset
          </button>
        </div>
      </header>

      <section className="stream-workspace">
        <div className="stream-pane stream-input">
          <div className="stream-pane-head">
            <span>Markdown</span>
            <span>{source.length} chars</span>
          </div>
          <textarea
            value={source}
            spellCheck={false}
            onChange={(event) => {
              const next = event.target.value
              setSource(next)
              setStreamedLength(next.length)
              setStreaming(false)
            }}
          />
        </div>

        <article className="stream-pane stream-output">
          <div className="stream-pane-head">
            <span>Readonly Stream</span>
            <span>{Math.round((rendered.length / Math.max(source.length, 1)) * 100)}%</span>
          </div>
          <div className="stream-renderer">
            <GitbookStreamdown markdown={rendered} isStreaming={streaming} />
          </div>
        </article>
      </section>
    </main>
  )
}
