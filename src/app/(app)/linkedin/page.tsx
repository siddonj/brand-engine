"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Share2,
  Loader2,
  MessageSquare,
  CheckCircle2,
  Send,
  RefreshCw,
  Pencil,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Engagement = {
  id: number;
  postUrn: string;
  postSnippet: string;
  commentText: string;
  status: string;
  createdAt: string;
  postedAt: string | null;
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; class: string }> = {
    posted: { label: "Posted", class: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    failed: { label: "Failed", class: "bg-red-100 text-red-700 border-red-200" },
    pending: { label: "Pending", class: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  const s = map[status] || { label: status, class: "bg-gray-100 text-gray-600" };
  return <Badge className={cn("text-xs border", s.class)}>{s.label}</Badge>;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type Step = "input" | "preview" | "done";

export default function LinkedInPage() {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [postUrl, setPostUrl] = useState("");
  const [postText, setPostText] = useState("");
  const [authorName, setAuthorName] = useState("");

  // Flow state
  const [step, setStep] = useState<Step>("input");
  const [fetching, setFetching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [generatedComment, setGeneratedComment] = useState("");
  const [editedComment, setEditedComment] = useState("");
  const [pendingUrn, setPendingUrn] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  async function loadEngagements() {
    const data = await fetch("/api/linkedin/engagements").then((r) => r.json());
    setEngagements(data);
  }

  useEffect(() => {
    loadEngagements().finally(() => setLoading(false));
  }, []);

  async function fetchPostText(url: string) {
    if (!url.includes("linkedin.com")) return;
    setFetching(true);
    try {
      const res = await fetch("/api/linkedin/fetch-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.postText) {
        setPostText(data.postText);
        toast.success("Post content fetched");
      } else {
        toast.error(data.error || "Could not fetch post — paste the text manually");
      }
    } catch {
      toast.error("Could not fetch post — paste the text manually");
    } finally {
      setFetching(false);
    }
  }

  async function handleGenerate() {
    if (!postUrl.trim() || !postText.trim()) {
      toast.error("Paste the post URL and post text first");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/linkedin/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl, postText, authorName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate comment");
        return;
      }
      if (data.ok) {
        // Auto-posted
        toast.success("Comment generated and posted!");
        setStep("done");
        await loadEngagements();
      } else {
        // Generated but failed to post — show preview to retry
        setGeneratedComment(data.commentText);
        setEditedComment(data.commentText);
        setPendingUrn(data.postUrn);
        setStep("preview");
        toast.error("Comment generated but posting failed — edit and retry below");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateOnly() {
    if (!postUrl.trim() || !postText.trim()) {
      toast.error("Paste the post URL and post text first");
      return;
    }
    setGenerating(true);
    try {
      // Call just the commentator agent for preview
      const res = await fetch("/api/linkedin/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrl, postText, authorName, previewOnly: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to generate comment");
        return;
      }
      setGeneratedComment(data.commentText);
      setEditedComment(data.commentText);
      setPendingUrn(data.postUrn);
      setStep("preview");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  async function handlePost() {
    setPosting(true);
    try {
      const res = await fetch("/api/linkedin/comment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postUrn: pendingUrn, commentText: editedComment }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Comment posted to LinkedIn!");
        setStep("done");
        await loadEngagements();
      } else {
        toast.error(data.error || "Posting failed");
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPosting(false);
    }
  }

  function handleReset() {
    setStep("input");
    setPostUrl("");
    setPostText("");
    setAuthorName("");
    setGeneratedComment("");
    setEditedComment("");
    setPendingUrn("");
    setIsEditing(false);
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const postedCount = engagements.filter((e) => e.status === "posted").length;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Share2 className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">LinkedIn Engagement</h1>
          <p className="text-xs text-muted-foreground">AI-generated expert comments on LinkedIn posts</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{postedCount} comment{postedCount !== 1 ? "s" : ""} posted</span>
        </div>
      </div>

      {/* Main card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            Comment on a Post
            {step !== "input" && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground" onClick={handleReset}>
                <X className="w-3 h-3" /> Start over
              </Button>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === "input" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="postUrl" className="text-sm font-medium">LinkedIn Post URL</Label>
                <div className="relative">
                  <Input
                    id="postUrl"
                    value={postUrl}
                    onChange={(e) => setPostUrl(e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text");
                      if (pasted.includes("linkedin.com")) {
                        setTimeout(() => fetchPostText(pasted), 50);
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value && !postText) fetchPostText(e.target.value);
                    }}
                    placeholder="https://www.linkedin.com/posts/..."
                    className="h-9 font-mono text-xs pr-9"
                  />
                  {fetching && (
                    <div className="absolute inset-y-0 right-2 flex items-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Paste the URL — post text is fetched automatically</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="postText" className="text-sm font-medium">
                  Post Text
                  {fetching && <span className="ml-2 text-xs text-muted-foreground font-normal">Fetching…</span>}
                </Label>
                <Textarea
                  id="postText"
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder={fetching ? "Fetching post content…" : "Auto-filled from URL, or paste manually…"}
                  rows={5}
                  className="resize-none text-sm"
                  disabled={fetching}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="authorName" className="text-sm font-medium">
                  Author Name <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="authorName"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Jane Smith"
                  className="h-9"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  className="gap-2"
                  onClick={handleGenerate}
                  disabled={generating || !postUrl.trim() || !postText.trim()}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {generating ? "Generating…" : "Generate & Post"}
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleGenerateOnly}
                  disabled={generating || !postUrl.trim() || !postText.trim()}
                >
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Preview First
                </Button>
              </div>
            </>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              {/* Post snippet */}
              <div className="rounded-md bg-muted/50 border px-3 py-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground/70 mb-1">Post content</p>
                <p className="line-clamp-3">{postText}</p>
              </div>

              {/* Generated comment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Generated Comment</Label>
                  <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setIsEditing((e) => !e)}>
                    <Pencil className="w-3 h-3" />
                    {isEditing ? "Done editing" : "Edit"}
                  </Button>
                </div>
                {isEditing ? (
                  <Textarea
                    value={editedComment}
                    onChange={(e) => setEditedComment(e.target.value)}
                    rows={5}
                    className="resize-none text-sm"
                    autoFocus
                  />
                ) : (
                  <div className="rounded-md border bg-card px-3 py-2.5 text-sm whitespace-pre-wrap">
                    {editedComment}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{editedComment.length} characters</p>
              </div>

              <div className="flex gap-2">
                <Button className="gap-2" onClick={handlePost} disabled={posting || !editedComment.trim()}>
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {posting ? "Posting…" : "Post to LinkedIn"}
                </Button>
                <Button variant="outline" className="gap-2" onClick={handleGenerateOnly} disabled={generating}>
                  {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Regenerate
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div>
                <p className="font-medium">Comment posted!</p>
                <p className="text-sm text-muted-foreground mt-0.5">Your comment is now live on LinkedIn</p>
              </div>
              <Button onClick={handleReset} className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Comment on Another Post
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Engagement history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Engagements</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {engagements.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No comments posted yet.</p>
            </div>
          ) : (
            engagements.slice(0, 20).map((e, i) => (
              <div key={e.id}>
                {i > 0 && <Separator />}
                <div className="px-6 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {statusBadge(e.status)}
                    <span className="text-xs text-muted-foreground/60">{formatDate(e.createdAt)}</span>
                  </div>
                  {e.postSnippet && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5 line-clamp-2">
                      <span className="font-medium">Post: </span>{e.postSnippet}
                    </p>
                  )}
                  {e.commentText && (
                    <p className="text-sm text-foreground/80 line-clamp-3">{e.commentText}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
