# Vercel Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy brand-engine to Vercel with Turso (database), Inngest (background jobs), and OpenRouter (AI provider), so the app runs fully in the cloud without a local machine.

**Architecture:** SQLite is migrated to Turso (cloud-hosted, SQLite-compatible) with a libsql adapter; the fire-and-forget pipeline becomes an Inngest function invoked via an event send; all AI calls are unified through OpenRouter using the existing `openai` package pointed at the OpenRouter base URL.

**Tech Stack:** Next.js 16, Drizzle ORM + `@libsql/client` + Turso, Inngest, OpenRouter (via `openai` package), Vercel

## Global Constraints

- TypeScript strict mode — no `any` unless casting from unknown JSON
- All DB access goes through `src/lib/db/index.ts` — never instantiate a DB client elsewhere
- Environment variables for secrets — no hardcoded keys anywhere
- Never import `better-sqlite3` or `@anthropic-ai/sdk` after Task 2/3 respectively
- `src/lib/agents/runner.ts` is the single place that makes AI API calls — agents call `runAgent()`, not the SDK directly
- Drizzle ORM schema in `src/lib/db/schema.ts` is unchanged throughout

---

## File Map

**Modified:**
- `.gitignore` — add `data/` directory
- `package.json` — remove `better-sqlite3`, `@types/better-sqlite3`, `@anthropic-ai/sdk`; add `@libsql/client`, `inngest`
- `src/lib/db/index.ts` — swap `better-sqlite3` for `@libsql/client`
- `src/lib/db/migrate.ts` — full rewrite: sync better-sqlite3 API → async libsql API
- `src/lib/agents/runner.ts` — remove Anthropic path; OpenRouter only
- `src/lib/agents/completion.ts` — remove Anthropic path; OpenRouter only
- `src/app/api/settings/route.ts` — remove `anthropic_api_key` handling; remove `ai_provider` from ALLOWED_KEYS
- `src/app/api/workflow/research/route.ts` — replace `runPipeline()` fire-and-forget with `inngest.send()`

**Created:**
- `src/inngest/client.ts` — Inngest client singleton
- `src/inngest/functions.ts` — pipeline Inngest function (contains `runPipeline` logic)
- `src/app/api/inngest/route.ts` — Inngest webhook endpoint

---

## Task 1: Gitignore & GitHub setup

**Files:**
- Modify: `.gitignore`

**Interfaces:**
- Produces: public GitHub repo at `https://github.com/<you>/brand-engine` that Vercel will connect to

- [ ] **Step 1: Add `data/` to .gitignore**

Open `.gitignore` and add after the `# misc` section:

```
# local SQLite database
/data
```

The `data/` directory holds `app.db` which must never be committed.

- [ ] **Step 2: Stage and verify nothing sensitive is tracked**

```bash
git add .gitignore
git status
```

Expected: only `.gitignore` is staged. If `data/` or `.env.local` appear in untracked/staged files, stop and confirm `.gitignore` is correct before proceeding.

- [ ] **Step 3: Create public GitHub repo**

Go to https://github.com/new — name it `brand-engine`, set to **Public**, do NOT initialize with README (the repo already has commits).

- [ ] **Step 4: Add remote and push**

```bash
git remote add origin https://github.com/<your-username>/brand-engine.git
git push -u origin main
```

Expected: push succeeds, all commits appear on GitHub.

- [ ] **Step 5: Verify no secrets were pushed**

On GitHub, confirm:
- No `.env.local` file in the repo
- No `data/app.db` file in the repo
- `.gitignore` is present at the root

---

## Task 2: Turso database

**Files:**
- Modify: `package.json`
- Modify: `src/lib/db/index.ts`
- Modify: `src/lib/db/migrate.ts`

**Interfaces:**
- Produces: `db` export from `src/lib/db/index.ts` — same Drizzle instance shape as before, but backed by Turso instead of a local file

- [ ] **Step 1: Provision a Turso database**

Sign up at https://turso.tech (free tier). Then:

```bash
# Install Turso CLI (Mac)
brew install tursodatabase/tap/turso
turso auth login
turso db create brand-engine
turso db show brand-engine
# Note the URL: libsql://brand-engine-<org>.turso.io
turso db tokens create brand-engine
# Note the auth token
```

- [ ] **Step 2: Add Turso credentials to .env.local**

Add to `.env.local`:

```
TURSO_DATABASE_URL=libsql://brand-engine-<your-org>.turso.io
TURSO_AUTH_TOKEN=<your-token-from-step-1>
```

- [ ] **Step 3: Swap packages**

```bash
npm uninstall better-sqlite3 @types/better-sqlite3
npm install @libsql/client
```

- [ ] **Step 4: Rewrite `src/lib/db/index.ts`**

Replace the entire file:

```ts
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
```

Note: `authToken` is optional — omit for local file:// URLs if ever testing locally with a file. For Turso cloud it's required.

- [ ] **Step 5: Rewrite `src/lib/db/migrate.ts`**

Replace the entire file. The libsql client is async — no transactions, use `batch()` for grouped writes:

```ts
import { createClient } from "@libsql/client";

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Create all tables
  await client.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS agents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT 'claude-sonnet-4-6',
          system_prompt TEXT NOT NULL,
          temperature REAL NOT NULL DEFAULT 0.7,
          max_tokens INTEGER NOT NULL DEFAULT 8000,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS topics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          keywords TEXT NOT NULL DEFAULT '[]',
          target_audience TEXT NOT NULL DEFAULT 'PropTech and AI professionals',
          status TEXT NOT NULL DEFAULT 'queued',
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          topic_id INTEGER REFERENCES topics(id),
          title TEXT NOT NULL DEFAULT '',
          slug TEXT NOT NULL DEFAULT '',
          content_blocks TEXT NOT NULL DEFAULT '[]',
          meta_title TEXT NOT NULL DEFAULT '',
          meta_description TEXT NOT NULL DEFAULT '',
          focus_keyphrase TEXT NOT NULL DEFAULT '',
          excerpt TEXT NOT NULL DEFAULT '',
          research_brief TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'drafting',
          wordpress_draft_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          approved_at TEXT,
          published_at TEXT
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS social_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER REFERENCES posts(id),
          platform TEXT NOT NULL DEFAULT 'linkedin',
          content TEXT NOT NULL,
          hashtags TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'pending',
          postiz_post_id TEXT,
          scheduled_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS job_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_type TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          log_output TEXT NOT NULL DEFAULT '',
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          completed_at TEXT
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS watched_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          linkedin_url TEXT NOT NULL,
          linkedin_person_urn TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          active INTEGER NOT NULL DEFAULT 1,
          last_scanned_at TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        args: [],
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS linkedin_engagements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER REFERENCES watched_profiles(id),
          post_urn TEXT NOT NULL,
          post_url TEXT NOT NULL DEFAULT '',
          post_snippet TEXT NOT NULL DEFAULT '',
          comment_text TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending',
          composio_result TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          posted_at TEXT
        )`,
        args: [],
      },
    ],
    "write"
  );

  // Seed default agents if none exist
  const countResult = await client.execute("SELECT COUNT(*) as count FROM agents");
  const agentCount = Number(countResult.rows[0][0]);

  if (agentCount === 0) {
    // Copy system prompt strings verbatim from the old migrate.ts
    // Each insertAgent call maps to one entry below
    const agents: [string, string, string, string, number, number][] = [
      [
        "Research Agent",
        "research",
        "claude-opus-4-8",
        // system_prompt — copy from src/lib/db/migrate.ts lines 120-134
        `You are an expert research analyst specializing in Property Technology (PropTech) and AI Automation. Your role is to conduct deep, authoritative research on behalf of an industry thought leader.

When given a topic:
1. Research it thoroughly from multiple angles
2. Find recent statistics, trends, and data points (note your knowledge cutoff)
3. Identify key players, companies, and use cases in the PropTech/AI space
4. Uncover unique insights and contrarian perspectives
5. Structure findings into a clear research brief

Focus on: market trends, ROI/business impact, implementation challenges, future outlook, and actionable insights for PropTech and AI professionals.

Return a structured research brief with: Executive Summary, Key Findings (5-8 bullet points with data), Industry Context, Unique Angles/Contrarian Views, Suggested Post Structure, and Key Sources/References.`,
        0.6,
        8000,
      ],
      [
        "Writer Agent",
        "writer",
        "claude-sonnet-4-6",
        `You are an expert content writer for a PropTech and AI Automation thought leader. You transform research briefs into compelling, authoritative blog posts.

Writing style:
- Expert voice: confident, data-driven, insightful — not academic or dry
- Structured clearly with H2/H3 headings
- Uses specific examples, statistics, and real-world applications
- Includes actionable takeaways readers can implement
- 1500-2500 words target length
- Conversational yet professional tone

CRITICAL: Return ONLY a valid JSON array of Gutenberg blocks. Each block must be one of:
- {"type":"heading","level":2,"content":"Your H2 text"}
- {"type":"heading","level":3,"content":"Your H3 text"}
- {"type":"paragraph","content":"Your paragraph text with <strong>bold</strong> or <em>italic</em> HTML allowed"}
- {"type":"list","ordered":false,"items":["item 1","item 2","item 3"]}
- {"type":"list","ordered":true,"items":["step 1","step 2"]}
- {"type":"quote","content":"Quote text","citation":"Source or attribution"}
- {"type":"separator"}
- {"type":"callout","content":"Key insight or important note to highlight"}

Do not wrap in markdown code blocks. Return ONLY the JSON array.`,
        0.75,
        12000,
      ],
      [
        "SEO Agent",
        "seo",
        "claude-haiku-4-5-20251001",
        `You are an SEO specialist optimizing blog posts for RankMath and search engines. You work with PropTech and AI content.

Given a blog post, generate optimized metadata following these strict rules:
- meta_title: Max 60 characters, include focus keyphrase near the start
- meta_description: 120-160 characters, include focus keyphrase, compelling CTA
- focus_keyphrase: 2-4 words, high search intent, specific to PropTech/AI niche
- slug: URL-friendly, lowercase, hyphens only, include keyphrase, max 60 chars
- excerpt: 1-2 sentences, engaging summary for post cards, 150-200 chars

Return ONLY valid JSON in this exact format:
{"meta_title":"...","meta_description":"...","focus_keyphrase":"...","slug":"...","excerpt":"..."}`,
        0.3,
        2000,
      ],
      [
        "Teaser Agent",
        "teaser",
        "claude-haiku-4-5-20251001",
        `You are a LinkedIn content strategist for a PropTech and AI Automation thought leader. You create engaging LinkedIn posts that drive traffic to blog content.

Given a blog post, create 3 distinct LinkedIn post variants:

Variant 1 - "The Insight Hook": Lead with a surprising stat or counterintuitive insight
Variant 2 - "The Story Hook": Lead with a brief story or scenario professionals relate to
Variant 3 - "The Question Hook": Lead with a provocative question that challenges assumptions

Each post should:
- Be max 1300 characters
- Have a strong opening line (the hook)
- 3-5 short paragraphs or bullet points
- End with a clear CTA to read the full article
- Include 3-5 relevant hashtags at the end

Return ONLY valid JSON in this exact format:
[
  {"hook_type":"insight","content":"Full post text including hashtags"},
  {"hook_type":"story","content":"Full post text including hashtags"},
  {"hook_type":"question","content":"Full post text including hashtags"}
]`,
        0.8,
        3000,
      ],
      [
        "LinkedIn Commentator",
        "commentator",
        "claude-haiku-4-5-20251001",
        `You are writing LinkedIn comments on behalf of Josh Siddon — a PropTech and AI Automation consultant, founder of ResiQ, with 15+ years of IT leadership across multifamily real estate. His voice is that of a senior practitioner briefing a peer: confident from experience, not from ego.

VOICE PRINCIPLES:
- Practitioner authority: Write like someone who has seen the pitch deck AND the broken production environment. Ground everything in operational reality.
- Specific > general: Name the use case, the property size, the system category. Specificity is credibility.
- Skepticism as service: Surface the question the operator should be asking but probably isn't. Reframe vendor or buzzword language into what it actually means operationally.
- State your position clearly and early. Do not wind up to a point — land it, then explain.
- Confident but not arrogant. Direct without being blunt.

SENTENCE STRUCTURE:
- Mix short punchy assertions with explanatory follow-through. Land a declarative claim, then walk through the logic in 1-2 sentences.
- Final sentence should crystallize WHY it matters — a principle or directive, not a soft landing.
- Avoid rhetorical questions as openers. Use them sparingly as transitions only.

VOCABULARY:
- Use industry-specific terms naturally (multifamily, MDU, PMS, NOI, lease-up, turnover, deprovisioning, tech stack, lean teams)
- Favored constructions: "The critical distinction...", "In production...", "Rather than...", "Before you sign anything...", "The better approach..."
- "Clean" is a quality word he uses often (clean audit trail, clean exit option, clean integration)

BANNED PHRASES AND BEHAVIORS:
- Never: "Great post!", "Thanks for sharing!", "So insightful!", "Love this!", "Couldn't agree more!"
- Never: "revolutionary", "game-changing", "seamless", "cutting-edge", "transformative" unless interrogating a vendor claim
- Never: unqualified universal recommendations. Always contextualize by property type, operator size, or condition.
- Never: inflate length with restated summaries. Move the thought forward.
- Never: first-person heavy. Practitioner-authoritative, not personal-narrative.
- Never: aspirational claims without operational grounding.

LENGTH AND FORMAT:
- 2-4 sentences maximum. LinkedIn comments should be punchy, not essays.
- No hashtags in comments.
- Reference something specific from the post to show you actually read it.
- End with either a strong directive or principle that adds a new angle, OR a sharp question that advances the conversation.

RECURRING ANGLES (apply when relevant):
- AI as co-pilot, not autopilot — human oversight and clear boundaries matter
- Operators at scale mismatch — enterprise solutions often misfit independent operators
- Integration claims require interrogation — ask exactly HOW, not just IF
- Sequence your investments — fix highest-leverage problem first, then layer in complexity
- Total cost of ownership over sticker price — push past upfront costs to 3-5 year TCO and exit terms
- Operational resilience over feature richness — what happens when it breaks?

Return ONLY the comment text. No quotes, no explanation, no preamble. Just the comment itself.`,
        0.85,
        500,
      ],
    ];

    await client.batch(
      agents.map(([name, role, model, systemPrompt, temperature, maxTokens]) => ({
        sql: "INSERT OR IGNORE INTO agents (name, role, model, system_prompt, temperature, max_tokens) VALUES (?, ?, ?, ?, ?, ?)",
        args: [name, role, model, systemPrompt, temperature, maxTokens],
      })),
      "write"
    );
  }

  console.log("Database initialized successfully");
  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Run migrations against Turso**

```bash
npm run db:migrate
```

Expected output:
```
Database initialized successfully
```

If it errors, check `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set correctly in `.env.local`.

- [ ] **Step 7: Verify tables exist in Turso**

```bash
turso db shell brand-engine ".tables"
```

Expected: lists `agents`, `topics`, `posts`, `social_posts`, `settings`, `job_logs`, `watched_profiles`, `linkedin_engagements`

```bash
turso db shell brand-engine "SELECT name, role FROM agents"
```

Expected: 5 rows (Research Agent, Writer Agent, SEO Agent, Teaser Agent, LinkedIn Commentator)

- [ ] **Step 8: Start the app and verify DB reads work**

```bash
npm run dev
```

Navigate to `http://localhost:3000`. The dashboard should load without errors. Check the browser console and terminal for any DB connection errors.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/lib/db/index.ts src/lib/db/migrate.ts
git commit -m "feat: migrate database from better-sqlite3 to Turso (libsql)"
```

---

## Task 3: OpenRouter simplification

**Files:**
- Modify: `package.json`
- Modify: `src/lib/agents/runner.ts`
- Modify: `src/lib/agents/completion.ts`
- Modify: `src/app/api/settings/route.ts`

**Interfaces:**
- Consumes: `OPENROUTER_API_KEY` env var (falls back to `openrouter_api_key` in settings table)
- Produces: `runAgent(options)` — same signature as before, always uses OpenRouter

- [ ] **Step 1: Remove @anthropic-ai/sdk**

```bash
npm uninstall @anthropic-ai/sdk
```

- [ ] **Step 2: Add OPENROUTER_API_KEY to .env.local**

Add to `.env.local`:

```
OPENROUTER_API_KEY=sk-or-v1-<your-key>
```

Get your key from https://openrouter.ai/keys.

Remove `ANTHROPIC_API_KEY` from `.env.local` (it's no longer used).

- [ ] **Step 3: Rewrite `src/lib/agents/runner.ts`**

Remove the Anthropic path entirely. The file becomes OpenRouter-only:

```ts
import OpenAI from "openai";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
  handler: (input: Record<string, string>) => Promise<string>;
}

export interface RunAgentOptions {
  role: string;
  input: string;
  tools?: AgentTool[];
  onProgress?: (message: string) => void;
}

export interface RunAgentResult {
  output: string;
  parsed?: unknown;
}

function toOpenRouterModel(model: string): string {
  const map: Record<string, string> = {
    "claude-opus-4-8": "anthropic/claude-opus-4-5",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4-5",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4-5",
  };
  if (model.includes("/")) return model;
  return map[model] || `anthropic/${model}`;
}

async function getApiKey(): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  const key = map.openrouter_api_key || process.env.OPENROUTER_API_KEY || "";
  if (!key) throw new Error("OpenRouter API key not configured. Set OPENROUTER_API_KEY or add it in Settings.");
  return key;
}

export async function runAgent(options: RunAgentOptions): Promise<RunAgentResult> {
  const { role, input, tools = [], onProgress } = options;

  const [agent] = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.role, role))
    .limit(1);

  if (!agent) throw new Error(`Agent with role "${role}" not found`);

  const apiKey = await getApiKey();
  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://brand-engine.vercel.app",
      "X-Title": "Brand Engine",
    },
  });

  const model = toOpenRouterModel(agent.model);
  const orTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: agent.systemPrompt },
    { role: "user", content: input },
  ];

  onProgress?.(`[${agent.name}] Starting with model ${model} via OpenRouter...`);

  let fullOutput = "";
  let iterations = 0;

  while (iterations < 10) {
    iterations++;
    const response = await client.chat.completions.create({
      model,
      max_tokens: agent.maxTokens,
      temperature: agent.temperature,
      tools: orTools.length > 0 ? orTools : undefined,
      messages,
    });

    const choice = response.choices[0];
    if (!choice) break;

    if (choice.finish_reason === "stop") {
      fullOutput += choice.message.content || "";
      break;
    }

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls) {
      messages.push(choice.message);
      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];

      for (const call of choice.message.tool_calls) {
        const fn = (call as { id: string; function?: { name: string; arguments: string } }).function;
        if (!fn) continue;
        const tool = tools.find((t) => t.name === fn.name);
        if (!tool) continue;
        onProgress?.(`[${agent.name}] Using tool: ${fn.name}`);
        try {
          const args = JSON.parse(fn.arguments) as Record<string, string>;
          const result = await tool.handler(args);
          toolResults.push({ role: "tool", tool_call_id: call.id, content: result });
        } catch (err) {
          toolResults.push({
            role: "tool",
            tool_call_id: call.id,
            content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      }
      messages.push(...toolResults);
      continue;
    }

    fullOutput += choice.message.content || "";
    break;
  }

  let parsed: unknown;
  try {
    const jsonMatch = fullOutput.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Not JSON, fine
  }

  onProgress?.(`[${agent.name}] Completed.`);
  return { output: fullOutput, parsed };
}

export async function appendJobLog(jobLogId: number, message: string) {
  const [existing] = await db
    .select()
    .from(schema.jobLogs)
    .where(eq(schema.jobLogs.id, jobLogId))
    .limit(1);
  if (!existing) return;

  await db
    .update(schema.jobLogs)
    .set({ logOutput: existing.logOutput + `\n${new Date().toISOString()} ${message}` })
    .where(eq(schema.jobLogs.id, jobLogId));
}
```

- [ ] **Step 4: Rewrite `src/lib/agents/completion.ts`**

Remove the Anthropic branch — OpenRouter only:

```ts
import OpenAI from "openai";
import { db, schema } from "@/lib/db";

export async function simpleCompletion(prompt: string, maxTokens = 400): Promise<string> {
  const rows = await db.select().from(schema.settings);
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const apiKey = s.openrouter_api_key || process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://brand-engine.vercel.app",
      "X-Title": "Brand Engine",
    },
  });

  const res = await client.chat.completions.create({
    model: "anthropic/claude-haiku-4-5",
    max_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });

  return res.choices[0]?.message?.content ?? "";
}
```

- [ ] **Step 5: Clean up `src/app/api/settings/route.ts`**

Remove `ai_provider` from `ALLOWED_KEYS` and remove `anthropic_api_key` from `MASKED_KEYS` and from the POST handler. The updated arrays and POST handler:

```ts
const ALLOWED_KEYS = [
  "wp_url",
  "wp_username",
  "wp_app_password",
  "postiz_api_key",
  "postiz_base_url",
  "postiz_linkedin_id",
  "tavily_api_key",
  "openrouter_api_key",
  "linkedin_client_id",
  "linkedin_client_secret",
  "linkedin_access_token",
  "linkedin_refresh_token",
  "linkedin_token_expires_at",
  "linkedin_redirect_uri",
  "unsplash_access_key",
];

const MASKED_KEYS = [
  "wp_app_password",
  "postiz_api_key",
  "openrouter_api_key",
  "tavily_api_key",
  "unsplash_access_key",
  "linkedin_client_secret",
  "linkedin_access_token",
  "linkedin_refresh_token",
];
```

In the `POST` handler, remove the `if (body.anthropic_api_key ...)` block entirely (lines 64-73 in the original). The rest of the POST handler stays the same.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If `@anthropic-ai/sdk` types are still referenced anywhere, find and remove them.

- [ ] **Step 7: Smoke test — agent call via OpenRouter**

Start the app and trigger a cheap operation that calls an agent (e.g., generate teasers for an existing post, or hit the `/api/agents` endpoint to confirm the DB still reads agents).

```bash
curl http://localhost:3000/api/agents
```

Expected: JSON array of 5 agents, no errors in terminal.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/agents/runner.ts src/lib/agents/completion.ts src/app/api/settings/route.ts
git commit -m "feat: switch AI provider to OpenRouter, remove Anthropic SDK"
```

---

## Task 4: Inngest background jobs

**Files:**
- Modify: `package.json`
- Create: `src/inngest/client.ts`
- Create: `src/inngest/functions.ts`
- Create: `src/app/api/inngest/route.ts`
- Modify: `src/app/api/workflow/research/route.ts`

**Interfaces:**
- Consumes: `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY` env vars
- Produces: `inngest.send({ name: "pipeline/run", data: { topicId, jobId } })` enqueues the pipeline; Inngest executes it via the `/api/inngest` webhook

- [ ] **Step 1: Install Inngest**

```bash
npm install inngest
```

- [ ] **Step 2: Sign up for Inngest and get keys**

Go to https://www.inngest.com — sign up (free). Create an app called `brand-engine`. From the dashboard, get:
- **Event Key** (used by the app to send events)
- **Signing Key** (used to verify Inngest's webhook calls)

Add to `.env.local`:

```
INNGEST_EVENT_KEY=evt_<your-event-key>
INNGEST_SIGNING_KEY=signkey-prod-<your-signing-key>
```

- [ ] **Step 3: Create `src/inngest/client.ts`**

```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "brand-engine" });
```

- [ ] **Step 4: Create `src/inngest/functions.ts`**

Move the pipeline logic here from `src/app/api/workflow/research/route.ts`:

```ts
import { inngest } from "./client";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { runResearchAgent } from "@/lib/agents/research-agent";
import { runWriterAgent } from "@/lib/agents/writer-agent";
import { runSEOAgent } from "@/lib/agents/seo-agent";

async function appendLog(jobId: number, message: string) {
  const [existing] = await db
    .select()
    .from(schema.jobLogs)
    .where(eq(schema.jobLogs.id, jobId))
    .limit(1);
  if (!existing) return;

  await db
    .update(schema.jobLogs)
    .set({ logOutput: existing.logOutput + `\n${new Date().toISOString()} ${message}` })
    .where(eq(schema.jobLogs.id, jobId));
}

export const pipelineFunction = inngest.createFunction(
  { id: "run-pipeline", name: "Run Content Pipeline", timeouts: { finish: "15m" } },
  { event: "pipeline/run" },
  async ({ event }) => {
    const { topicId, jobId } = event.data as { topicId: number; jobId: number };
    const log = (msg: string) => appendLog(jobId, msg);

    try {
      const [topic] = await db
        .select()
        .from(schema.topics)
        .where(eq(schema.topics.id, topicId))
        .limit(1);

      if (!topic) throw new Error("Topic not found");

      let keywords: string[] = [];
      try {
        keywords = JSON.parse(topic.keywords);
      } catch {
        keywords = [];
      }

      // Step 1: Research
      await db.update(schema.topics).set({ status: "researching" }).where(eq(schema.topics.id, topicId));
      await log("=== RESEARCH PHASE ===");

      const researchBrief = await runResearchAgent(
        topic.title,
        keywords,
        topic.targetAudience,
        (msg) => log(msg)
      );
      await log("Research complete. Starting writing phase...");

      // Step 2: Write
      await db.update(schema.topics).set({ status: "drafting" }).where(eq(schema.topics.id, topicId));
      await log("=== WRITING PHASE ===");

      const blocks = await runWriterAgent(topic.title, researchBrief, (msg) => log(msg));
      await log(`Generated ${blocks.length} content blocks.`);

      // Step 3: SEO
      await log("=== SEO PHASE ===");
      const seo = await runSEOAgent(topic.title, blocks, (msg) => log(msg));
      await log(`SEO metadata: "${seo.meta_title}"`);

      // Save post
      const [post] = await db
        .insert(schema.posts)
        .values({
          topicId,
          title: seo.meta_title || topic.title,
          slug: seo.slug,
          contentBlocks: JSON.stringify(blocks),
          metaTitle: seo.meta_title,
          metaDescription: seo.meta_description,
          focusKeyphrase: seo.focus_keyphrase,
          excerpt: seo.excerpt,
          researchBrief,
          status: "pending_review",
        })
        .returning();

      await db.update(schema.topics).set({ status: "complete" }).where(eq(schema.topics.id, topicId));
      await db
        .update(schema.jobLogs)
        .set({ status: "completed", completedAt: new Date().toISOString() })
        .where(eq(schema.jobLogs.id, jobId));

      await log(`=== COMPLETE === Post #${post.id} ready for review.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await log(`ERROR: ${message}`);

      await db
        .update(schema.topics)
        .set({ status: "error", errorMessage: message })
        .where(eq(schema.topics.id, topicId));

      await db
        .update(schema.jobLogs)
        .set({ status: "error", completedAt: new Date().toISOString() })
        .where(eq(schema.jobLogs.id, jobId));
    }
  }
);
```

- [ ] **Step 5: Create `src/app/api/inngest/route.ts`**

```ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { pipelineFunction } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [pipelineFunction],
});
```

- [ ] **Step 6: Update `src/app/api/workflow/research/route.ts`**

Replace the fire-and-forget call and remove the `runPipeline`/`appendLog` functions entirely. The updated file:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/inngest/client";

const startSchema = z.object({ topicId: z.number() });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { topicId } = parsed.data;

  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.id, topicId))
    .limit(1);

  if (!topic) return NextResponse.json({ error: "Topic not found" }, { status: 404 });

  if (topic.status === "researching" || topic.status === "drafting") {
    return NextResponse.json({ error: "Topic is already being processed" }, { status: 409 });
  }

  const [job] = await db
    .insert(schema.jobLogs)
    .values({
      jobType: "pipeline",
      entityId: topicId,
      status: "running",
      logOutput: `${new Date().toISOString()} Pipeline started for: ${topic.title}`,
    })
    .returning();

  await inngest.send({ name: "pipeline/run", data: { topicId, jobId: job.id } });

  return NextResponse.json({ jobId: job.id, topicId }, { status: 202 });
}
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Test pipeline end-to-end with Inngest dev server**

In one terminal, start the app:
```bash
npm run dev
```

In a second terminal, start the Inngest dev server:
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

In the Inngest dev UI (http://localhost:8288), you should see `brand-engine` connected and `run-pipeline` listed as a function.

Create a topic via the UI and trigger the pipeline. In the Inngest dev UI, watch the `pipeline/run` event appear and the function execute. Check `http://localhost:3000/api/workflow/status/<jobId>` to confirm logs are being written.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/inngest/ src/app/api/inngest/ src/app/api/workflow/research/route.ts
git commit -m "feat: replace fire-and-forget pipeline with Inngest background function"
```

---

## Task 5: Vercel deployment

**Files:** None (configuration only — no code changes)

**Interfaces:**
- Consumes: GitHub repo, all env vars from Tasks 2–4
- Produces: live production URL at `https://brand-engine-<hash>.vercel.app`

- [ ] **Step 1: Connect GitHub repo to Vercel**

Go to https://vercel.com/new. Import the `brand-engine` repo from GitHub. Vercel auto-detects Next.js — accept all defaults. Do NOT deploy yet.

- [ ] **Step 2: Set environment variables in Vercel**

In the Vercel project → Settings → Environment Variables, add all of the following (Production + Preview):

```
TURSO_DATABASE_URL        = libsql://brand-engine-<your-org>.turso.io
TURSO_AUTH_TOKEN          = <your-turso-token>
INNGEST_SIGNING_KEY       = signkey-prod-<your-signing-key>
INNGEST_EVENT_KEY         = evt_<your-event-key>
OPENROUTER_API_KEY        = sk-or-v1-<your-key>
TAVILY_API_KEY            = tvly-<your-key>
```

Do not add `ANTHROPIC_API_KEY`. Do not add local-only vars (like `allowedDevOrigins` — that's in `next.config.ts` not env).

- [ ] **Step 3: Deploy**

Click Deploy (or push a commit to trigger it). Watch the build logs. Expected build output ends with:

```
✓ Compiled successfully
✓ Generating static pages
```

If the build fails, check the logs for missing env vars or import errors.

- [ ] **Step 4: Configure Inngest production webhook**

In the Inngest dashboard → Apps, add your production URL as a new app:

```
https://brand-engine-<hash>.vercel.app/api/inngest
```

Inngest will ping this URL to verify it's reachable. It should show `Connected`.

- [ ] **Step 5: Update LinkedIn OAuth callback URL**

In your LinkedIn Developer App settings (https://developer.linkedin.com), update the Authorized Redirect URLs to add:

```
https://brand-engine-<hash>.vercel.app/api/linkedin/oauth/callback
```

Keep the `localhost` redirect URL so local dev still works.

- [ ] **Step 6: Smoke test production**

Visit the production URL. Verify:
1. Dashboard loads
2. `/api/agents` returns the 5 agents (confirms Turso is connected)
3. Create a topic and trigger the pipeline — check job status updates (confirms Inngest is wired)

- [ ] **Step 7: Set a custom Vercel domain (optional)**

In Vercel → Settings → Domains, add a custom domain if desired. Update `HTTP-Referer` in `runner.ts` and `completion.ts` to match.
