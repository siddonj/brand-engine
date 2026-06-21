"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FileText, Clock, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricsBarProps {
  totalPosts: number;
  pendingReview: number;
  activeJobs: number;
  published: number;
}

interface MetricCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent?: string;
}

function MetricCard({ icon, value, label, accent }: MetricCardProps) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{label}</p>
          </div>
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", accent)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MetricsBar({ totalPosts, pendingReview, activeJobs, published }: MetricsBarProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        icon={<FileText className="w-5 h-5 text-indigo-600" />}
        value={totalPosts}
        label="Total Posts"
        accent="bg-indigo-50 dark:bg-indigo-950"
      />
      <MetricCard
        icon={<Clock className="w-5 h-5 text-amber-600" />}
        value={pendingReview}
        label="Pending Review"
        accent="bg-amber-50 dark:bg-amber-950"
      />
      <MetricCard
        icon={<Zap className="w-5 h-5 text-violet-600" />}
        value={activeJobs}
        label="Active Jobs"
        accent="bg-violet-50 dark:bg-violet-950"
      />
      <MetricCard
        icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        value={published}
        label="Published"
        accent="bg-emerald-50 dark:bg-emerald-950"
      />
    </div>
  );
}
