import { useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  HardHat,
  CheckCircle2,
  XCircle,
  Loader2,
  HardDrive,
  Mail,
  RefreshCw,
  Database,
  Brain,
  Cable,
  Link,
  LogOut,
  ListChecks,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { isGuidedPromptsEnabled, setGuidedPromptsEnabled } from "@/lib/app-settings";

interface ConnectionStatus {
  drive: { connected: boolean; email?: string };
  gmail: { connected: boolean; email?: string };
}

interface RuntimeStatus {
  openai: {
    configured: boolean;
    model: string;
    transcriptionModel: string;
  };
  database: {
    configured: boolean;
    connected: boolean;
  };
  google: {
    providerMode: "inapp" | "none";
    oauthConfigured: boolean;
    usingReplitConnectors: boolean;
  };
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
  ) : (
    <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" />
  );
}

function StatusCard({
  testId,
  title,
  description,
  ok,
  icon,
}: {
  testId: string;
  title: string;
  description: string;
  ok: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4"
    >
      <div
        className={`rounded-full p-2.5 ${
          ok ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <StatusIcon ok={ok} />
    </div>
  );
}

export default function Settings() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [guidedPrompts, setGuidedPromptsLocal] = useState(() => isGuidedPromptsEnabled());

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("connected") === "true") {
      toast({ title: "Google connected", description: "Drive and Gmail are ready to use." });
      navigate("/settings", { replace: true });
    } else if (params.get("error")) {
      const errorMap: Record<string, string> = {
        oauth_not_configured: "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not set.",
        oauth_cancelled: "Google sign-in was cancelled.",
        token_exchange_failed: "Could not exchange the auth code for tokens.",
        oauth_failed: "Google sign-in failed. Please try again.",
        oauth_state_mismatch: "Sign-in request could not be verified. Please try again.",
      };
      const msg = errorMap[params.get("error")!] || "Google sign-in failed.";
      toast({ title: "Connection failed", description: msg, variant: "destructive" });
      navigate("/settings", { replace: true });
    }
  }, [search]);

  const {
    data: connections,
    isLoading: connectionsLoading,
    refetch: refetchConnections,
    isFetching: connectionsFetching,
  } = useQuery<ConnectionStatus>({
    queryKey: ["/api/settings/status"],
  });

  const {
    data: runtime,
    isLoading: runtimeLoading,
    refetch: refetchRuntime,
    isFetching: runtimeFetching,
  } = useQuery<RuntimeStatus>({
    queryKey: ["/api/settings/runtime"],
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/auth/google/disconnect"),
    onSuccess: () => {
      toast({ title: "Disconnected", description: "Google account removed." });
      qc.invalidateQueries({ queryKey: ["/api/settings/status"] });
      qc.invalidateQueries({ queryKey: ["/api/settings/runtime"] });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const isLoading = connectionsLoading || runtimeLoading;
  const isFetching = connectionsFetching || runtimeFetching;
  const isConnected = connections?.drive.connected || connections?.gmail.connected;
  const canConnect = runtime?.google.oauthConfigured;

  const refreshAll = async () => {
    await Promise.all([refetchConnections(), refetchRuntime()]);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      <div className="bg-primary px-5 pt-10 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-primary-foreground/80" data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <HardHat className="w-5 h-5" />
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Connected Accounts</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshAll}
              disabled={isFetching}
              data-testid="button-refresh-status"
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {isLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          )}

          {!isLoading && connections && (
            <div className="space-y-3">
              <StatusCard
                testId="status-drive"
                title="Google Drive"
                description={
                  connections.drive.connected
                    ? connections.drive.email
                      ? `Connected as ${connections.drive.email}`
                      : "Connected — proposals will upload to Drive"
                    : "Not connected"
                }
                ok={connections.drive.connected}
                icon={
                  <HardDrive
                    className={`w-5 h-5 ${
                      connections.drive.connected
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  />
                }
              />

              <StatusCard
                testId="status-gmail"
                title="Gmail"
                description={
                  connections.gmail.connected
                    ? connections.gmail.email
                      ? `Connected as ${connections.gmail.email}`
                      : "Connected — proposals will be emailed"
                    : "Not connected"
                }
                ok={connections.gmail.connected}
                icon={
                  <Mail
                    className={`w-5 h-5 ${
                      connections.gmail.connected
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  />
                }
              />

              {canConnect && isConnected && (
                <Button
                  data-testid="button-disconnect-google"
                  variant="outline"
                  className="w-full gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  Disconnect Google account
                </Button>
              )}

              {canConnect && !isConnected && (
                <>
                  <a
                    href="/auth/google"
                    data-testid="button-connect-google"
                    className="flex items-center justify-center gap-2 w-full rounded-md border border-primary/30 bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium transition-colors hover:bg-primary/90"
                  >
                    <Link className="w-4 h-4" />
                    Connect Google account
                  </a>
                  <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Step required in Google Cloud Console
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Go to your OAuth client → <strong>Authorized redirect URIs</strong> and add this exact URL:
                    </p>
                    <p className="text-xs font-mono text-slate-800 dark:text-slate-200 break-all bg-slate-100 dark:bg-slate-800 rounded px-2 py-1.5 select-all cursor-text">
                      {window.location.origin}/auth/google/callback
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                      Also make sure the account you sign in with is added as a <strong>Test user</strong> in your OAuth consent screen.
                    </p>
                  </div>
                </>
              )}

              {!canConnect && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mt-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Google OAuth not configured
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Add <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_ID</code> and{" "}
                    <code className="font-mono bg-amber-100 px-1 rounded">GOOGLE_CLIENT_SECRET</code> as Replit
                    Secrets, then set the authorized redirect URI in your Google Cloud Console to:
                  </p>
                  <p className="mt-2 text-xs font-mono text-amber-800 break-all bg-amber-100 rounded px-2 py-1">
                    {window.location.origin}/auth/google/callback
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {!isLoading && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Proposal Flow</h2>
            <div className="space-y-3">
              {/* Guided prompts toggle */}
              <div className="bg-card border border-card-border rounded-xl p-4 flex items-start gap-4">
                <div className="rounded-full p-2.5 bg-primary/10">
                  {guidedPrompts ? (
                    <ListChecks className="w-5 h-5 text-primary" />
                  ) : (
                    <MessageSquare className="w-5 h-5 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">Guided prompts</p>
                    <button
                      role="switch"
                      aria-checked={guidedPrompts}
                      data-testid="toggle-guided-prompts"
                      onClick={() => {
                        const next = !guidedPrompts;
                        setGuidedPromptsEnabled(next);
                        setGuidedPromptsLocal(next);
                        toast({
                          title: next ? "Guided prompts on" : "Quick mode on",
                          description: next
                            ? "You'll see 5 step-by-step prompts when creating a proposal."
                            : "One record button, then generate — faster for demos.",
                        });
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        guidedPrompts ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
                          guidedPrompts ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {guidedPrompts
                      ? "5 step-by-step voice prompts (customer request, work, exclusions, pricing, timeline)."
                      : "One-shot: record everything in one take, then generate. Great for demos."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && runtime && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Local Runtime Checks</h2>
            <div className="space-y-3">
              <StatusCard
                testId="status-openai"
                title="OpenAI"
                description={
                  runtime.openai.configured
                    ? `Configured for chat ${runtime.openai.model} and transcription ${runtime.openai.transcriptionModel}`
                    : "Missing OpenAI environment variables"
                }
                ok={runtime.openai.configured}
                icon={
                  <Brain
                    className={`w-5 h-5 ${
                      runtime.openai.configured
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  />
                }
              />

              <StatusCard
                testId="status-database"
                title="Postgres"
                description={
                  runtime.database.connected
                    ? "DATABASE_URL is configured and the database-backed storage path is active"
                    : runtime.database.configured
                      ? "DATABASE_URL is set, but the app is not using database-backed storage"
                      : "No DATABASE_URL set — app is using in-memory storage"
                }
                ok={runtime.database.connected}
                icon={
                  <Database
                    className={`w-5 h-5 ${
                      runtime.database.connected
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  />
                }
              />

              <StatusCard
                testId="status-google-provider"
                title="Google Provider Mode"
                description={
                  runtime.google.providerMode === "inapp"
                    ? "In-app OAuth — contractors connect via Sign in with Google"
                    : "No Google provider is configured"
                }
                ok={runtime.google.providerMode !== "none"}
                icon={
                  <Cable
                    className={`w-5 h-5 ${
                      runtime.google.providerMode !== "none"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-500 dark:text-red-400"
                    }`}
                  />
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
