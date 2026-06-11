import { useEffect, useState } from "react"
import { parse as parseYaml } from "yaml"

import { MarkdownContent } from "@/docs/DocsRenderer"

/* eslint-disable @typescript-eslint/no-explicit-any */

const specCache = new Map<string, Promise<any>>()

function loadSpec(url: string): Promise<any> {
  if (!specCache.has(url)) {
    specCache.set(
      url,
      fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`Failed to load spec (${r.status})`)
          return r.text()
        })
        .then((text) => (text.trimStart().startsWith("{") ? JSON.parse(text) : parseYaml(text)))
    )
  }
  return specCache.get(url)!
}

function resolveRef(spec: any, node: any): any {
  if (node && typeof node === "object" && typeof node.$ref === "string") {
    const parts = node.$ref.replace(/^#\//, "").split("/")
    let cur = spec
    for (const p of parts) cur = cur?.[p]
    return resolveRef(spec, cur)
  }
  return node
}

function exampleFromSchema(spec: any, schema: any, depth = 0): any {
  schema = resolveRef(spec, schema)
  if (!schema || depth > 4) return null
  if (schema.example !== undefined) return schema.example
  if (schema.type === "array") return [exampleFromSchema(spec, schema.items, depth + 1)]
  if (schema.type === "object" || schema.properties) {
    const obj: Record<string, any> = {}
    for (const [k, v] of Object.entries<any>(schema.properties ?? {})) {
      obj[k] = exampleFromSchema(spec, v, depth + 1)
    }
    return obj
  }
  if (schema.enum?.length) return schema.enum[0]
  switch (schema.type) {
    case "integer":
    case "number":
      return 1
    case "boolean":
      return true
    default:
      return "string"
  }
}

function SchemaFields({ spec, schema }: { spec: any; schema: any }) {
  schema = resolveRef(spec, schema)
  if (schema?.type === "array") schema = resolveRef(spec, schema.items)
  const props = Object.entries<any>(schema?.properties ?? {})
  if (!props.length) return null
  const required: string[] = schema.required ?? []
  return (
    <div className="oas-fields">
      {props.map(([name, raw]) => {
        const p = resolveRef(spec, raw)
        return (
          <div key={name} className="oas-field">
            <div>
              <code className="oas-field-name">{name}</code>{" "}
              <span className="oas-field-type">
                {p.type ?? "object"}
                {p.format ? ` · ${p.format}` : ""}
              </span>{" "}
              <span className={required.includes(name) ? "oas-required" : "oas-optional"}>
                {required.includes(name) ? "required" : "optional"}
              </span>
            </div>
            {p.description && <p className="oas-field-desc">{p.description}</p>}
          </div>
        )
      })}
    </div>
  )
}

export function OpenApiOperation({
  specUrl,
  path,
  method,
}: {
  specUrl: string
  path: string
  method: string
}) {
  const [spec, setSpec] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!specUrl) return
    setSpec(null)
    setError(null)
    loadSpec(specUrl)
      .then(setSpec)
      .catch((e) => setError(String(e.message ?? e)))
  }, [specUrl])

  if (!specUrl) return <div className="oas oas-empty">Set an OpenAPI spec URL…</div>
  if (error) return <div className="oas oas-empty">⚠︎ {error}</div>
  if (!spec) return <div className="oas oas-empty">Loading OpenAPI spec…</div>

  const op = spec.paths?.[path]?.[method.toLowerCase()]
  if (!op) {
    return (
      <div className="oas oas-empty">
        Operation {method.toUpperCase()} {path} not found in spec.
      </div>
    )
  }

  const server = spec.servers?.[0]?.url ?? ""
  const security: any[] = op.security ?? spec.security ?? []
  const schemes = Object.entries<any>(spec.components?.securitySchemes ?? {}).filter(([name]) =>
    security.some((s) => name in s)
  )
  const responses = Object.entries<any>(op.responses ?? {})
  const okResponse = responses.find(([code]) => code.startsWith("2"))?.[1]
  const okSchema = okResponse?.content?.["application/json"]?.schema
  const example = okSchema ? exampleFromSchema(spec, okSchema) : null

  const curl = [
    `curl -L ${server}${path} \\`,
    ...(schemes.length ? [`  -H 'Authorization: Bearer YOUR_API_KEY'`] : []),
  ].join("\n")

  return (
    <div className="oas">
      <h3 className="oas-title">{op.summary ?? `${method.toUpperCase()} ${path}`}</h3>
      <div className="oas-endpoint">
        <span className={`oas-method oas-method-${method.toLowerCase()}`}>
          {method.toUpperCase()}
        </span>
        {server && <span className="oas-server">{server}</span>}
        <code className="oas-path">{path}</code>
      </div>
      {op.description && (
        <div className="oas-desc">
          <MarkdownContent markdown={op.description} />
        </div>
      )}

      {schemes.length > 0 && (
        <section className="oas-section">
          <h4>Authorizations</h4>
          {schemes.map(([name, s]) => (
            <div key={name} className="oas-field">
              <div>
                <code className="oas-field-name">{s.name ?? "Authorization"}</code>{" "}
                <span className="oas-field-type">{s.type}</span>{" "}
                <span className="oas-required">required</span>
              </div>
              {s.description && <p className="oas-field-desc">{s.description}</p>}
            </div>
          ))}
        </section>
      )}

      {(op.parameters?.length ?? 0) > 0 && (
        <section className="oas-section">
          <h4>Parameters</h4>
          {op.parameters.map((raw: any, i: number) => {
            const p = resolveRef(spec, raw)
            return (
              <div key={i} className="oas-field">
                <div>
                  <code className="oas-field-name">{p.name}</code>{" "}
                  <span className="oas-field-type">
                    {p.schema?.type ?? "string"} · {p.in}
                  </span>{" "}
                  <span className={p.required ? "oas-required" : "oas-optional"}>
                    {p.required ? "required" : "optional"}
                  </span>
                </div>
                {p.description && <p className="oas-field-desc">{p.description}</p>}
              </div>
            )
          })}
        </section>
      )}

      <section className="oas-section">
        <h4>Responses</h4>
        {responses.map(([code, raw]) => {
          const r = resolveRef(spec, raw)
          const schema = r.content?.["application/json"]?.schema
          return (
            <details key={code} className="oas-response" open={code.startsWith("2")}>
              <summary>
                <span className={`oas-code oas-code-${code[0]}`}>{code}</span>
                <span>{r.description}</span>
              </summary>
              {schema && <SchemaFields spec={spec} schema={schema} />}
            </details>
          )
        })}
      </section>

      <section className="oas-section oas-samples">
        <div className="oas-sample">
          <div className="oas-sample-head">
            <span className={`oas-method oas-method-${method.toLowerCase()}`}>
              {method.toUpperCase()}
            </span>
            <code>{path}</code>
            <span className="oas-sample-label">cURL</span>
          </div>
          <pre>{curl}</pre>
        </div>
        {example !== null && (
          <div className="oas-sample">
            <div className="oas-sample-head">
              <span className="oas-code oas-code-2">200</span>
              <span>{okResponse?.description}</span>
            </div>
            <pre>{JSON.stringify(example, null, 2)}</pre>
          </div>
        )}
      </section>
    </div>
  )
}
