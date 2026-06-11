import { useEffect, useRef, useState } from "react"

let seq = 0

export function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`mermaid-${++seq}`)

  useEffect(() => {
    let cancelled = false
    import("mermaid")
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict" })
        const { svg } = await mermaid.render(idRef.current, code)
        if (!cancelled) setSvg(svg)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
    return () => {
      cancelled = true
    }
  }, [code])

  if (error) {
    return (
      <pre className="docs-mermaid-error">
        mermaid error: {error}
        {"\n"}
        {code}
      </pre>
    )
  }
  if (!svg) return <div className="docs-mermaid">Rendering diagram…</div>
  return <div className="docs-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}
