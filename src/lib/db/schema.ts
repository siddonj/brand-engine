import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const agents = sqliteTable("agents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  role: text("role").notNull(), // research | writer | seo | teaser
  model: text("model").notNull().default("claude-sonnet-4-6"),
  systemPrompt: text("system_prompt").notNull(),
  temperature: real("temperature").notNull().default(0.7),
  maxTokens: integer("max_tokens").notNull().default(8000),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const topics = sqliteTable("topics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  keywords: text("keywords").notNull().default("[]"), // JSON string[]
  targetAudience: text("target_audience").notNull().default("PropTech and AI professionals"),
  status: text("status").notNull().default("queued"), // queued|researching|drafting|complete|error
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  topicId: integer("topic_id").references(() => topics.id),
  title: text("title").notNull().default(""),
  slug: text("slug").notNull().default(""),
  contentBlocks: text("content_blocks").notNull().default("[]"), // JSON GutenbergBlock[]
  metaTitle: text("meta_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  focusKeyphrase: text("focus_keyphrase").notNull().default(""),
  excerpt: text("excerpt").notNull().default(""),
  researchBrief: text("research_brief").notNull().default(""),
  status: text("status").notNull().default("drafting"), // drafting|pending_review|approved|published|rejected
  wordpressDraftId: integer("wordpress_draft_id"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  approvedAt: text("approved_at"),
  publishedAt: text("published_at"),
});

export const socialPosts = sqliteTable("social_posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id").references(() => posts.id),
  platform: text("platform").notNull().default("linkedin"),
  content: text("content").notNull(),
  hashtags: text("hashtags").notNull().default("[]"), // JSON string[]
  status: text("status").notNull().default("pending"), // pending|scheduled|posted
  postizPostId: text("postiz_post_id"),
  scheduledAt: text("scheduled_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const jobLogs = sqliteTable("job_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobType: text("job_type").notNull(), // research|write|seo|teaser|publish
  entityId: integer("entity_id").notNull(),
  status: text("status").notNull().default("running"), // running|completed|error
  logOutput: text("log_output").notNull().default(""),
  startedAt: text("started_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

export const watchedProfiles = sqliteTable("watched_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  linkedinUrl: text("linkedin_url").notNull(),
  linkedinPersonUrn: text("linkedin_person_urn").notNull().default(""),
  notes: text("notes").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastScannedAt: text("last_scanned_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const linkedinEngagements = sqliteTable("linkedin_engagements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id").references(() => watchedProfiles.id),
  postUrn: text("post_urn").notNull(),
  postUrl: text("post_url").notNull().default(""),
  postSnippet: text("post_snippet").notNull().default(""),
  commentText: text("comment_text").notNull().default(""),
  status: text("status").notNull().default("pending"), // pending|posted|failed|skipped
  composioResult: text("composio_result").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  postedAt: text("posted_at"),
});

export type WatchedProfile = typeof watchedProfiles.$inferSelect;
export type LinkedinEngagement = typeof linkedinEngagements.$inferSelect;

export type Agent = typeof agents.$inferSelect;
export type InsertAgent = typeof agents.$inferInsert;
export type Topic = typeof topics.$inferSelect;
export type InsertTopic = typeof topics.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type InsertPost = typeof posts.$inferInsert;
export type SocialPost = typeof socialPosts.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type JobLog = typeof jobLogs.$inferSelect;
