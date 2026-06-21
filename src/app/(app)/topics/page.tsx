"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Plus, Play, Trash2, Loader2, X, InboxIcon, ExternalLink } from "lucide-react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

type TopicStatus = "queued" | "researching" | "drafting" | "complete" | "error";

interface Topic {
  id: number;
  title: string;
  keywords: string; // JSON string[]
  targetAudience: string;
  status: TopicStatus;
  errorMessage: string | null;
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOPIC_STATUS_STYLES: Record<TopicStatus, string> = {
  queued: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
  researching: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300",
  drafting: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  error: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
};

function parseKeywords(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return raw ? raw.split(",").map((k) => k.trim()).filter(Boolean) : [];
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Keyword input ─────────────────────────────────────────────────────────────

interface KeywordInputProps {
  value: string[];
  onChange: (kws: string[]) => void;
}

function KeywordInput({ value, onChange }: KeywordInputProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addKeyword(raw: string) {
    const parts = raw.split(",").map((k) => k.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.includes(p)) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function removeKeyword(kw: string) {
    onChange(value.filter((k) => k !== kw));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className="flex flex-wrap gap-1.5 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((kw) => (
        <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-xs">
          {kw}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeKeyword(kw);
            }}
            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addKeyword(draft)}
        placeholder={value.length === 0 ? "Type keyword and press Enter or comma…" : ""}
        className="flex-1 min-w-[140px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

// ── Job alert ─────────────────────────────────────────────────────────────────

interface StartedJobAlertProps {
  jobId: number;
  onDismiss: () => void;
}

function StartedJobAlert({ jobId, onDismiss }: StartedJobAlertProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
      <p className="text-sm text-emerald-800 dark:text-emerald-300 flex-1">
        Pipeline started! Job{" "}
        <Link href="/" className="font-semibold underline underline-offset-2 inline-flex items-center gap-0.5">
          #{jobId}
          <ExternalLink className="w-3 h-3" />
        </Link>{" "}
        is now running.
      </p>
      <button
        onClick={onDismiss}
        className="shrink-0 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [runningTopics, setRunningTopics] = useState<Set<number>>(new Set());
  const [deletingTopics, setDeletingTopics] = useState<Set<number>>(new Set());
  const [startedJob, setStartedJob] = useState<number | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("PropTech and AI professionals");
  const [submitting, setSubmitting] = useState(false);

  async function fetchTopics() {
    try {
      const res = await fetch("/api/topics");
      const data = await res.json();
      setTopics(data);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTopics();
  }, []);

  async function handleAddTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), keywords, targetAudience }),
      });
      if (!res.ok) throw new Error("Failed to create topic");

      toast.success("Topic added!");
      setTitle("");
      setKeywords([]);
      setTargetAudience("PropTech and AI professionals");
      setSheetOpen(false);
      fetchTopics();
    } catch {
      toast.error("Failed to add topic. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRunPipeline(topicId: number) {
    setRunningTopics((prev) => new Set(prev).add(topicId));
    try {
      const res = await fetch("/api/workflow/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start pipeline");

      toast.success("Pipeline started!");
      setStartedJob(data.jobId);
      fetchTopics();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start pipeline";
      toast.error(message);
    } finally {
      setRunningTopics((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  }

  async function handleDelete(topicId: number) {
    if (!confirm("Delete this topic? This action cannot be undone.")) return;

    setDeletingTopics((prev) => new Set(prev).add(topicId));
    try {
      const res = await fetch(`/api/topics?id=${topicId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete topic");

      toast.success("Topic deleted.");
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
    } catch {
      toast.error("Failed to delete topic.");
    } finally {
      setDeletingTopics((prev) => {
        const next = new Set(prev);
        next.delete(topicId);
        return next;
      });
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Research Topics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the topics that feed your content pipeline
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger render={<Button />}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Topic
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Add Research Topic</SheetTitle>
              <SheetDescription>
                Fill in the details below and the pipeline will research and draft a post.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={handleAddTopic} className="mt-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. AI's impact on commercial real estate valuations"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Keywords</Label>
                <KeywordInput value={keywords} onChange={setKeywords} />
                <p className="text-xs text-muted-foreground">
                  Press <kbd className="px-1 py-0.5 rounded border text-[10px]">Enter</kbd> or{" "}
                  <kbd className="px-1 py-0.5 rounded border text-[10px]">,</kbd> to add a keyword
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="audience">Target Audience</Label>
                <Input
                  id="audience"
                  placeholder="PropTech and AI professionals"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <Button type="submit" className="w-full" disabled={submitting || !title.trim()}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add Topic
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* Job alert */}
      {startedJob !== null && (
        <StartedJobAlert jobId={startedJob} onDismiss={() => setStartedJob(null)} />
      )}

      {/* Topics table */}
      {loading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <Skeleton className="h-4 w-64" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-24 ml-auto" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : topics.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <InboxIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base mb-1">No topics yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add your first research topic to get started. The pipeline will research, write, and
              SEO-optimize a post automatically.
            </p>
            <Button className="mt-5" onClick={() => setSheetOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add your first topic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Title</TableHead>
                  <TableHead>Keywords</TableHead>
                  <TableHead className="hidden md:table-cell">Audience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topics.map((topic) => {
                  const kws = parseKeywords(topic.keywords);
                  const isRunning = runningTopics.has(topic.id);
                  const isDeleting = deletingTopics.has(topic.id);
                  const pipelineActive =
                    topic.status === "researching" || topic.status === "drafting";

                  return (
                    <TableRow key={topic.id}>
                      <TableCell className="font-medium max-w-[280px]">
                        <p className="truncate">{topic.title}</p>
                        {topic.errorMessage && (
                          <p className="text-xs text-destructive mt-0.5 truncate">
                            {topic.errorMessage}
                          </p>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {kws.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <>
                              {kws.slice(0, 3).map((kw) => (
                                <Badge key={kw} variant="secondary" className="text-xs">
                                  {kw}
                                </Badge>
                              ))}
                              {kws.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{kws.length - 3}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm text-muted-foreground truncate max-w-[160px] block">
                          {topic.targetAudience}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize text-xs whitespace-nowrap",
                            TOPIC_STATUS_STYLES[topic.status],
                          )}
                        >
                          {topic.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {formatDate(topic.createdAt)}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRunning || pipelineActive || topic.status === "complete"}
                            onClick={() => handleRunPipeline(topic.id)}
                          >
                            {isRunning || pipelineActive ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                {pipelineActive ? "Running…" : "Starting…"}
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 mr-1.5" />
                                Run Pipeline
                              </>
                            )}
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={isDeleting}
                            onClick={() => handleDelete(topic.id)}
                          >
                            {isDeleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
