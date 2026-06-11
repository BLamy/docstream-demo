import { useEffect, useRef } from "react"
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TableKit } from "@tiptap/extension-table"
import {
  Bold,
  Code as CodeIcon,
  Columns2,
  FileCode2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTodo,
  Minus,
  PanelTop,
  Quote,
  Sigma,
  SquareChevronDown,
  Strikethrough,
  Table as TableIcon,
  MonitorPlay,
} from "lucide-react"

import { parseMarkdown } from "@/gitbook/parse"
import { serializeMarkdown } from "@/gitbook/serialize"
import { astToTiptap, tiptapToAst, type PMNode } from "./convert"
import { GbCodeBlock, gitbookNodes } from "./nodes"

interface Props {
  markdown: string
  onChange: (markdown: string) => void
}

const para = (text = ""): PMNode =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" }

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      className={`gb-tool ${active ? "gb-tool-active" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }: { editor: TiptapEditor }) {
  const chain = () => editor.chain().focus()
  const insert = (content: PMNode) => chain().insertContent(content).run()

  return (
    <div className="gb-toolbar">
      <ToolbarButton title="Bold" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Strike" active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Inline code" active={editor.isActive("code")} onClick={() => chain().toggleCode().run()}>
        <CodeIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const url = window.prompt("URL")
          if (url) chain().setLink({ href: url }).run()
          else chain().unsetLink().run()
        }}
      >
        <Link2 className="size-4" />
      </ToolbarButton>

      <span className="gb-toolbar-sep" />

      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          title={`Heading ${level}`}
          active={editor.isActive("heading", { level })}
          onClick={() => chain().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
        >
          {level === 1 ? <Heading1 className="size-4" /> : level === 2 ? <Heading2 className="size-4" /> : <Heading3 className="size-4" />}
        </ToolbarButton>
      ))}
      <ToolbarButton title="Bullet list" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Ordered list" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Task list" active={editor.isActive("taskList")} onClick={() => chain().toggleList("taskList", "taskItem").run()}>
        <ListTodo className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Quote" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Divider" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </ToolbarButton>

      <span className="gb-toolbar-sep" />

      <ToolbarButton title="Hint" onClick={() => insert({ type: "gbHint", attrs: { style: "info" }, content: [para("Write a hint…")] })}>
        <Lightbulb className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Tabs"
        onClick={() =>
          insert({
            type: "gbTabs",
            content: [
              { type: "gbTab", attrs: { title: "First tab" }, content: [para()] },
              { type: "gbTab", attrs: { title: "Second tab" }, content: [para()] },
            ],
          })
        }
      >
        <PanelTop className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Expandable"
        onClick={() => insert({ type: "gbExpandable", attrs: { summary: "Click to expand" }, content: [para()] })}
      >
        <SquareChevronDown className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Stepper"
        onClick={() =>
          insert({
            type: "gbStepper",
            content: [
              { type: "gbStep", attrs: { title: "First step" }, content: [para()] },
              { type: "gbStep", attrs: { title: "Second step" }, content: [para()] },
            ],
          })
        }
      >
        <ListChecks className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Code block" onClick={() => chain().toggleCodeBlock().run()}>
        <FileCode2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Embed" onClick={() => insert({ type: "gbEmbed", attrs: { url: "" } })}>
        <MonitorPlay className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Page link (content-ref)" onClick={() => insert({ type: "gbContentRef", attrs: { url: "", label: "Page link" } })}>
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        title="Columns"
        onClick={() =>
          insert({
            type: "gbColumns",
            content: [
              { type: "gbColumn", content: [para()] },
              { type: "gbColumn", content: [para()] },
            ],
          })
        }
      >
        <Columns2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Image" onClick={() => insert({ type: "gbFigure", attrs: { src: "", alt: "", caption: "" } })}>
        <Image className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Math" onClick={() => insert({ type: "gbMath", attrs: { formula: "e = mc^2" } })}>
        <Sigma className="size-4" />
      </ToolbarButton>
      <ToolbarButton title="Table" onClick={() => chain().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()}>
        <TableIcon className="size-4" />
      </ToolbarButton>
    </div>
  )
}

export function GitbookEditor({ markdown, onChange }: Props) {
  // Tracks the markdown the editor itself produced, so external updates
  // (page switches) reset content but our own onChange echoes don't.
  const lastEmitted = useRef<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      GbCodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder: "Write, or insert a block from the toolbar…" }),
      ...gitbookNodes,
    ],
    content: astToTiptap(parseMarkdown(markdown)),
    onUpdate({ editor }) {
      const md = serializeMarkdown(tiptapToAst(editor.getJSON() as PMNode))
      lastEmitted.current = md
      onChange(md)
    },
  })

  useEffect(() => {
    if (!editor) return
    if (markdown === lastEmitted.current) return
    editor.commands.setContent(astToTiptap(parseMarkdown(markdown)))
  }, [editor, markdown])

  if (!editor) return null

  return (
    <div className="gb-editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="gb-editor-content" />
    </div>
  )
}
