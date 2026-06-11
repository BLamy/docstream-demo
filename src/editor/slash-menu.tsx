import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Extension, type Editor, type Range } from "@tiptap/core"
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion"
import { ReactRenderer } from "@tiptap/react"
import {
  Columns2,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTodo,
  Megaphone,
  Minus,
  MonitorPlay,
  PanelTop,
  Quote,
  Sigma,
  SquareChevronDown,
  Table as TableIcon,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react"

import type { PMNode } from "./convert"

const para = (text = ""): PMNode =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" }

interface SlashItem {
  title: string
  keywords: string
  icon: LucideIcon
  run: (editor: Editor) => void
}

const insertBlock = (content: PMNode) => (editor: Editor) =>
  editor.chain().focus().insertContent(content).run()

export const SLASH_ITEMS: SlashItem[] = [
  { title: "Heading 1", keywords: "h1 title", icon: Heading1, run: (e) => e.chain().focus().setHeading({ level: 1 }).run() },
  { title: "Heading 2", keywords: "h2 section", icon: Heading2, run: (e) => e.chain().focus().setHeading({ level: 2 }).run() },
  { title: "Heading 3", keywords: "h3 subsection", icon: Heading3, run: (e) => e.chain().focus().setHeading({ level: 3 }).run() },
  { title: "Bullet list", keywords: "ul unordered", icon: List, run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered list", keywords: "ol ordered", icon: ListOrdered, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Task list", keywords: "todo checkbox", icon: ListTodo, run: (e) => e.chain().focus().toggleList("taskList", "taskItem").run() },
  { title: "Quote", keywords: "blockquote", icon: Quote, run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Divider", keywords: "hr rule separator", icon: Minus, run: (e) => e.chain().focus().setHorizontalRule().run() },
  { title: "Code block", keywords: "snippet pre", icon: FileCode2, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  {
    title: "Hint",
    keywords: "callout info warning danger success admonition",
    icon: Lightbulb,
    run: insertBlock({ type: "gbHint", attrs: { style: "info" }, content: [para()] }),
  },
  {
    title: "Tabs",
    keywords: "tabbed switcher",
    icon: PanelTop,
    run: insertBlock({
      type: "gbTabs",
      content: [
        { type: "gbTab", attrs: { title: "First tab" }, content: [para()] },
        { type: "gbTab", attrs: { title: "Second tab" }, content: [para()] },
      ],
    }),
  },
  {
    title: "Expandable",
    keywords: "details accordion collapse",
    icon: SquareChevronDown,
    run: insertBlock({ type: "gbExpandable", attrs: { summary: "Click to expand" }, content: [para()] }),
  },
  {
    title: "Stepper",
    keywords: "steps guide step-by-step",
    icon: ListChecks,
    run: insertBlock({
      type: "gbStepper",
      content: [
        { type: "gbStep", attrs: { title: "First step" }, content: [para()] },
        { type: "gbStep", attrs: { title: "Second step" }, content: [para()] },
      ],
    }),
  },
  {
    title: "Embed",
    keywords: "youtube video iframe url",
    icon: MonitorPlay,
    run: insertBlock({ type: "gbEmbed", attrs: { url: "" } }),
  },
  {
    title: "Page link",
    keywords: "content-ref reference",
    icon: Link2,
    run: insertBlock({ type: "gbContentRef", attrs: { url: "", label: "Page link" } }),
  },
  {
    title: "Columns",
    keywords: "two column layout",
    icon: Columns2,
    run: insertBlock({
      type: "gbColumns",
      content: [
        { type: "gbColumn", content: [para()] },
        { type: "gbColumn", content: [para()] },
      ],
    }),
  },
  {
    title: "Image",
    keywords: "figure picture photo",
    icon: Image,
    run: insertBlock({ type: "gbFigure", attrs: { src: "", alt: "", caption: "" } }),
  },
  {
    title: "Math",
    keywords: "tex latex formula equation",
    icon: Sigma,
    run: insertBlock({ type: "gbMath", attrs: { formula: "e = mc^2" } }),
  },
  {
    title: "Table",
    keywords: "grid cells",
    icon: TableIcon,
    run: (e) => e.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(),
  },
  {
    title: "Updates",
    keywords: "changelog release notes",
    icon: Megaphone,
    run: insertBlock({
      type: "gbUpdates",
      attrs: { format: "full" },
      content: [
        {
          type: "gbUpdate",
          attrs: { date: new Date().toISOString().slice(0, 10) },
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "What changed" }] },
            para(),
          ],
        },
      ],
    }),
  },
  {
    title: "OpenAPI operation",
    keywords: "api swagger endpoint rest",
    icon: Webhook,
    run: insertBlock({
      type: "gbOpenapi",
      attrs: { spec: "", path: "/", method: "get", specUrl: "", label: "" },
    }),
  },
  {
    title: "Mermaid diagram",
    keywords: "chart graph flowchart",
    icon: Workflow,
    run: insertBlock({
      type: "codeBlock",
      attrs: { language: "mermaid", title: null, lineNumbers: false },
      content: [{ type: "text", text: "graph TD\n  A --> B" }],
    }),
  },
]

interface MenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
  clientRect: (() => DOMRect | null) | null
}

interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const SlashMenuView = forwardRef<MenuHandle, MenuProps>(function SlashMenuView(
  { items, command, clientRect },
  ref
) {
  const [index, setIndex] = useState(0)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => setIndex(0), [items])

  // Keep the active item visible while arrowing through a long list.
  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({ block: "nearest" })
  }, [index])

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (event.key === "ArrowDown") {
        setIndex((i) => (i + 1) % Math.max(items.length, 1))
        return true
      }
      if (event.key === "ArrowUp") {
        setIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1))
        return true
      }
      if (event.key === "Enter") {
        if (items[index]) command(items[index])
        return true
      }
      return false
    },
  }))

  const rect = clientRect?.()
  if (!rect) return null

  const style: React.CSSProperties = {
    position: "fixed",
    left: rect.left,
    top: rect.bottom + 6,
  }

  return (
    <div className="slash-menu" style={style}>
      {items.length === 0 && <div className="slash-empty">No matching blocks</div>}
      {items.map((item, i) => (
        <button
          key={item.title}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          className={`slash-item ${i === index ? "slash-item-active" : ""}`}
          onMouseEnter={() => setIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            command(item)
          }}
        >
          <item.icon className="size-4" />
          <span>{item.title}</span>
        </button>
      ))}
    </div>
  )
})

export const SlashMenu = Extension.create({
  name: "slashMenu",
  addProseMirrorPlugins() {
    let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        items: ({ query }) =>
          SLASH_ITEMS.filter((item) =>
            `${item.title} ${item.keywords}`.toLowerCase().includes(query.toLowerCase())
          ),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range as Range).run()
          props.run(editor as Editor)
        },
        render: () => ({
          onStart: (props: SuggestionProps<SlashItem>) => {
            renderer = new ReactRenderer(SlashMenuView, {
              editor: props.editor,
              props: {
                items: props.items,
                command: props.command,
                clientRect: props.clientRect ?? null,
              },
            })
            document.body.appendChild(renderer.element)
          },
          onUpdate: (props: SuggestionProps<SlashItem>) => {
            renderer?.updateProps({
              items: props.items,
              command: props.command,
              clientRect: props.clientRect ?? null,
            })
          },
          onKeyDown: ({ event }) => {
            if (event.key === "Escape") {
              renderer?.destroy()
              renderer?.element.remove()
              renderer = null
              return true
            }
            return renderer?.ref?.onKeyDown(event) ?? false
          },
          onExit: () => {
            renderer?.element.remove()
            renderer?.destroy()
            renderer = null
          },
        }),
      }),
    ]
  },
})
