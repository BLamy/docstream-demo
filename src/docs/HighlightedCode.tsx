import { useMemo } from "react"
import { common, createLowlight } from "lowlight"
import { toHtml } from "hast-util-to-html"

const lowlight = createLowlight(common)

export function HighlightedCode({ code, language }: { code: string; language: string | null }) {
  const html = useMemo(() => {
    if (language && lowlight.registered(language)) {
      try {
        return toHtml(lowlight.highlight(language, code))
      } catch {
        /* fall through to plain */
      }
    }
    return null
  }, [code, language])

  if (html === null) return <code>{code}</code>
  return <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
}
