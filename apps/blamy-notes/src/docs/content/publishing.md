# Public Docs Sites

Publish any repository — including private ones — as a public, read-only docs site.

Publishing gives a repository a stable public URL that renders its markdown with the same GitBook renderer used in the editor's preview:

```
https://your-app.example/github.com/<owner>/<repo>
```

Visitors browse the file tree and read rendered pages. They cannot edit, and they never see anything except markdown content.

## Publish a repository

{% stepper %}
{% step %}
#### Select the repository

Open the repository in the editor. Private repositories show a lock icon in the sidebar.
{% endstep %}
{% step %}
#### Publish

Click **Publish** in the header and confirm. Publishing private repositories requires the [Pro plan](/docs/billing).
{% endstep %}
{% step %}
#### Share the link

Copy the public URL from the publish panel and share it anywhere.
{% endstep %}
{% endstepper %}

## How private repos become public

When you publish a private repository you are explicitly granting public read access to its **markdown content**:

* The server keeps a read credential for the repository, captured from your session when you publish.
* Anonymous visitors read the tree and files through the server with that credential.
* Only `.md` files are listed and served — code, issues, and other repo data are never exposed.

{% hint style="warning" %}
Publishing makes the repository's markdown readable by **anyone with the link**. Unpublish at any time to revoke access instantly.
{% endhint %}

## Unpublish

Open the publish panel on a published repository and click **Unpublish**. The public URL stops working immediately.

## Branch and PR previews

Public URLs also accept a branch or pull-request suffix, which is useful for reviewing docs changes before they merge:

```
/github.com/<owner>/<repo>/tree/<branch>
/github.com/<owner>/<repo>/pull/<number>
```

{% hint style="info" %}
For repositories that are already public on GitHub, these preview URLs work without publishing — GitHub's own visibility rules apply.
{% endhint %}
