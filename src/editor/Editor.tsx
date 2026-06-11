import { useEffect, useRef } from "react"
import { EditorContent, useEditor, type Editor as TiptapEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import {
  Bold,
  Code as CodeIcon,
  Italic,
  Link2,
  SlashSquare,
  Strikethrough,
} from "lucide-react"

import { parseMarkdown } from "@/gitbook/parse"
import { serializeMarkdown } from "@/gitbook/serialize"
import { astToTiptap, tiptapToAst, type PMNode } from "./convert"
import { GbCodeBlock, gitbookNodes } from "./nodes"
import { SlashMenu } from "./slash-menu"

interface Props {
  markdown: string
  onChange: (markdown: string) => void
}

// Carries GitBook's data-view (e.g. "cards") through the editor untouched.
const GbTable = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), view: { default: null } }
  },
})

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
      <span className="gb-toolbar-hint">
        <SlashSquare className="size-3.5" /> Type <kbd>/</kbd> for blocks
      </span>
    </div>
  )
}

export function GitbookEditor({ markdown, onChange }: Props) {
  // Tracks the markdown the editor itself produced, so external updates
  // (file switches) reset content but our own onChange echoes don't.
  const lastEmitted = useRef<string | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      GbCodeBlock,
      TaskList,
      TaskItem.configure({ nested: true }),
      GbTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: "Write, or type / to insert a block…" }),
      SlashMenu,
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
    lastEmitted.current = markdown
    editor.commands.setContent(astToTiptap(parseMarkdown(markdown)), { emitUpdate: false })
  }, [editor, markdown])

  if (!editor) return null

  return (
    <div className="gb-editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="gb-editor-content" />
    </div>
  )
}
