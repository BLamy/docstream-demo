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

// --- GitHub README badge row ---
const badges = `Hi, I'm Brett. i like computers\n\n<a href="https://linkedin.com/in/blamy"><img src="linkedin.svg" width="50px" height="50px" /></a> <a href="https://github.com/blamy"><img src="github.svg" width="50px" height="50px" /></a> <a href="https://twitter.com/brett_lamy"><img src="twitter.svg" width="50px" height="50px" /></a> <a href="https://bsky.app/profile/blamy.dev"><img src="bluesky.svg" width="50px" height="50px" /></a>\n`
const b1 = parseMarkdown(badges)
const bmd = serializeMarkdown(b1)
const b2 = parseMarkdown(bmd)
if (JSON.stringify(b1) !== JSON.stringify(b2)) {
  console.error("✗ badge AST unstable"); process.exit(1)
}
const imgs = b1.children[1]
if (imgs.type !== "paragraph" || imgs.children.filter((c) => c.type === "image").length !== 4) {
  console.error("✗ expected 4 inline images, got:", JSON.stringify(imgs).slice(0, 200)); process.exit(1)
}
if (!bmd.includes('<a href="https://linkedin.com/in/blamy"><img src="linkedin.svg" width="50px" height="50px" /></a>')) {
  console.error("✗ badge serialization changed:", bmd); process.exit(1)
}
console.log("✓ github badge row round-trip stable (4 inline images)")

// --- GFM features ---
const gfm = [
  "Setext H1",
  "=========",
  "",
  "Setext H2",
  "---------",
  "",
  "- top",
  "  - nested",
  "    - deeper",
  "- top2",
  "",
  "1. one",
  "   1. one.one",
  "2. two",
  "",
  "~~~js",
  "const tilde = true",
  "~~~",
  "",
  "    indented code",
  "    line two",
  "",
  "Visit https://example.com/a_b and <https://x.com/path>.",
  "",
  "See [the docs][docs] and [GitHub][].",
  "",
  "[docs]: https://docs.example.com",
  "[github]: https://github.com",
].join("\n")
const g1 = parseMarkdown(gfm)
const gmd = serializeMarkdown(g1)
const g2 = parseMarkdown(gmd)
if (JSON.stringify(g1) !== JSON.stringify(g2)) {
  console.error("✗ GFM AST unstable")
  const a = JSON.stringify(g1, null, 1).split("\n"), b = JSON.stringify(g2, null, 1).split("\n")
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.error(`diff@${i}\n 1: ${a[i]}\n 2: ${b[i]}`); break }
  process.exit(1)
}
const types = g1.children.map((b) => b.type).join(",")
const nested = g1.children[2]
const ok =
  g1.children[0].type === "heading" && g1.children[0].level === 1 &&
  g1.children[1].type === "heading" && g1.children[1].level === 2 &&
  nested.type === "list" && nested.items[0].children.some((c) => c.type === "list") &&
  g1.children[4].type === "code" && g1.children[5].type === "code"
if (!ok) { console.error("✗ GFM structure wrong:", types); process.exit(1) }
const links = g1.children.filter((b) => b.type === "paragraph").flatMap((p) => p.children).filter((c) => c.type === "text" && c.link)
if (links.length < 4) { console.error("✗ expected 4 links, got", links.length); process.exit(1) }
console.log("✓ GFM round-trip stable (setext, nested lists, ~~~, indented code, autolinks, ref links)")
