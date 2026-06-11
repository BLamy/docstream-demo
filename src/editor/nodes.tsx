import { Node, mergeAttributes } from "@tiptap/core"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { common, createLowlight } from "lowlight"
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Link2,
  Plus,
  X,
  XCircle,
} from "lucide-react"

import type { HintStyle } from "@/gitbook/ast"
import { OpenApiOperation } from "@/openapi/OpenApiOperation"
import { resolveAsset } from "@/lib/assets"

// ---------- Hint ----------

const HINT_META: Record<HintStyle, { icon: typeof Info; cls: string }> = {
  info: { icon: Info, cls: "gb-hint-info" },
  success: { icon: CheckCircle2, cls: "gb-hint-success" },
  warning: { icon: AlertTriangle, cls: "gb-hint-warning" },
  danger: { icon: XCircle, cls: "gb-hint-danger" },
}

function HintView({ node, updateAttributes, editor }: NodeViewProps) {
  const style = (node.attrs.style as HintStyle) ?? "info"
  const { icon: Icon, cls } = HINT_META[style] ?? HINT_META.info
  return (
    <NodeViewWrapper className={`gb-hint ${cls}`}>
      <div className="gb-hint-gutter" contentEditable={false}>
        <Icon className="size-4" />
        {editor.isEditable && (
          <select
            className="gb-hint-style"
            value={style}
            onChange={(e) => updateAttributes({ style: e.target.value })}
          >
            {Object.keys(HINT_META).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
      <NodeViewContent className="gb-hint-body" />
    </NodeViewWrapper>
  )
}

export const GbHint = Node.create({
  name: "gbHint",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { style: { default: "info" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-hint]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-hint": node.attrs.style }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(HintView)
  },
})

// ---------- Tabs ----------

function TabsView({ node, editor, getPos, updateAttributes }: NodeViewProps) {
  const active = Math.min(node.attrs.active ?? 0, node.childCount - 1)
  const titles: string[] = []
  node.forEach((child) => titles.push(child.attrs.title))

  const childPos = (index: number) => {
    let pos = getPos()! + 1
    for (let k = 0; k < index; k++) pos += node.child(k).nodeSize
    return pos
  }

  const renameTab = (index: number, title: string) => {
    editor.view.dispatch(
      editor.state.tr.setNodeAttribute(childPos(index), "title", title)
    )
  }

  const addTab = () => {
    const type = editor.schema.nodes.gbTab
    const tab = type.create({ title: `Tab ${node.childCount + 1}` }, [
      editor.schema.nodes.paragraph.create(),
    ])
    editor.view.dispatch(editor.state.tr.insert(childPos(node.childCount), tab))
    updateAttributes({ active: node.childCount })
  }

  const removeTab = (index: number) => {
    if (node.childCount <= 1) return
    const pos = childPos(index)
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.child(index).nodeSize))
    updateAttributes({ active: Math.max(0, active - (index <= active ? 1 : 0)) })
  }

  return (
    <NodeViewWrapper className="gb-tabs">
      <div className="gb-tabs-header" contentEditable={false}>
        {titles.map((t, idx) => (
          <div
            key={idx}
            className={`gb-tabs-tab ${idx === active ? "gb-tabs-tab-active" : ""}`}
            onClick={() => updateAttributes({ active: idx })}
          >
            {editor.isEditable && idx === active ? (
              <input
                className="gb-tabs-title-input"
                value={t}
                size={Math.max(t.length, 3)}
                onChange={(e) => renameTab(idx, e.target.value)}
              />
            ) : (
              <span>{t}</span>
            )}
            {editor.isEditable && titles.length > 1 && (
              <button className="gb-icon-btn" onClick={() => removeTab(idx)} title="Remove tab">
                <X className="size-3" />
              </button>
            )}
          </div>
        ))}
        {editor.isEditable && (
          <button className="gb-icon-btn" onClick={addTab} title="Add tab">
            <Plus className="size-3.5" />
          </button>
        )}
      </div>
      <NodeViewContent className="gb-tabs-content" data-active={active} />
    </NodeViewWrapper>
  )
}

export const GbTabs = Node.create({
  name: "gbTabs",
  group: "block",
  content: "gbTab+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { active: { default: 0, rendered: false } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-tabs]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-tabs": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(TabsView)
  },
})

export const GbTab = Node.create({
  name: "gbTab",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { title: { default: "Tab" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-tab]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-tab": node.attrs.title, class: "gb-tab" }), 0]
  },
})

// ---------- Expandable ----------

function ExpandableView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="gb-expandable">
      <div className="gb-expandable-summary" contentEditable={false}>
        <ChevronDown className="size-4" />
        {editor.isEditable ? (
          <input
            className="gb-inline-input"
            value={node.attrs.summary}
            placeholder="Expandable title…"
            onChange={(e) => updateAttributes({ summary: e.target.value })}
          />
        ) : (
          <span>{node.attrs.summary}</span>
        )}
      </div>
      <NodeViewContent className="gb-expandable-body" />
    </NodeViewWrapper>
  )
}

export const GbExpandable = Node.create({
  name: "gbExpandable",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { summary: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-expandable]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-expandable": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ExpandableView)
  },
})

// ---------- Stepper ----------

export const GbStepper = Node.create({
  name: "gbStepper",
  group: "block",
  content: "gbStep+",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-gb-stepper]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-stepper": "", class: "gb-stepper" }), 0]
  },
})

function StepView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  let index = 0
  try {
    const $pos = editor.state.doc.resolve(getPos()!)
    index = $pos.index($pos.depth)
  } catch {
    /* position can be momentarily stale during edits */
  }
  return (
    <NodeViewWrapper className="gb-step">
      <div className="gb-step-rail" contentEditable={false}>
        <div className="gb-step-badge">{index + 1}</div>
        <div className="gb-step-line" />
      </div>
      <div className="gb-step-main">
        <div contentEditable={false}>
          {editor.isEditable ? (
            <input
              className="gb-inline-input gb-step-title"
              value={node.attrs.title}
              placeholder="Step title…"
              onChange={(e) => updateAttributes({ title: e.target.value })}
            />
          ) : (
            <div className="gb-step-title">{node.attrs.title}</div>
          )}
        </div>
        <NodeViewContent className="gb-step-body" />
      </div>
    </NodeViewWrapper>
  )
}

export const GbStep = Node.create({
  name: "gbStep",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { title: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-step]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-step": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(StepView)
  },
})

// ---------- Embed ----------

function embedPreview(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  return null
}

function EmbedView({ node, updateAttributes, editor }: NodeViewProps) {
  const url = node.attrs.url as string
  const preview = embedPreview(url)
  return (
    <NodeViewWrapper className="gb-embed" contentEditable={false}>
      {preview ? (
        <iframe className="gb-embed-frame" src={preview} title={url} allowFullScreen />
      ) : (
        <a className="gb-embed-link" href={url} target="_blank" rel="noreferrer">
          <Link2 className="size-4" /> {url || "Embed URL…"}
        </a>
      )}
      {editor.isEditable && (
        <input
          className="gb-inline-input gb-embed-input"
          value={url}
          placeholder="https://…"
          onChange={(e) => updateAttributes({ url: e.target.value })}
        />
      )}
    </NodeViewWrapper>
  )
}

export const GbEmbed = Node.create({
  name: "gbEmbed",
  group: "block",
  atom: true,
  addAttributes() {
    return { url: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-embed]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-embed": node.attrs.url })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(EmbedView)
  },
})

// ---------- Content ref ----------

function ContentRefView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="gb-content-ref" contentEditable={false}>
      <Link2 className="size-4 shrink-0" />
      {editor.isEditable ? (
        <>
          <input
            className="gb-inline-input"
            value={node.attrs.label}
            placeholder="Label…"
            onChange={(e) => updateAttributes({ label: e.target.value })}
          />
          <input
            className="gb-inline-input gb-content-ref-url"
            value={node.attrs.url}
            placeholder="page.md or https://…"
            onChange={(e) => updateAttributes({ url: e.target.value })}
          />
        </>
      ) : (
        <span>
          {node.attrs.label} <span className="gb-content-ref-url">{node.attrs.url}</span>
        </span>
      )}
    </NodeViewWrapper>
  )
}

export const GbContentRef = Node.create({
  name: "gbContentRef",
  group: "block",
  atom: true,
  addAttributes() {
    return { url: { default: "" }, label: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-content-ref]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-content-ref": node.attrs.url })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(ContentRefView)
  },
})

// ---------- Columns ----------

export const GbColumns = Node.create({
  name: "gbColumns",
  group: "block",
  content: "gbColumn{2,}",
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-gb-columns]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-columns": "", class: "gb-columns" }), 0]
  },
})

export const GbColumn = Node.create({
  name: "gbColumn",
  content: "block+",
  defining: true,
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-gb-column]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-column": "", class: "gb-column" }), 0]
  },
})

// ---------- Figure ----------

function FigureView({ node, updateAttributes, editor }: NodeViewProps) {
  const { src, alt, caption } = node.attrs
  return (
    <NodeViewWrapper className="gb-figure" contentEditable={false}>
      {src ? (
        <img src={resolveAsset(src)} alt={alt} className="gb-figure-img" />
      ) : (
        <div className="gb-figure-placeholder">No image</div>
      )}
      {editor.isEditable ? (
        <div className="gb-figure-fields">
          <input
            className="gb-inline-input"
            value={src}
            placeholder="Image URL…"
            onChange={(e) => updateAttributes({ src: e.target.value })}
          />
          <input
            className="gb-inline-input"
            value={caption}
            placeholder="Caption…"
            onChange={(e) => updateAttributes({ caption: e.target.value })}
          />
        </div>
      ) : (
        caption && <figcaption className="gb-figure-caption">{caption}</figcaption>
      )}
    </NodeViewWrapper>
  )
}

export const GbFigure = Node.create({
  name: "gbFigure",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: "" }, alt: { default: "" }, caption: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-figure]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-figure": node.attrs.src })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FigureView)
  },
})

// ---------- Math ----------

function MathView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="gb-math" contentEditable={false}>
      <div className="gb-math-label">TeX</div>
      {editor.isEditable ? (
        <textarea
          className="gb-math-input"
          value={node.attrs.formula}
          rows={Math.max(1, String(node.attrs.formula).split("\n").length)}
          onChange={(e) => updateAttributes({ formula: e.target.value })}
        />
      ) : (
        <pre className="gb-math-formula">{node.attrs.formula}</pre>
      )}
    </NodeViewWrapper>
  )
}

export const GbMath = Node.create({
  name: "gbMath",
  group: "block",
  atom: true,
  addAttributes() {
    return { formula: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-math]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-math": "" }), node.attrs.formula]
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathView)
  },
})

// ---------- Code block with GitBook title/lineNumbers ----------

function CodeView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="gb-code">
      <div className="gb-code-header" contentEditable={false}>
        {editor.isEditable ? (
          <>
            <input
              className="gb-inline-input gb-code-title"
              value={node.attrs.title ?? ""}
              placeholder="Title (optional)"
              onChange={(e) => updateAttributes({ title: e.target.value || null })}
            />
            <input
              className="gb-inline-input gb-code-lang"
              value={node.attrs.language ?? ""}
              placeholder="lang"
              onChange={(e) => updateAttributes({ language: e.target.value || null })}
            />
            <label className="gb-code-linenos">
              <input
                type="checkbox"
                checked={!!node.attrs.lineNumbers}
                onChange={(e) => updateAttributes({ lineNumbers: e.target.checked })}
              />
              #
            </label>
          </>
        ) : (
          <>
            {node.attrs.title && <span className="gb-code-title">{node.attrs.title}</span>}
            {node.attrs.language && <span className="gb-code-lang">{node.attrs.language}</span>}
          </>
        )}
      </div>
      <pre className={node.attrs.lineNumbers ? "gb-code-numbered" : ""}>
        <NodeViewContent {...({ as: "code" } as object)} />
      </pre>
    </NodeViewWrapper>
  )
}

export const GbCodeBlock = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: { default: null },
      lineNumbers: { default: false },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeView)
  },
}).configure({ lowlight: createLowlight(common) })

// ---------- Inline image (GitHub badge style) ----------

function InlineImageView({ node }: NodeViewProps) {
  const { src, alt, width, height, link } = node.attrs
  const img = (
    <img
      src={resolveAsset(src)}
      alt={alt}
      className="gb-inline-img"
      style={{ width: width || undefined, height: height || undefined }}
    />
  )
  return (
    <NodeViewWrapper as="span" className="gb-inline-img-wrap" contentEditable={false}>
      {link ? <a href={link}>{img}</a> : img}
    </NodeViewWrapper>
  )
}

export const GbInlineImage = Node.create({
  name: "gbInlineImage",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      width: { default: "" },
      height: { default: "" },
      link: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: "img[data-gb-inline-img]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-gb-inline-img": "", src: node.attrs.src })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView)
  },
})

// ---------- Updates (changelog) ----------

export const GbUpdates = Node.create({
  name: "gbUpdates",
  group: "block",
  content: "gbUpdate+",
  defining: true,
  addAttributes() {
    return { format: { default: null } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-updates]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-updates": "", class: "gb-updates" }), 0]
  },
})

function UpdateView({ node, updateAttributes, editor }: NodeViewProps) {
  return (
    <NodeViewWrapper className="gb-update">
      <div className="gb-update-date" contentEditable={false}>
        {editor.isEditable ? (
          <input
            type="date"
            className="gb-inline-input"
            value={node.attrs.date}
            onChange={(e) => updateAttributes({ date: e.target.value })}
          />
        ) : (
          <span>{node.attrs.date}</span>
        )}
      </div>
      <NodeViewContent className="gb-update-body" />
    </NodeViewWrapper>
  )
}

export const GbUpdate = Node.create({
  name: "gbUpdate",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return { date: { default: "" } }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-update]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-update": node.attrs.date }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(UpdateView)
  },
})

// ---------- OpenAPI operation ----------

function OpenapiView({ node, updateAttributes, editor }: NodeViewProps) {
  const { spec, path, method, specUrl } = node.attrs
  return (
    <NodeViewWrapper className="gb-openapi" contentEditable={false}>
      {editor.isEditable && (
        <div className="gb-openapi-fields">
          <input
            className="gb-inline-input"
            value={spec}
            placeholder="spec name"
            onChange={(e) => updateAttributes({ spec: e.target.value })}
          />
          <input
            className="gb-inline-input"
            value={method}
            placeholder="get"
            onChange={(e) => updateAttributes({ method: e.target.value })}
          />
          <input
            className="gb-inline-input gb-openapi-path"
            value={path}
            placeholder="/path"
            onChange={(e) => updateAttributes({ path: e.target.value })}
          />
          <input
            className="gb-inline-input gb-openapi-url"
            value={specUrl}
            placeholder="https://…/openapi.yaml"
            onChange={(e) => updateAttributes({ specUrl: e.target.value })}
          />
        </div>
      )}
      <OpenApiOperation specUrl={specUrl} path={path} method={method || "get"} />
    </NodeViewWrapper>
  )
}

export const GbOpenapi = Node.create({
  name: "gbOpenapi",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      spec: { default: "" },
      path: { default: "" },
      method: { default: "get" },
      specUrl: { default: "" },
      label: { default: "" },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-gb-openapi]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-gb-openapi": node.attrs.path })]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OpenapiView)
  },
})

export const gitbookNodes = [
  GbHint,
  GbTabs,
  GbTab,
  GbExpandable,
  GbStepper,
  GbStep,
  GbEmbed,
  GbContentRef,
  GbColumns,
  GbColumn,
  GbFigure,
  GbMath,
  GbUpdates,
  GbUpdate,
  GbOpenapi,
  GbInlineImage,
]
