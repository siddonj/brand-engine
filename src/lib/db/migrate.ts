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
