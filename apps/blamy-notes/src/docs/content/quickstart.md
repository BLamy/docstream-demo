# Quickstart

Get started with Blamy Notes in five minutes.

Blamy Notes is a GitBook-style editor that works directly on the markdown files in your GitHub repositories. There is no separate content database — your repo is the source of truth. There are three ways to use it:

1. **Edit in the app** — browse any repo you can access and edit its markdown with a rich block editor.
2. **Ship through Git** — save changes as a direct commit or as a pull request, authored as you.
3. **Publish to the web** — turn any repo, including private ones, into a public read-only docs site.

## Create an account

Visit the app and sign in. Blamy Notes uses Auth0, and your GitHub identity is connected during login so the app can list and edit the repositories you have access to.

{% hint style="info" %}
Repository access is always scoped to **your** GitHub permissions. Commits and pull requests created from the editor are authored by your GitHub user.
{% endhint %}

## Open a repository

1. Pick an owner (you or one of your organizations) in the sidebar switcher.
2. Select a repository to expand its markdown file tree.
3. Click any `.md` file to load it.

Use the search box to find repositories across every owner you can access.

## Edit and save

The editor understands GitBook-flavored markdown: hints, tabs, steppers, code blocks with titles, tables, and more. Type `/` for the block menu.

When you are ready to save, choose one of:

* **Commit to main** — writes the file straight to the default branch.
* **Open PR** — creates a branch, commits your change, and opens a pull request.

```bash
# Every save is a real Git operation. This is what "Open PR" produces:
git checkout -b blamy-notes/docs-getting-started-md-k2f9
git commit -m "docs: update docs/getting-started.md"
gh pr create --title "docs: update docs/getting-started.md"
```

## Publish a docs site

On the Pro plan you can publish any repository — even a private one — as a public, read-only docs site at a stable URL:

```
https://your-app.example/github.com/<owner>/<repo>
```

See [Public Docs Sites](/docs/publishing) for how publishing works and what visitors can see.

## Next steps

* [Editor Guide](/docs/editor) — every block the editor supports.
* [Public Docs Sites](/docs/publishing) — publish private repos to the web.
* [Plans & Billing](/docs/billing) — what's free and what needs Pro.
* [API Reference](/docs/api-reference) — the REST API behind the app.
