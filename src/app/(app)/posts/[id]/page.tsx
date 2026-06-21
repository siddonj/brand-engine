"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ExternalLink,
  CalendarCheck,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---- Types ----
type Post = {
  id: number;
  topicId: number | null;
  title: string;
  slug: string;
  contentBlocks: string;
  metaTitle: string;
  metaDescription: string;
  focusKeyphrase: string;
  excerpt: string;
  status: "drafting" | "pending_review" | "approved" | "published" | "rejected";
  wordpressDraftId: number | null;
  createdAt: string;
  approvedAt: string | null;
};

type GutenbergBlock = {
  type: "paragraph" | "heading" | "list" | "quote" | "separator" | "callout";
  content?: string;
  level?: 2 | 3;
  ordered?: boolean;
  items?: string[];
  citation?: string;
};

type LinkedInTeaser = {
  hook_type: "insight" | "story" | "question";
  content: string;
};

// ---- Gutenberg Renderer ----
function renderBlock(block: GutenbergBlock, idx: number) {
  switch (block.type) {
    case "paragraph":
      return (
        <p key={idx} className="text-sm leading-7 text-foreground/90 mb-3">
          {block.content}
        </p>
      );
    case "heading":
      if (block.level === 2) {
        return (
          <h2 key={idx} className="font-bold text-2xl mt-6 mb-3 text-foreground">
            {block.content}
          </h2>
        );
      }
      return (
        <h3 key={idx} className="font-semibold text-xl mt-5 mb-2 text-foreground">
          {block.content}
        </h3>
      );
    case "list":
      if (block.ordered) {
        return (
          <ol key={idx} className="list-decimal ml-4 mb-3 space-y-1">
            {(block.items ?? []).map((item, i) => (
              <li key={i} className="text-sm leading-6 text-foreground/90">
                {item}
              </li>
            ))}
          </ol>
        );
      }
      return (
        <ul key={idx} className="list-disc ml-4 mb-3 space-y-1">
          {(block.items ?? []).map((item, i) => (
            <li key={i} className="text-sm leading-6 text-foreground/90">
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          key={idx}
          className="border-l-4 border-primary pl-4 italic my-4 text-sm leading-7 text-foreground/80"
        >
          {block.content}
          {block.citation && (
            <footer className="mt-1 text-xs text-muted-foreground not-italic">
              — {block.citation}
            </footer>
          )}
        </blockquote>
      );
    case "separator":
      return <hr key={idx} className="my-6 border-border" />;
    case "callout":
      return (
        <div
          key={idx}
          className="bg-accent/50 border border-accent rounded-lg p-4 my-4 text-sm leading-7"
        >
          {block.content}
        </div>
      );
    default:
      return null;
  }
}

// ---- Stepper Step ----
type StepStatus = "idle" | "loading" | "done";

function StepIndicator({
  num,
  label,
  status,
}: {
  num: number;
  label: string;
  status: StepStatus;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          status === "done"
            ? "bg-green-500 text-white"
            : status === "loading"
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {status === "done" ? <CheckCircle2 className="w-4 h-4" /> : num}
      </div>
      <span
        className={cn(
          "text-xs font-medium",
          status === "done"
            ? "text-green-600 dark:text-green-400"
            : status === "loading"
            ? "text-primary"
            : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </div>
  );
}

// ---- Main Page ----
export default function PostReviewPage() {
  const params = useParams();
  const postId = params?.id as string;

  // Post state
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<Post["status"]>("drafting");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [focusKeyphrase, setFocusKeyphrase] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");

  // Sync from WordPress
  const [syncing, setSyncing] = useState(false);

  // Step 1: Approve
  const [approveLoading, setApproveLoading] = useState(false);
  const [wpLink, setWpLink] = useState<string | null>(null);

  // Step 2: Teasers
  const [teasersLoading, setTeasersLoading] = useState(false);
  const [teasers, setTeasers] = useState<LinkedInTeaser[]>([]);
  const [selectedTeaser, setSelectedTeaser] = useState<number | null>(null);

  // Step 3: Schedule
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduled, setScheduled] = useState(false);

  useEffect(() => {
    if (!postId) return;
    fetch(`/api/posts/${postId}`)
      .then((r) => r.json())
      .then((data: Post) => {
        setPost(data);
        setTitle(data.title ?? "");
        setStatus(data.status ?? "drafting");
        setMetaTitle(data.metaTitle ?? "");
        setMetaDescription(data.metaDescription ?? "");
        setFocusKeyphrase(data.focusKeyphrase ?? "");
        setSlug(data.slug ?? "");
        setExcerpt(data.excerpt ?? "");
      })
      .catch(() => toast.error("Failed to load post"))
      .finally(() => setLoading(false));
  }, [postId]);

  // Parse blocks
  let blocks: GutenbergBlock[] = [];
  if (post?.contentBlocks) {
    try {
      blocks = JSON.parse(post.contentBlocks);
    } catch {
      blocks = [];
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch(`/api/posts/${postId}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Sync failed");
        return;
      }
      toast.success("Synced from WordPress — reload to see updated content");
      if (data.title) setTitle(data.title);
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: post?.id,
          title,
          metaTitle,
          metaDescription,
          focusKeyphrase,
          excerpt,
          status,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Changes saved");
    } catch {
      toast.error("Failed to save changes");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproveLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Approve failed");
      const data = await res.json();
      setWpLink(data.link ?? null);
      toast.success("Published to WordPress as draft");
    } catch {
      toast.error("Failed to publish to WordPress");
    } finally {
      setApproveLoading(false);
    }
  }

  async function handleGenerateTeasers() {
    setTeasersLoading(true);
    setTeasers([]);
    setSelectedTeaser(null);
    try {
      const res = await fetch(`/api/posts/${postId}/teasers`, { method: "POST" });
      if (!res.ok) throw new Error("Teaser generation failed");
      const data = await res.json();
      setTeasers(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to generate teasers");
    } finally {
      setTeasersLoading(false);
    }
  }

  async function handleSchedule() {
    if (selectedTeaser === null || !teasers[selectedTeaser]) {
      toast.error("Select a teaser first");
      return;
    }
    setScheduleLoading(true);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post?.id,
          content: teasers[selectedTeaser].content,
          hashtags: [],
        }),
      });
      if (!res.ok) throw new Error("Schedule failed");
      setScheduled(true);
      toast.success("Scheduled on LinkedIn!");
    } catch {
      toast.error("Failed to schedule post");
    } finally {
      setScheduleLoading(false);
    }
  }

  // Step statuses
  const step1Status: StepStatus = approveLoading
    ? "loading"
    : wpLink
    ? "done"
    : "idle";
  const step2Status: StepStatus = teasersLoading
    ? "loading"
    : teasers.length > 0
    ? "done"
    : "idle";
  const step3Status: StepStatus = scheduleLoading
    ? "loading"
    : scheduled
    ? "done"
    : "idle";

  // ---- Skeleton ----
  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b border-border">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-96 mt-3" />
        </div>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 p-6 space-y-3 border-r border-border">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="flex-1 p-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Post not found.</p>
        <Link href="/posts">
          <Button variant="outline" className="mt-4 gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Posts
          </Button>
        </Link>
      </div>
    );
  }

  const hookTypeLabel: Record<string, string> = {
    insight: "Insight",
    story: "Story",
    question: "Question",
  };

  const hookTypeColor: Record<string, string> = {
    insight: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    story: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    question:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-4 shrink-0">
        <Link href="/posts">
          <Button variant="ghost" size="sm" className="gap-2 h-7 text-xs">
            <ArrowLeft className="w-3 h-3" /> Back to Posts
          </Button>
        </Link>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-semibold text-foreground line-clamp-1 flex-1">
          {post.title}
        </h1>
        {post.wordpressDraftId && (
          <Button variant="outline" size="sm" className="gap-2 h-7 text-xs shrink-0" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync from WordPress
          </Button>
        )}
      </div>

      {/* Main split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Content Preview */}
        <div className="flex-1 border-r border-border overflow-hidden flex flex-col min-w-0">
          <div className="px-6 py-3 border-b border-border shrink-0">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Content Preview
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-6 max-w-2xl">
              <h1 className="font-bold text-3xl mb-6 text-foreground leading-tight">
                {post.title}
              </h1>
              {blocks.length > 0 ? (
                blocks.map((block, i) => renderBlock(block, i))
              ) : (
                <p className="text-muted-foreground italic text-sm">
                  No content blocks to preview.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Details + Publish Workflow — fixed width, fully scrollable */}
        <div className="w-[420px] shrink-0 overflow-hidden flex flex-col">
          <div className="px-6 py-3 border-b border-border shrink-0">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Post Details
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-6 space-y-5">
              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-medium">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9" />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Post["status"])}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="drafting">Drafting</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SEO */}
              <div className="border border-border rounded-lg p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SEO</p>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="metaTitle" className="text-xs font-medium">Meta Title</Label>
                    <span className={cn("text-[10px]", metaTitle.length > 60 ? "text-red-500" : "text-muted-foreground")}>
                      {metaTitle.length}/60
                    </span>
                  </div>
                  <Input id="metaTitle" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="metaDesc" className="text-xs font-medium">Meta Description</Label>
                    <span className={cn("text-[10px]", metaDescription.length > 160 ? "text-red-500" : "text-muted-foreground")}>
                      {metaDescription.length}/160
                    </span>
                  </div>
                  <Textarea id="metaDesc" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={3} className="resize-none" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="keyphrase" className="text-xs font-medium">Focus Keyphrase</Label>
                  <Input id="keyphrase" value={focusKeyphrase} onChange={(e) => setFocusKeyphrase(e.target.value)} className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="slug" className="text-xs font-medium">Slug</Label>
                  <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} className="h-9 font-mono text-xs" />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="excerpt" className="text-xs font-medium">Excerpt</Label>
                  <Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} className="resize-none" />
                </div>
              </div>

              {/* Save */}
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>

              {/* Publish Workflow */}
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-muted/40 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Publish Workflow</p>
                </div>
                <div className="p-4 space-y-5">
                  {/* Stepper */}
                  <div className="flex items-center gap-2">
                    <StepIndicator num={1} label="WordPress" status={step1Status} />
                    <div className="flex-1 h-px bg-border" />
                    <StepIndicator num={2} label="Teasers" status={step2Status} />
                    <div className="flex-1 h-px bg-border" />
                    <StepIndicator num={3} label="LinkedIn" status={step3Status} />
                  </div>

                  {/* Step 1 */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground/60">Step 1 — Publish to WordPress</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button onClick={handleApprove} disabled={approveLoading || !!wpLink} variant={wpLink ? "outline" : "default"} size="sm" className="gap-2">
                        {approveLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        {wpLink ? "Published" : "Approve & Publish"}
                      </Button>
                      {wpLink && (
                        <a href={wpLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          View draft <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-foreground/60">Step 2 — Generate LinkedIn Teasers</p>
                    <div className="flex items-center gap-2">
                      <Button onClick={handleGenerateTeasers} disabled={teasersLoading} variant="outline" size="sm" className="gap-2">
                        {teasersLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {teasersLoading ? "Generating…" : "Generate Teasers"}
                      </Button>
                      {teasers.length > 0 && !teasersLoading && (
                        <span className="text-xs text-muted-foreground">
                          {selectedTeaser !== null ? "1 selected" : "Select one below"}
                        </span>
                      )}
                    </div>
                    {teasers.length > 0 && (
                      <div className="space-y-2">
                        {teasers.map((t, i) => (
                          <button
                            key={i}
                            onClick={() => setSelectedTeaser(i)}
                            className={cn(
                              "w-full text-left p-3 rounded-lg border text-xs leading-relaxed transition-all",
                              selectedTeaser === i
                                ? "border-primary ring-2 ring-primary/30 bg-primary/5"
                                : "border-border hover:border-primary/50 bg-muted/30"
                            )}
                          >
                            <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium mb-1.5", hookTypeColor[t.hook_type] ?? "bg-muted text-muted-foreground")}>
                              {hookTypeLabel[t.hook_type] ?? t.hook_type}
                            </span>
                            <p>{t.content}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 3 */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground/60">Step 3 — Schedule on LinkedIn</p>
                    <Button
                      onClick={handleSchedule}
                      disabled={scheduleLoading || scheduled || selectedTeaser === null}
                      variant={scheduled ? "outline" : "default"}
                      size="sm"
                      className="gap-2"
                    >
                      {scheduleLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarCheck className="w-3 h-3" />}
                      {scheduled ? "Scheduled!" : "Schedule via Postiz"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
