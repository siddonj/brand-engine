# Design: Deploy brand-engine to Vercel

**Date:** 2026-06-21  
**Status:** Approved

## Goal

Take the brand-engine app fully off the local machine and deploy it to Vercel, accessible from anywhere. Zero ongoing cost.

## Infrastructure

| Layer | Service | Cost |
|---|---|---|
| Hosting | Vercel (free tier) | $0 |
| Database | Turso (free tier) | $0 |
| Background jobs | Inngest (free tier) | $0 |
| Source control | GitHub (public) | $0 |
| AI provider | OpenRouter | Pay-per-use |

---

## Section 1: GitHub

The project is already a local git repo. Create a new public GitHub repo, add it as the remote, and push `main`.

- `.env.local` is already excluded by Next.js default `.gitignore` — secrets do not get committed
- Vercel connects to the GitHub repo for CI/CD: every push to `main` triggers a production deploy

No structural changes to the codebase for this step.

---

## Section 2: Database — better-sqlite3 → Turso

**Why:** Vercel is serverless with no persistent filesystem. The current `data/app.db` file cannot exist on Vercel. Turso is a managed SQLite-compatible cloud database; Drizzle supports it natively via the libsql adapter.

### Schema
`src/lib/db/schema.ts` is **unchanged**. All table definitions, types, and relationships stay identical — Turso is SQLite-compatible.

### Connection
`src/lib/db/index.ts` is rewritten to use the libsql adapter:

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const db = drizzle(client, { schema });
export { schema };
```

### Migration
`src/lib/db/migrate.ts` is a full rewrite. The current implementation uses the synchronous `better-sqlite3` API (`sqlite.transaction()`, `sqlite.exec()`, `sqlite.prepare()`) which has no equivalent in `@libsql/client`. The rewrite uses the async libsql `client.execute()` and `client.batch()` APIs to run the same `CREATE TABLE IF NOT EXISTS` statements and agent seed inserts. Run once against Turso after provisioning to create all tables. Existing local data can be exported via `turso db shell` if needed.

### Package changes
- **Remove:** `better-sqlite3`, `@types/better-sqlite3`
- **Add:** `@libsql/client`

### New env vars
```
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
```

---

## Section 3: Background Jobs — fire-and-forget → Inngest

**Why:** Vercel terminates the serverless function process as soon as the HTTP response is sent. The current `runPipeline().catch(console.error)` pattern in `/api/workflow/research` would be killed mid-run on every request. Inngest is a background job service purpose-built for AI pipelines; it executes functions reliably outside the request lifecycle.

### New files

**`src/inngest/client.ts`**
```ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "brand-engine" });
```

**`src/inngest/functions.ts`**
Contains the pipeline wrapped as an Inngest function. The `runPipeline` logic moves here verbatim; the function signature changes from a direct call to `inngest.createFunction(...)`.

**`src/app/api/inngest/route.ts`**
The Inngest webhook endpoint — Inngest calls this route to execute functions.
```ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { pipelineFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions: [pipelineFunction] });
```

### Changed files

**`src/app/api/workflow/research/route.ts`**  
Replace `runPipeline(topicId, job.id).catch(console.error)` with:
```ts
await inngest.send({ name: "pipeline/run", data: { topicId, jobId: job.id } });
```
The route still returns 202 immediately. Everything else in the route is unchanged.

### Unchanged
- `runResearchAgent`, `runWriterAgent`, `runSEOAgent` — no changes
- `appendLog` and all logging to `jobLogs` — no changes
- `/api/workflow/status/[jobId]` polling — no changes
- All other API routes — no changes

### New env vars
```
INNGEST_SIGNING_KEY=your-signing-key
INNGEST_EVENT_KEY=your-event-key
```

### Package changes
- **Add:** `inngest`

---

## Section 4: AI Provider — Anthropic SDK → OpenRouter

**Why:** OpenRouter provides access to Claude and other models through a single OpenAI-compatible API, reducing vendor lock-in and enabling model switching without code changes.

### New file

**`src/lib/ai.ts`** — shared OpenRouter client
```ts
import OpenAI from "openai";

export const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### Changed files
All three agent files import `openrouter` from `@/lib/ai` instead of instantiating their own Anthropic SDK clients. Model strings (`"claude-sonnet-4-6"` etc.) are unchanged — OpenRouter accepts Claude model IDs directly.

### Package changes
- **Remove:** `@anthropic-ai/sdk`
- **Keep:** `openai` (already present)

### Env var changes
- **Remove:** `ANTHROPIC_API_KEY`
- **Add:** `OPENROUTER_API_KEY`

---

## Section 5: Vercel Deployment

Connect the GitHub repo to Vercel via the dashboard (auto-detects Next.js, no `vercel.json` needed).

### Environment variables to set in Vercel
```
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
INNGEST_SIGNING_KEY
INNGEST_EVENT_KEY
OPENROUTER_API_KEY
TAVILY_API_KEY
```

### Build & deploy
- Build command: `next build` (default)
- After first deploy, run `npm run db:migrate` once against Turso to create the schema

### LinkedIn OAuth callback
The LinkedIn OAuth callback URL (`/api/linkedin/oauth/callback`) must be updated in the LinkedIn developer app settings to point to the Vercel production URL instead of localhost.

---

## What Does NOT Change

- All Drizzle schema definitions
- All agent implementations (research, writer, SEO)
- All API routes except `/api/workflow/research` (one line change) and the new `/api/inngest` route
- All UI components
- LinkedIn, WordPress, Postiz, Unsplash, Composio integrations
- Job status polling pattern

---

## Setup Order

1. Create GitHub repo → push code
2. Provision Turso database → get URL + token
3. Sign up for Inngest → get signing key + event key
4. Sign up for OpenRouter → get API key
5. Make code changes (DB connection, Inngest wiring, OpenRouter client)
6. Connect GitHub to Vercel → set env vars → deploy
7. Run `db:migrate` against Turso
8. Update LinkedIn OAuth callback URL
9. Smoke test: create a topic, trigger pipeline, verify job completes
