export interface Page {
  id: string
  title: string
  /** Path of the markdown file when synced to a git repo, e.g. "getting-started.md" */
  path: string
  order: number
  markdown: string
}

export const makeId = () => Math.random().toString(36).slice(2, 10)

const welcome = `# Welcome to blamy-notes

A **GitBook-style** docs platform: write GitBook-flavored markdown, edit rich blocks visually, and publish a docs site — all backed by your Git repo.

{% hint style="info" %}
Everything on this page is a *GitBook block*. Open the **Editor** tab to edit any of it visually, or the **Markdown** tab to see the raw GitBook syntax.
{% endhint %}

## Quick start

{% stepper %}
{% step %}
### Create a page

Use the **+** button in the sidebar to add pages to the space.
{% endstep %}

{% step %}
### Write rich content

Insert hints, tabs, steppers, code and more from the editor toolbar.
{% endstep %}

{% step %}
### Sync to GitHub

Install the [blamy-notes GitHub App](https://github.com/apps/blamy-notes) on a repo and press **Sync**.
{% endstep %}
{% endstepper %}

{% content-ref url="blocks.md" %}
See every supported block
{% endcontent-ref %}
`

const blocks = `# All blocks

Every GitBook block supported by the editor, in one page.

## Hints

{% hint style="info" %}
An **info** hint.
{% endhint %}

{% hint style="success" %}
A **success** hint.
{% endhint %}

{% hint style="warning" %}
A **warning** hint.
{% endhint %}

{% hint style="danger" %}
A **danger** hint.
{% endhint %}

## Tabs

{% tabs %}
{% tab title="npm" %}
\`\`\`bash
npm install blamy-notes
\`\`\`
{% endtab %}

{% tab title="pnpm" %}
\`\`\`bash
pnpm add blamy-notes
\`\`\`
{% endtab %}
{% endtabs %}

## Expandable

<details>

<summary>What's hidden in here?</summary>

Secrets. And **markdown**.

</details>

## Code with title

{% code title="hello.ts" lineNumbers="true" %}
\`\`\`typescript
export const hello = (name: string) => \`Hello \${name}\`
\`\`\`
{% endcode %}

## Columns

{% columns %}
{% column %}
**Left** column content.
{% endcolumn %}

{% column %}
**Right** column content.
{% endcolumn %}
{% endcolumns %}

## Embed

{% embed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" %}

## Image

<figure><img src="https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200" alt="Workspace"><figcaption><p>A workspace</p></figcaption></figure>

## Lists

- Plain bullet
- Another bullet

1. Ordered one
2. Ordered two

- [x] Shipped the parser
- [ ] Ship the editor

## Table

| Block | Editable | Rendered |
| --- | --- | --- |
| Hint | yes | yes |
| Tabs | yes | yes |

## Math

$$
f(x) = \\int_{-\\infty}^{\\infty} \\hat f(\\xi) e^{2\\pi i \\xi x} d\\xi
$$

> Block quotes work too.

---

That's all of them.
`

const apiAndChangelog = `# API & changelog

Blocks from real GitBook exports: OpenAPI operations, changelogs, mermaid diagrams, and card tables.

## OpenAPI

{% openapi-operation spec="gitbook-petstore" path="/store/orders" method="get" %}
[OpenAPI gitbook-petstore](https://gitbookio.github.io/onboarding-template-images/gitbook-petstore.yaml)
{% endopenapi-operation %}

## Changelog

{% updates format="full" %}
{% update date="2026-06-11" %}
## OpenAPI support shipped

Operations render with auth, parameters, responses, and samples.
{% endupdate %}

{% update date="2026-06-10" %}
## GitBook clone launched

The editor, preview, and git sync went live.
{% endupdate %}
{% endupdates %}

## Mermaid

\`\`\`mermaid
graph TD
  Markdown --> AST
  AST --> Editor
  AST --> Docs
  Editor --> AST
\`\`\`

## Cards

<table data-view="cards"><thead><tr><th></th></tr></thead><tbody><tr><td><strong>Editor</strong> rich blocks with TipTap</td></tr><tr><td><strong>Docs</strong> a published site view</td></tr><tr><td><strong>Git sync</strong> markdown in your repo</td></tr></tbody></table>
`

export const pages: Page[] = [
  { id: "welcome", title: "Welcome", path: "README.md", order: 1, markdown: welcome },
  { id: "blocks", title: "All blocks", path: "blocks.md", order: 2, markdown: blocks },
  { id: "api", title: "API & changelog", path: "api.md", order: 3, markdown: apiAndChangelog },
]
