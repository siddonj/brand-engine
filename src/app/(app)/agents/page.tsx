"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Loader2, Save } from "lucide-react";
import { cn } from "@/lib/utils";

type Agent = {
  id: number;
  name: string;
  role: "research" | "writer" | "seo" | "teaser";
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
};

const MODELS = [
  { value: "claude-opus-4-8", label: "Opus 4.8", description: "Most Capable" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Balanced" },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    description: "Fast & Efficient",
  },
] as const;

const ROLE_COLORS: Record<Agent["role"], string> = {
  research:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  writer: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  seo: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  teaser:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const ROLE_LABELS: Record<Agent["role"], string> = {
  research: "Research",
  writer: "Writer",
  seo: "SEO",
  teaser: "Teaser",
};

type AgentState = Agent & {
  saving: boolean;
  dirty: boolean;
};

function AgentCard({
  agent,
  onChange,
  onSave,
}: {
  agent: AgentState;
  onChange: (patch: Partial<Agent>) => void;
  onSave: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Bot className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{agent.name}</CardTitle>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium mt-0.5",
                  ROLE_COLORS[agent.role]
                )}
              >
                {ROLE_LABELS[agent.role]}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label
              htmlFor={`enabled-${agent.id}`}
              className="text-xs text-muted-foreground"
            >
              {agent.enabled ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id={`enabled-${agent.id}`}
              checked={agent.enabled}
              onCheckedChange={(checked) => onChange({ enabled: checked })}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Model */}
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Model</Label>
          <Select
            value={agent.model}
            onValueChange={(v) => { if (v !== null) onChange({ model: v }); }}
          >
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-1.5 text-muted-foreground text-xs">
                    — {m.description}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Temperature */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium">Temperature</Label>
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {agent.temperature.toFixed(2)}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[agent.temperature]}
            onValueChange={(v) => { const val = Array.isArray(v) ? v[0] : v; onChange({ temperature: val as number }); }}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>

        {/* Max Tokens */}
        <div className="space-y-1.5">
          <Label htmlFor={`tokens-${agent.id}`} className="text-xs font-medium">
            Max Tokens
          </Label>
          <Input
            id={`tokens-${agent.id}`}
            type="number"
            min={256}
            max={32000}
            step={256}
            value={agent.maxTokens}
            onChange={(e) =>
              onChange({ maxTokens: parseInt(e.target.value, 10) || 1024 })
            }
            className="h-9"
          />
        </div>

        {/* System Prompt */}
        <div className="space-y-1.5">
          <Label
            htmlFor={`prompt-${agent.id}`}
            className="text-xs font-medium"
          >
            System Prompt
          </Label>
          <Textarea
            id={`prompt-${agent.id}`}
            value={agent.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            rows={8}
            className="resize-y text-xs leading-relaxed font-mono"
            placeholder="Enter system prompt..."
          />
        </div>

        {/* Save */}
        <Button
          onClick={onSave}
          disabled={agent.saving}
          className="w-full gap-2"
          size="sm"
        >
          {agent.saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {agent.saving ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AgentCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-9 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full rounded-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => {
        setAgents(
          (Array.isArray(data) ? data : []).map((a) => ({
            ...a,
            saving: false,
            dirty: false,
          }))
        );
      })
      .catch(() => toast.error("Failed to load agents"))
      .finally(() => setLoading(false));
  }, []);

  function updateAgent(id: number, patch: Partial<Agent>) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch, dirty: true } : a))
    );
  }

  async function saveAgent(id: number) {
    setAgents((prev) =>
      prev.map((a) => (a.id === id ? { ...a, saving: true } : a))
    );
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agent.id,
          model: agent.model,
          systemPrompt: agent.systemPrompt,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          enabled: agent.enabled,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(`${agent.name} saved`);
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, dirty: false } : a))
      );
    } catch {
      toast.error(`Failed to save ${agent.name}`);
    } finally {
      setAgents((prev) =>
        prev.map((a) => (a.id === id ? { ...a, saving: false } : a))
      );
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Agent Configuration</h1>
          <p className="text-xs text-muted-foreground">
            Customize each AI agent&apos;s model, behavior and instructions.
          </p>
        </div>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <AgentCardSkeleton key={i} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bot className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No agents found.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onChange={(patch) => updateAgent(agent.id, patch)}
              onSave={() => saveAgent(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
