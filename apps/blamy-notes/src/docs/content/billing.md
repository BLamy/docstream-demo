# Plans & Billing

What's included in Free, and what Pro unlocks.

## Plans

| | Free | Pro |
| --- | --- | --- |
| Browse & edit your repos | ✓ | ✓ |
| Commit / open PRs | ✓ | ✓ |
| Public previews of public repos | ✓ | ✓ |
| **Publish private repos to the web** | — | ✓ |
| Price | $0 | $12 one-time |

## Upgrade to Pro

{% stepper %}
{% step %}
#### Start checkout

Click **Upgrade to Pro** in the sidebar. You are redirected to a Stripe Checkout page.
{% endstep %}
{% step %}
#### Pay

Complete payment on Stripe. Blamy Notes never sees your card details.
{% endstep %}
{% step %}
#### Done

You land back in the app on the Pro plan, and publishing unlocks immediately.
{% endstep %}
{% endstepper %}

{% hint style="info" %}
Fulfillment is confirmed twice: Stripe notifies the backend by webhook the moment the checkout session completes, and the app verifies the session again when your browser returns. Either path activates Pro.
{% endhint %}

## FAQ

### Do I need Pro to use the editor?

No. Browsing, editing, committing, and PR creation are free forever.

### What exactly does Pro gate?

Only publishing docs sites for **private** repositories — the feature that requires the server to keep a credential and serve your private content publicly.

### How do I stop sharing a private repo?

Unpublish it from the publish panel. The public URL is revoked instantly. Downgrading support — contact us and we'll sort out anything else.
