// Minimal Stripe REST client (no SDK). STRIPE_API_URL points the client at
// the local Stripe emulator (BLamy/emulate fork); unset it in production to
// talk to api.stripe.com.

import { createHmac, timingSafeEqual } from "node:crypto"

const API = process.env.STRIPE_API_URL || "https://api.stripe.com"
const SECRET_KEY = process.env.STRIPE_SECRET_KEY || ""

export const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || "price_blamy_pro"
export const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ""

export class StripeError extends Error {
  status: number

  constructor(method: string, path: string, status: number, body: string) {
    super(`Stripe ${method} ${path} -> ${status}: ${body}`)
    this.status = status
  }
}

// Stripe's request encoding: form-urlencoded with bracket notation for
// nested fields, e.g. line_items[0][price]=price_x&metadata[account_id]=y.
function encodeForm(
  value: unknown,
  prefix: string,
  out: URLSearchParams
): URLSearchParams {
  if (Array.isArray(value)) {
    value.forEach((item, i) => encodeForm(item, `${prefix}[${i}]`, out))
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue
      encodeForm(entry, prefix ? `${prefix}[${key}]` : key, out)
    }
  } else if (value !== undefined && value !== null) {
    out.set(prefix, String(value))
  }
  return out
}

async function stripeFetch(
  path: string,
  params?: Record<string, unknown>,
  method = params ? "POST" : "GET"
) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${SECRET_KEY}`,
      ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(params ? { body: encodeForm(params, "", new URLSearchParams()).toString() } : {}),
  })
  if (!res.ok) {
    throw new StripeError(method, path, res.status, await res.text())
  }
  return res.json()
}

export interface CheckoutSession {
  id: string
  url: string | null
  status: string
  payment_status: string
  metadata: Record<string, string>
}

export async function createCheckoutSession(opts: {
  priceId: string
  successUrl: string
  cancelUrl: string
  metadata: Record<string, string>
}): Promise<CheckoutSession> {
  return (await stripeFetch("/v1/checkout/sessions", {
    mode: "payment",
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
  })) as CheckoutSession
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  return (await stripeFetch(`/v1/checkout/sessions/${encodeURIComponent(id)}`)) as CheckoutSession
}

export async function getProPrice(): Promise<{ unitAmount: number; currency: string }> {
  const price = (await stripeFetch(`/v1/prices/${encodeURIComponent(PRO_PRICE_ID)}`)) as {
    unit_amount: number
    currency: string
  }
  return { unitAmount: price.unit_amount, currency: price.currency }
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex")
  const bufB = Buffer.from(b, "hex")
  return bufA.length > 0 && bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Verifies a webhook delivery. Accepts both signature schemes:
 * - `stripe-signature: t=...,v1=<hmac of "t.body">` (real Stripe)
 * - `x-hub-signature-256: sha256=<hmac of body>` (the emulator's dispatcher)
 */
export function verifyWebhookSignature(body: string, headers: Headers, secret: string): boolean {
  if (!secret) return false

  const stripeSig = headers.get("stripe-signature")
  if (stripeSig) {
    const parts = new Map(
      stripeSig.split(",").map((p) => p.split("=", 2) as [string, string])
    )
    const t = parts.get("t")
    const v1 = parts.get("v1")
    if (!t || !v1) return false
    const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
    return safeEqualHex(v1, expected)
  }

  const hubSig = headers.get("x-hub-signature-256")
  if (hubSig?.startsWith("sha256=")) {
    const expected = createHmac("sha256", secret).update(body).digest("hex")
    return safeEqualHex(hubSig.slice("sha256=".length), expected)
  }

  return false
}
