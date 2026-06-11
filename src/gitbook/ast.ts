// AST for GitBook-flavored markdown. This is the single source of truth that
// the parser, serializer, TipTap converters, and docs renderer all share.

export type HintStyle = "info" | "success" | "warning" | "danger"

export interface TextNode {
  type: "text"
  text: string
  bold?: boolean
  italic?: boolean
  strike?: boolean
  code?: boolean
  link?: string
}

/** Inline HTML image, optionally wrapped in a link — GitHub README badge style. */
export interface InlineImageNode {
  type: "image"
  src: string
  alt?: string
  width?: string
  height?: string
  link?: string
}

export type Inline = TextNode | InlineImageNode

export interface ParagraphNode {
  type: "paragraph"
  children: Inline[]
}

export interface HeadingNode {
  type: "heading"
  level: 1 | 2 | 3 | 4 | 5 | 6
  children: Inline[]
}

export interface CodeBlockNode {
  type: "code"
  language: string | null
  title: string | null
  lineNumbers: boolean
  code: string
}

export interface HintNode {
  type: "hint"
  style: HintStyle
  children: Block[]
}

export interface TabNode {
  type: "tab"
  title: string
  children: Block[]
}

export interface TabsNode {
  type: "tabs"
  tabs: TabNode[]
}

export interface ExpandableNode {
  type: "expandable"
  summary: string
  children: Block[]
}

export interface StepNode {
  type: "step"
  title: string
  children: Block[]
}

export interface StepperNode {
  type: "stepper"
  steps: StepNode[]
}

export interface EmbedNode {
  type: "embed"
  url: string
}

export interface ContentRefNode {
  type: "content-ref"
  url: string
  children: Inline[]
}

export interface ColumnNode {
  type: "column"
  children: Block[]
}

export interface ColumnsNode {
  type: "columns"
  columns: ColumnNode[]
}

export interface FigureNode {
  type: "figure"
  src: string
  alt: string
  caption: string
}

export interface ListItemNode {
  type: "listItem"
  children: Block[]
  checked?: boolean // present only in task lists
}

export interface ListNode {
  type: "list"
  ordered: boolean
  task: boolean
  items: ListItemNode[]
}

export interface BlockquoteNode {
  type: "blockquote"
  children: Block[]
}

export interface DividerNode {
  type: "divider"
}

export interface TableNode {
  type: "table"
  header: Inline[][]
  rows: Inline[][][]
  /** GitBook table view, e.g. "cards" for <table data-view="cards"> */
  view?: string
}

export interface UpdateNode {
  type: "update"
  date: string
  children: Block[]
}

export interface UpdatesNode {
  type: "updates"
  format: string | null
  updates: UpdateNode[]
}

export interface OpenApiOperationNode {
  type: "openapi-operation"
  spec: string
  path: string
  method: string
  specUrl: string
  label: string
}

export interface MathNode {
  type: "math"
  formula: string
}

export type Block =
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | HintNode
  | TabsNode
  | ExpandableNode
  | StepperNode
  | EmbedNode
  | ContentRefNode
  | ColumnsNode
  | FigureNode
  | ListNode
  | BlockquoteNode
  | DividerNode
  | TableNode
  | MathNode
  | UpdatesNode
  | OpenApiOperationNode

export interface DocumentNode {
  type: "doc"
  children: Block[]
}

export const text = (t: string, marks: Partial<Omit<TextNode, "type" | "text">> = {}): TextNode => ({
  type: "text",
  text: t,
  ...marks,
})
