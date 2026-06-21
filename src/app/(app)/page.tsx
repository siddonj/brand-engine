"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricsBar } from "@/components/dashboard/MetricsBar";
import { cn } from "@/lib/utils";
import { Plus, Terminal, InboxIcon } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type PostStatus = "drafting" | "pending_review" | "approved" | "published" | "rejected";
type TopicStatus = "queued" | "researching" | "drafting" | "complete" | "error";

interface Post {
  id: number;
  title: string;
  status: PostStatus;
  createdAt: string;
}

interface Topic {
  id: number;
  title: string;
  status: TopicStatus;
  createdAt: string;
}

interface JobLog {
  id: number;
  jobType: string;
  entityId: number;
  status: "running" | "completed" | "error";
  logOutput: string;
  startedAt: string;
  completedAt: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const POST_STATUS_STYLES: Record<PostStatus, string> = {
  drafting: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
  pending_review: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
  published: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
};

const TOPIC_STATUS_STYLES: Record<TopicStatus, string> = {
  queued: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300",
  researching: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/40 dark:text-violet-300",
  drafting: "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300",
  complete: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
  error: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Live Log Viewer ───────────────────────────────────────────────────────────

function LiveLogViewer({ jobId }: { jobId: number }) {
  const [lines, setLines] = useState<string>("");
  const [status, setStatus] = useState<string>("running");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/workflow/status/${jobId}`);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "log" && data.full) {
        setLines(data.full);
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 0);
      }
      if (data.type === "status") {
        setStatus(data.status);
        if (data.status === "completed" || data.status === "error") {
          es.close();
        }
      }
    };

    es.onerror = () => es.close();

    return () => es.close();
  }, [jobId]);

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700">
        <Terminal className="w-3.5 h-3.5 text-zinc-400" />
        <span className="text-xs text-zinc-400 font-mono">job #{jobId}</span>
        <span
          className={cn(
            "ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full",
            status === "running" && "bg-violet-500/20 text-violet-300",
            status === "completed" && "bg-emerald-500/20 text-emerald-300",
            status === "error" && "bg-red-500/20 text-red-300",
          )}
        >
          {status}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="bg-black text-green-400 font-mono text-xs p-3 h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed"
      >
        {lines || "Waiting for output…"}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [jobs, setJobs] = useState<JobLog[]>([]);
  const [loading, setLoading] = useState(true);

  const activeJobs = jobs.filter((j) => j.status === "running");

  async function fetchData() {
    try {
      const [postsRes, topicsRes, jobsRes] = await Promise.all([
        fetch("/api/posts"),
        fetch("/api/topics"),
        fetch("/api/workflow/jobs"),
      ]);
      const [postsData, topicsData, jobsData] = await Promise.all([
        postsRes.json(),
        topicsRes.json(),
        jobsRes.json(),
      ]);
      setPosts(postsData);
      setTopics(topicsData);
      setJobs(jobsData);
    } catch {
      // silently handle fetch errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Metrics
  const totalPosts = posts.length;
  const pendingReview = posts.filter((p) => p.status === "pending_review").length;
  const published = posts.filter((p) => p.status === "published").length;

  const recentPosts = [...posts].slice(0, 5);
  const recentTopics = [...topics].slice(0, 6);

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your PropTech &amp; AI content pipeline at a glance
          </p>
        </div>
        <Button render={<Link href="/topics" />} nativeButton={false}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Topic
        </Button>
      </div>

      {/* Metrics */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-28" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <MetricsBar
          totalPosts={totalPosts}
          pendingReview={pendingReview}
          activeJobs={activeJobs.length}
          published={published}
        />
      )}

      {/* Active Pipeline */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Active Pipeline</h2>
        {loading ? (
          <Card>
            <CardContent className="p-5 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        ) : activeJobs.length === 0 ? (
          <Card>
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Terminal className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">No active jobs</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start a pipeline from the{" "}
                <Link href="/topics" className="text-primary underline underline-offset-2">
                  Topics
                </Link>{" "}
                page.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeJobs.map((job) => (
              <Card key={job.id}>
                <CardHeader className="pb-3 pt-4 px-5">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                    Pipeline running — entity #{job.entityId}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">
                      Started {formatDate(job.startedAt)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <LiveLogViewer jobId={job.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent Posts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Posts</h2>
          <Button variant="ghost" size="sm" render={<Link href="/posts" />} nativeButton={false}>
            View all
          </Button>
        </div>

        {loading ? (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3.5">
                    <Skeleton className="h-4 w-56" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : recentPosts.length === 0 ? (
          <Card>
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <InboxIcon className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">No posts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Posts are generated automatically once a pipeline completes.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {recentPosts.map((post) => (
                  <div key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors">
                    <p className="flex-1 text-sm font-medium truncate">{post.title || "Untitled"}</p>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 capitalize text-xs", POST_STATUS_STYLES[post.status])}
                    >
                      {post.status.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
                      {formatDate(post.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Recent Topics */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Topics</h2>
          <Button variant="ghost" size="sm" render={<Link href="/topics" />} nativeButton={false}>
            View all
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-5 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : recentTopics.length === 0 ? (
          <Card>
            <CardContent className="p-8 flex flex-col items-center justify-center text-center">
              <p className="font-medium text-sm">No topics yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                <Link href="/topics" className="text-primary underline underline-offset-2">
                  Add your first topic
                </Link>{" "}
                to kick off the engine.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentTopics.map((topic) => (
              <Card key={topic.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <p className="text-sm font-medium leading-snug mb-2 line-clamp-2">{topic.title}</p>
                  <Badge
                    variant="outline"
                    className={cn("capitalize text-xs", TOPIC_STATUS_STYLES[topic.status])}
                  >
                    {topic.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
