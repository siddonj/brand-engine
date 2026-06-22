"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Settings,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Save,
  Wifi,
  Link2,
  Copy,
} from "lucide-react";

type SettingsMap = Record<string, string>;
type ConnectionStatus = "idle" | "testing" | "ok" | "fail";

function PasswordInput({
  id, value, onChange, placeholder,
}: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pr-10"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground transition-colors"
        tabIndex={-1}
        aria-label={show ? "Hide" : "Show"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ConnectionBadge({ status, label }: { status: ConnectionStatus; label?: string }) {
  if (status === "idle") return null;
  if (status === "testing") return <span className="text-xs text-muted-foreground">Testing…</span>;
  if (status === "ok") return (
    <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
      <CheckCircle2 className="w-3.5 h-3.5" />
      {label || "Connected"}
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs text-destructive font-medium">
      <XCircle className="w-3.5 h-3.5" />
      Failed
    </span>
  );
}

function FieldRow({ id, label, helper, children }: {
  id: string; label: string; helper?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function OAuthNotifier() {
  const searchParams = useSearchParams();
  useEffect(() => {
    const connected = searchParams.get("linkedin_connected");
    const error = searchParams.get("linkedin_error");
    if (connected === "1") toast.success("LinkedIn connected successfully!");
    if (error) {
      fetch("/api/settings")
        .then(r => r.json())
        .then((d: SettingsMap) => {
          const msg = d.linkedin_last_error || "Token exchange failed";
          toast.error(msg, { duration: 15000 });
        });
    }
  }, [searchParams]);
  return null;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // AI provider
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [unsplashKey, setUnsplashKey] = useState("");

  // WordPress
  const [wpUrl, setWpUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpPassword, setWpPassword] = useState("");
  const [wpStatus, setWpStatus] = useState<ConnectionStatus>("idle");

  // Postiz
  const [postizKey, setPostizKey] = useState("");
  const [postizBaseUrl, setPostizBaseUrl] = useState("https://postiz.joshsiddon.com");
  const [postizLinkedInId, setPostizLinkedInId] = useState("");
  const [postizStatus, setPostizStatus] = useState<ConnectionStatus>("idle");

  // LinkedIn Direct
  const [linkedinClientId, setLinkedinClientId] = useState("");
  const [linkedinClientSecret, setLinkedinClientSecret] = useState("");
  const [linkedinRedirectUri, setLinkedinRedirectUri] = useState("http://localhost:3000/api/linkedin/oauth/callback");
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [linkedinConnectedName, setLinkedinConnectedName] = useState("");
  const [linkedinStatus, setLinkedinStatus] = useState<ConnectionStatus>("idle");
  const [linkedinStatusLabel, setLinkedinStatusLabel] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsMap) => {
        if (!data) return;
        setOpenrouterKey(data.openrouter_api_key ? "••••••••" : "");
        setTavilyKey(data.tavily_api_key ? "••••••••" : "");
        setUnsplashKey(data.unsplash_access_key ? "••••••••" : "");
        setWpUrl(data.wp_url ?? "");
        setWpUsername(data.wp_username ?? "");
        setWpPassword(data.wp_app_password ? "••••••••" : "");
        setPostizKey(data.postiz_api_key ? "••••••••" : "");
        setPostizBaseUrl(data.postiz_base_url || "https://postiz.joshsiddon.com");
        setPostizLinkedInId(data.postiz_linkedin_id ?? "");
        setLinkedinClientId(data.linkedin_client_id ?? "");
        setLinkedinClientSecret(data.linkedin_client_secret ? "••••••••" : "");
        setLinkedinRedirectUri(data.linkedin_redirect_uri || "http://localhost:3000/api/linkedin/oauth/callback");
        setLinkedinConnected(!!data.linkedin_access_token);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  async function testConnection(service: "wordpress" | "postiz" | "linkedin") {
    const setStatus = service === "wordpress" ? setWpStatus : service === "linkedin" ? setLinkedinStatus : setPostizStatus;
    setStatus("testing");

    try {
      const saveBody: Record<string, string> = {};
      if (service === "wordpress") {
        saveBody.wp_url = wpUrl;
        saveBody.wp_username = wpUsername;
        if (!wpPassword.startsWith("•")) saveBody.wp_app_password = wpPassword;
      } else if (service === "postiz") {
        if (!postizKey.startsWith("•")) saveBody.postiz_api_key = postizKey;
        saveBody.postiz_base_url = postizBaseUrl;
        saveBody.postiz_linkedin_id = postizLinkedInId;
      }
      if (Object.keys(saveBody).length > 0) {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saveBody),
        });
      }
    } catch { /* non-fatal */ }

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("ok");
        if (service === "linkedin" && data.name) {
          setLinkedinStatusLabel(data.name);
          setLinkedinConnectedName(data.name);
        }
        toast.success(`${service === "wordpress" ? "WordPress" : service === "linkedin" ? "LinkedIn" : "Postiz"} connected`);
      } else {
        setStatus("fail");
        toast.error(data.error || "Connection failed");
      }
    } catch {
      setStatus("fail");
      toast.error("Connection failed");
    }
  }

  async function saveLinkedInCredentials() {
    const body: Record<string, string> = {
      linkedin_client_id: linkedinClientId,
      linkedin_redirect_uri: linkedinRedirectUri,
    };
    if (!linkedinClientSecret.startsWith("•")) body.linkedin_client_secret = linkedinClientSecret;
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        wp_url: wpUrl,
        wp_username: wpUsername,
        postiz_base_url: postizBaseUrl,
        postiz_linkedin_id: postizLinkedInId,
        linkedin_client_id: linkedinClientId,
        linkedin_redirect_uri: linkedinRedirectUri,
      };
      if (!openrouterKey.startsWith("•")) body.openrouter_api_key = openrouterKey;
      if (!tavilyKey.startsWith("•")) body.tavily_api_key = tavilyKey;
      if (!unsplashKey.startsWith("•")) body.unsplash_access_key = unsplashKey;
      if (!wpPassword.startsWith("•")) body.wp_app_password = wpPassword;
      if (!postizKey.startsWith("•")) body.postiz_api_key = postizKey;
      if (!linkedinClientSecret.startsWith("•")) body.linkedin_client_secret = linkedinClientSecret;

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed");
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <Suspense fallback={null}><OAuthNotifier /></Suspense>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-xs text-muted-foreground">Configure API keys and integrations</p>
        </div>
      </div>

      {/* Section 1: AI Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">AI Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="openrouterKey" label="OpenRouter API Key" helper="Get your key at openrouter.ai/keys">
            <PasswordInput id="openrouterKey" value={openrouterKey} onChange={setOpenrouterKey} placeholder="sk-or-..." />
          </FieldRow>

          <FieldRow id="tavilyKey" label="Tavily API Key" helper="Used by the Research Agent for web search">
            <PasswordInput id="tavilyKey" value={tavilyKey} onChange={setTavilyKey} placeholder="tvly-..." />
          </FieldRow>

          <FieldRow id="unsplashKey" label="Unsplash Access Key" helper="Auto-fetches featured image + 3 body images when publishing to WordPress">
            <PasswordInput id="unsplashKey" value={unsplashKey} onChange={setUnsplashKey} placeholder="Your Unsplash API access key" />
          </FieldRow>
        </CardContent>
      </Card>

      {/* Section 2: WordPress */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">WordPress Integration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="wpUrl" label="WordPress Site URL">
            <Input id="wpUrl" value={wpUrl} onChange={(e) => setWpUrl(e.target.value)} placeholder="https://yourdomain.com" className="h-9" />
          </FieldRow>
          <FieldRow id="wpUsername" label="WordPress Username">
            <Input id="wpUsername" value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} className="h-9" autoComplete="off" />
          </FieldRow>
          <FieldRow id="wpPassword" label="Application Password" helper="Generate in WP Admin → Users → Profile → Application Passwords (not your login password)">
            <PasswordInput id="wpPassword" value={wpPassword} onChange={setWpPassword} placeholder="xxxx xxxx xxxx xxxx" />
          </FieldRow>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => testConnection("wordpress")} disabled={wpStatus === "testing"} className="gap-2 h-8 text-xs">
              {wpStatus === "testing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Test Connection
            </Button>
            <ConnectionBadge status={wpStatus} />
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Postiz */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Postiz — Social Scheduling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="postizKey" label="Postiz API Key">
            <PasswordInput id="postizKey" value={postizKey} onChange={setPostizKey} placeholder="pz_..." />
          </FieldRow>
          <FieldRow id="postizBaseUrl" label="Postiz Base URL">
            <Input id="postizBaseUrl" value={postizBaseUrl} onChange={(e) => setPostizBaseUrl(e.target.value)} placeholder="https://postiz.joshsiddon.com" className="h-9" />
          </FieldRow>
          <FieldRow id="postizLinkedInId" label="LinkedIn Integration ID" helper="Found in Postiz integrations dashboard">
            <Input id="postizLinkedInId" value={postizLinkedInId} onChange={(e) => setPostizLinkedInId(e.target.value)} className="h-9" />
          </FieldRow>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" size="sm" onClick={() => testConnection("postiz")} disabled={postizStatus === "testing"} className="gap-2 h-8 text-xs">
              {postizStatus === "testing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Test Connection
            </Button>
            <ConnectionBadge status={postizStatus} />
          </div>
        </CardContent>
      </Card>

      {/* Section 4: LinkedIn Direct */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">LinkedIn — Direct API</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow id="linkedinClientId" label="Client ID" helper="From developer.linkedin.com → your app → Auth">
            <Input id="linkedinClientId" value={linkedinClientId} onChange={(e) => setLinkedinClientId(e.target.value)} placeholder="86abc123..." className="h-9" />
          </FieldRow>
          <FieldRow id="linkedinClientSecret" label="Client Secret">
            <PasswordInput id="linkedinClientSecret" value={linkedinClientSecret} onChange={setLinkedinClientSecret} placeholder="WPL_AP0.abc..." />
          </FieldRow>

          <FieldRow
            id="linkedinRedirectUri"
            label="Redirect URI"
            helper="Must exactly match what you entered in your LinkedIn app's OAuth settings"
          >
            <div className="flex gap-2">
              <Input
                id="linkedinRedirectUri"
                value={linkedinRedirectUri}
                onChange={(e) => setLinkedinRedirectUri(e.target.value)}
                className="h-9 font-mono text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(linkedinRedirectUri);
                  toast.success("Copied");
                }}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </FieldRow>

          {/* OAuth status */}
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              {linkedinConnected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span className="text-sm">
                {linkedinConnected
                  ? linkedinConnectedName ? `Connected as ${linkedinConnectedName}` : "Access token stored"
                  : "Not connected"}
              </span>
            </div>
            <Button
              size="sm"
              variant={linkedinConnected ? "outline" : "default"}
              className="gap-1.5 h-7 text-xs"
              onClick={async () => {
                await saveLinkedInCredentials();
                window.location.href = "/api/linkedin/oauth/start";
              }}
            >
              <Link2 className="w-3 h-3" />
              {linkedinConnected ? "Re-connect" : "Connect LinkedIn"}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testConnection("linkedin")}
              disabled={linkedinStatus === "testing" || !linkedinConnected}
              className="gap-2 h-8 text-xs"
            >
              {linkedinStatus === "testing" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
              Test Connection
            </Button>
            <ConnectionBadge status={linkedinStatus} label={linkedinStatusLabel || "Connected"} />
          </div>

          <p className="text-xs text-muted-foreground">
            LinkedIn app must have <span className="font-medium">Sign In with LinkedIn using OpenID Connect</span> and <span className="font-medium">Share on LinkedIn</span> products enabled. Register the redirect URI above in your app&apos;s OAuth 2.0 settings at developer.linkedin.com.
          </p>
        </CardContent>
      </Card>

      {/* Save All */}
      <div className="flex justify-end pb-2">
        <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-36">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving…" : "Save All Settings"}
        </Button>
      </div>
    </div>
  );
}
