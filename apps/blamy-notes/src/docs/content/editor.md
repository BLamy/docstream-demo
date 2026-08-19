# Editor Guide

Everything the Blamy Notes editor can do.

The editor is a TipTap-based block editor that round-trips GitBook-flavored markdown. What you edit is exactly what gets committed — no proprietary format, no lossy conversion.

## Views

Every file opens in one of three views:

* **Editor** — the rich block editor.
* **Preview** — the rendered docs page, exactly as visitors will see it.
* **Markdown** — the raw markdown source.

Switching views never loses changes; all three operate on the same buffer.

## Blocks

Type `/` anywhere to open the block menu.

### Hints

Callouts in four styles — `info`, `success`, `warning`, and `danger`:

{% hint style="warning" %}
Unsaved changes live only in your browser. Commit or open a PR to persist them.
{% endhint %}

### Code blocks

Code blocks support a title, language highlighting, and optional line numbers:

```ts title="netlify/functions/lib/github.ts" lineNumbers="true"
export async function commitFile(
  token: string,
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
): Promise<{ commitUrl: string }> {
  // PUT /repos/{owner}/{repo}/contents/{path}
}
```

### Tables

Standard markdown tables render with full styling:

| Element | Markdown | Notes |
| --- | --- | --- |
| Hint | `{% hint %}` | Four styles |
| Tabs | `{% tabs %}` | Keyboard navigable |
| Stepper | `{% stepper %}` | Numbered steps |
| Code | fenced blocks | Title + line numbers |

### Steppers

{% stepper %}
{% step %}
#### Write

Edit markdown with rich blocks.
{% endstep %}
{% step %}
#### Review

Preview the rendered page before shipping.
{% endstep %}
{% step %}
#### Ship

Commit to main or open a pull request.
{% endstep %}
{% endstepper %}

## Saving

The **Commit to main** button writes directly to the default branch. **Open PR** creates a `blamy-notes/*` branch and opens a pull request so your team can review.

{% hint style="success" %}
Both actions use the GitHub Contents API with your own credentials — file history, blame, and authorship all stay correct.
{% endhint %}
