export type Priority = 1 | 2 | 3 | 4

export interface Task {
  id: string
  content: string
  description: string | null
  projectId: string
  priority: Priority
  dueDate: string | null // "YYYY-MM-DD"
  completed: boolean
  labels: string[]
  order: number
  createdAt: string
}

export interface Project {
  id: string
  name: string
  color: string
  emoji?: string
  shared: boolean
  taskCount: number
}

export interface Label {
  id: string
  name: string
  color: string
}

export type ViewId =
  | "inbox"
  | "today"
  | "upcoming"
  | "filters"
  | "completed"
  | "search"
  | `project:${string}`

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; flag: string }
> = {
  1: { label: "Priority 1", color: "#d1453b", flag: "#d1453b" },
  2: { label: "Priority 2", color: "#eb8909", flag: "#eb8909" },
  3: { label: "Priority 3", color: "#246fe0", flag: "#246fe0" },
  4: { label: "Priority 4", color: "#808080", flag: "#808080" },
}
