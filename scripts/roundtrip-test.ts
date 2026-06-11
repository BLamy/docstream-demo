import { parseMarkdown } from "../src/gitbook/parse"
import { serializeMarkdown } from "../src/gitbook/serialize"

const sample = `# Getting Started

Welcome to **blamy-notes** — a _GitBook-style_ docs platform with \`inline code\` and [links](https://example.com).

{% hint style="warning" %}
Heads up! This is a **warning** hint.
{% endhint %}

{% tabs %}
{% tab title="npm" %}
\`\`\`bash
npm install
\`\`\`
{% endtab %}

{% tab title="yarn" %}
\`\`\`bash
yarn
\`\`\`
{% endtab %}
{% endtabs %}

<details>

<summary>Click to expand</summary>

Hidden content with a [link](https://x.com).

</details>

{% stepper %}
{% step %}
### Install dependencies

Run the installer.
{% endstep %}

{% step %}
### Start the server

Then visit localhost.
{% endstep %}
{% endstepper %}

{% code title="server.ts" lineNumbers="true" %}
\`\`\`typescript
const x: number = 1
\`\`\`
{% endcode %}

{% embed url="https://www.youtube.com/watch?v=abc123" %}

{% content-ref url="getting-started/install.md" %}
Install guide
{% endcontent-ref %}

{% columns %}
{% column %}
Left side
{% endcolumn %}

{% column %}
Right side
{% endcolumn %}
{% endcolumns %}

<figure><img src="/assets/hero.png" alt="Hero"><figcaption><p>The hero image</p></figcaption></figure>

## Lists

- one
- two **bold**

1. first
2. second

- [x] done task
- [ ] open task

> A wise quote
> spanning lines.

| Col A | Col B |
| --- | --- |
| 1 | 2 |

$$
e = mc^2
$$

---

The end.
`

const ast1 = parseMarkdown(sample)
const md1 = serializeMarkdown(ast1)
const ast2 = parseMarkdown(md1)
const md2 = serializeMarkdown(ast2)

if (JSON.stringify(ast1) !== JSON.stringify(ast2)) {
  console.error("✗ AST not stable across round-trip")
  const a = JSON.stringify(ast1, null, 1).split("\n")
  const b = JSON.stringify(ast2, null, 1).split("\n")
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(`first diff at line ${i}:\n  1: ${a[i]}\n  2: ${b[i]}`)
      break
    }
  }
  process.exit(1)
}
if (md1 !== md2) {
  console.error("✗ markdown not stable across second round-trip")
  process.exit(1)
}

const blockTypes = ast1.children.map((b) => b.type)
console.log("✓ round-trip stable")
console.log("block types:", blockTypes.join(", "))

// --- Real GitBook export fixture ---
import { readFileSync } from "node:fs"
const fixture = readFileSync(new URL("./fixtures/gitbook-export.md", import.meta.url), "utf8")
const f1 = parseMarkdown(fixture)
const fmd1 = serializeMarkdown(f1)
const f2 = parseMarkdown(fmd1)
if (JSON.stringify(f1) !== JSON.stringify(f2)) {
  console.error("✗ fixture AST not stable")
  const a = JSON.stringify(f1, null, 1).split("\n")
  const b = JSON.stringify(f2, null, 1).split("\n")
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error(`first diff at line ${i}:\n  1: ${a[i]}\n  2: ${b[i]}`)
      break
    }
  }
  process.exit(1)
}
if (fmd1 !== serializeMarkdown(f2)) {
  console.error("✗ fixture markdown not stable")
  process.exit(1)
}
console.log("✓ gitbook export fixture round-trip stable")
console.log("fixture block types:", f1.children.map((b) => b.type).join(", "))
