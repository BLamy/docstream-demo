// Seeds markdown content into the local GitHub emulator through the Git Data
// API (blob-less trees with inline content → commit → ref update), the same
// surface the app itself commits through.

const DEMO_FILES = {
  "blamy/loop-qa": {
    "README.md": `# Loop QA

Public demo repository for the Blamy Notes editor.

## What's here

* [Getting started](docs/getting-started.md)
* [Architecture](docs/architecture.md)

{% hint style="info" %}
This repo is **public** — its docs preview works for anyone at \`/github.com/blamy/loop-qa\`.
{% endhint %}
`,
    "docs/getting-started.md": `# Getting Started

1. Open the repo in Blamy Notes.
2. Pick a markdown file.
3. Edit and commit.
`,
    "docs/architecture.md": `# Architecture

The QA loop drives the app end to end and records every session.

\`\`\`mermaid
flowchart LR
  Agent --> Browser --> App --> GitHub
\`\`\`
`,
  },
  "blamy/secret-notes": {
    "README.md": `# Secret Notes

Private engineering notes for the Blamy team.

{% hint style="warning" %}
This repository is **private**. It only becomes readable on the web after the
owner publishes it from Blamy Notes.
{% endhint %}

## Contents

* [Architecture](notes/architecture.md)
* [Incident runbook](notes/incident-runbook.md)
`,
    "notes/architecture.md": `# Architecture Notes

## Services

| Service | Purpose |
| --- | --- |
| api | Netlify functions REST API |
| editor | React SPA |
| emulators | Local GitHub / Auth0 / Stripe |

## Data flow

Login mints a session; the session's GitHub credential reads and writes repo
markdown through the Git Data API.
`,
    "notes/incident-runbook.md": `# Incident Runbook

{% stepper %}
{% step %}
#### Triage

Check the status page and recent deploys.
{% endstep %}
{% step %}
#### Mitigate

Roll back the last deploy if user-facing.
{% endstep %}
{% step %}
#### Write it up

Post-incident notes go in this repo.
{% endstep %}
{% endstepper %}
`,
  },
}

async function ghFetch(base, token, path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub seed ${init?.method ?? "GET"} ${path} -> ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

async function seedRepo(base, token, fullName, files) {
  const repo = await ghFetch(base, token, `/repos/${fullName}`)
  const branch = repo.default_branch ?? "main"
  const head = await ghFetch(base, token, `/repos/${fullName}/git/ref/heads/${branch}`)
  const headCommit = await ghFetch(
    base,
    token,
    `/repos/${fullName}/git/commits/${head.object.sha}`
  )
  const baseTree = headCommit.tree?.sha ?? headCommit.commit?.tree?.sha

  const tree = await ghFetch(base, token, `/repos/${fullName}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      // No base_tree: the seeded tree becomes the exact file list, which also
      // replaces auto-init placeholder entries that have no backing blob.
      tree: Object.entries(files).map(([path, content]) => ({
        path,
        mode: "100644",
        type: "blob",
        content,
      })),
    }),
  })
  const commit = await ghFetch(base, token, `/repos/${fullName}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: "docs: seed demo content",
      tree: tree.sha,
      parents: [head.object.sha],
    }),
  })
  await ghFetch(base, token, `/repos/${fullName}/git/refs/heads/${branch}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha }),
  })
  console.log(`[seed] ${fullName}: ${Object.keys(files).length} files @ ${commit.sha.slice(0, 7)} (base tree ${baseTree?.slice(0, 7) ?? "none"})`)
}

export async function seedGithub(base, token) {
  for (const [fullName, files] of Object.entries(DEMO_FILES)) {
    await seedRepo(base, token, fullName, files)
  }
}
