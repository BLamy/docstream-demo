import type { PGlite, PGliteOptions } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import type { PgliteDatabase } from "drizzle-orm/pglite"
import { pgTable, text } from "drizzle-orm/pg-core"

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  auth0Sub: text("auth0_sub").notNull().unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
})

const schema = { accounts, workspaces }

type PGliteArtifacts = Pick<
  PGliteOptions,
  "pgliteWasmModule" | "initdbWasmModule" | "fsBundle"
>

declare global {
  var __BLAMY_NOTES_PGLITE_ARTIFACTS__: PGliteArtifacts | undefined
}

let configuredArtifacts: PGliteArtifacts = {}
let state:
  | {
      pglite: PGlite
      db: PgliteDatabase<typeof schema>
      migrated: Promise<void> | null
    }
  | undefined
let statePromise: Promise<NonNullable<typeof state>> | undefined

export function configurePGliteArtifacts(artifacts: PGliteArtifacts) {
  if (state || statePromise) return
  configuredArtifacts = artifacts
  globalThis.__BLAMY_NOTES_PGLITE_ARTIFACTS__ = artifacts
}

function pgliteDataDir() {
  const dataDir = process.env.PGLITE_DATA_DIR ?? ".pglite"
  return dataDir === ":memory:" ? "memory://" : dataDir
}

function ensureFileUrlFallback() {
  try {
    new URL("../release/pglite.data", "file:///pglite/src/pglite.ts")
    return
  } catch {
    /* Cloudflare's runtime rejects file: URLs; PGlite constructs one even when fsBundle is provided. */
  }

  const NativeURL = globalThis.URL
  globalThis.URL = class extends NativeURL {
    constructor(url: string | URL, base?: string | URL) {
      if (typeof base === "string" && base.startsWith("file:")) {
        try {
          super(url, base)
          return
        } catch {
          super(url, "https://pglite.local/")
          return
        }
      }
      super(url, base)
    }
  } as typeof URL
}

async function getState() {
  statePromise ??= (async () => {
    ensureFileUrlFallback()
    const { PGlite } = await import("@electric-sql/pglite")
    const pglite = new PGlite(
      pgliteDataDir(),
      globalThis.__BLAMY_NOTES_PGLITE_ARTIFACTS__ ?? configuredArtifacts
    )
    const { drizzle } = await import("drizzle-orm/pglite")
    return {
      pglite,
      db: drizzle(pglite, { schema }),
      migrated: null,
    }
  })()
  state = await statePromise
  return state
}

async function migrate() {
  const { pglite } = await getState()
  await pglite.exec(`
    create table if not exists accounts (
      id text primary key,
      auth0_sub text not null unique,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists workspaces (
      id text primary key,
      account_id text not null unique references accounts(id) on delete cascade,
      slug text not null unique,
      name text not null,
      created_at text not null,
      updated_at text not null
    );
  `)
}

async function ready() {
  const current = await getState()
  current.migrated ??= migrate()
  return current.migrated
}

function id(prefix: string) {
  return `${prefix}_${globalThis.crypto.randomUUID().replace(/-/g, "")}`
}

function workspaceSlug(auth0Sub: string) {
  const slug = auth0Sub
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
  return slug ? `workspace-${slug}` : `workspace-${id("acct").slice(-12)}`
}

export interface AccountWorkspace {
  account: {
    id: string
    auth0Sub: string
  }
  workspace: {
    id: string
    slug: string
    name: string
  }
}

export async function ensureAccountWorkspace(auth0Sub: string): Promise<AccountWorkspace> {
  await ready()
  const { db } = await getState()

  const existing = await db
    .select({
      accountId: accounts.id,
      accountAuth0Sub: accounts.auth0Sub,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
    })
    .from(accounts)
    .leftJoin(workspaces, eq(workspaces.accountId, accounts.id))
    .where(eq(accounts.auth0Sub, auth0Sub))
    .limit(1)

  const found = existing[0]
  if (found?.workspaceId && found.workspaceSlug && found.workspaceName) {
    return {
      account: { id: found.accountId, auth0Sub: found.accountAuth0Sub },
      workspace: {
        id: found.workspaceId,
        slug: found.workspaceSlug,
        name: found.workspaceName,
      },
    }
  }

  const now = new Date().toISOString()
  const account =
    found ??
    (
      await db
        .insert(accounts)
        .values({
          id: id("acct"),
          auth0Sub,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          accountId: accounts.id,
          accountAuth0Sub: accounts.auth0Sub,
        })
    )[0]

  const workspace = (
    await db
      .insert(workspaces)
      .values({
        id: id("ws"),
        accountId: account.accountId,
        slug: workspaceSlug(auth0Sub),
        name: "Personal Workspace",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({
        workspaceId: workspaces.id,
        workspaceSlug: workspaces.slug,
        workspaceName: workspaces.name,
      })
  )[0]

  if (workspace) {
    return {
      account: { id: account.accountId, auth0Sub: account.accountAuth0Sub },
      workspace: {
        id: workspace.workspaceId,
        slug: workspace.workspaceSlug,
        name: workspace.workspaceName,
      },
    }
  }

  const retry = await db
    .select({
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
    })
    .from(workspaces)
    .where(eq(workspaces.accountId, account.accountId))
    .limit(1)

  if (!retry[0]) {
    throw new Error(`account ${account.accountId} has no workspace`)
  }

  return {
    account: { id: account.accountId, auth0Sub: account.accountAuth0Sub },
    workspace: {
      id: retry[0].workspaceId,
      slug: retry[0].workspaceSlug,
      name: retry[0].workspaceName,
    },
  }
}
