"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ArrowRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

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

function statusBadgeClass(status: Post["status"]): string {
  switch (status) {
    case "pending_review":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    case "drafting":
      return "bg-muted text-muted-foreground";
    case "approved":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "published":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "rejected":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusLabel(status: Post["status"]): string {
  switch (status) {
    case "pending_review": return "Pending Review";
    case "drafting": return "Drafting";
    case "approved": return "Approved";
    case "published": return "Published";
    case "rejected": return "Rejected";
    default: return status;
  }
}

function PostCard({ post }: { post: Post }) {
  const date = new Date(post.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-semibold leading-snug line-clamp-2">
            {post.title}
          </CardTitle>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
              statusBadgeClass(post.status)
            )}
          >
            {statusLabel(post.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {post.excerpt ? (
          <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No excerpt</p>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{date}</span>
          <Link href={`/posts/${post.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
              Review
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">Queue is empty</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        No posts in queue. Run a research pipeline to generate content.
      </p>
    </div>
  );
}

function PostGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2 mt-1" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <div className="flex justify-between items-center pt-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PostsPage() {
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => {
        setAllPosts(Array.isArray(data) ? data : []);
      })
      .catch(() => setAllPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const queuePosts = allPosts.filter(
    (p) => p.status === "pending_review" || p.status === "drafting"
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Posts</h1>
          <p className="text-xs text-muted-foreground">
            Review and publish AI-generated content
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            Review Queue
            {!loading && queuePosts.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                {queuePosts.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Posts</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {loading ? (
            <PostGridSkeleton />
          ) : queuePosts.length === 0 ? (
            <EmptyQueue />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {queuePosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {loading ? (
            <PostGridSkeleton />
          ) : allPosts.length === 0 ? (
            <EmptyQueue />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
