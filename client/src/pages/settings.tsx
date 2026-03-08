import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, HardHat, CheckCircle2, XCircle, Loader2, HardDrive, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectionStatus {
  drive: { connected: boolean; email?: string };
  gmail: { connected: boolean; email?: string };
}

export default function Settings() {
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery<ConnectionStatus>({
    queryKey: ["/api/settings/status"],
  });

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
              onClick={() => refetch()}
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

          {!isLoading && data && (
            <div className="space-y-3">
              <div
                data-testid="status-drive"
                className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4"
              >
                <div className={`rounded-full p-2.5 ${data.drive.connected ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  <HardDrive className={`w-5 h-5 ${data.drive.connected ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Google Drive</p>
                  <p className="text-sm text-muted-foreground">
                    {data.drive.connected 
                      ? data.drive.email 
                        ? `Connected as ${data.drive.email}`
                        : "Connected — proposals will upload to Drive"
                      : "Not connected"}
                  </p>
                </div>
                {data.drive.connected ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" data-testid="icon-drive-connected" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" data-testid="icon-drive-disconnected" />
                )}
              </div>

              <div
                data-testid="status-gmail"
                className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4"
              >
                <div className={`rounded-full p-2.5 ${data.gmail.connected ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  <Mail className={`w-5 h-5 ${data.gmail.connected ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`} />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Gmail</p>
                  <p className="text-sm text-muted-foreground">
                    {data.gmail.connected 
                      ? data.gmail.email 
                        ? `Connected as ${data.gmail.email}`
                        : "Connected — proposals will be emailed"
                      : "Not connected"}
                  </p>
                </div>
                {data.gmail.connected ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" data-testid="icon-gmail-connected" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" data-testid="icon-gmail-disconnected" />
                )}
              </div>

              {(!data.drive.connected || !data.gmail.connected) && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mt-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                    Account disconnected
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    To reconnect, open the Integrations panel in the Replit sidebar and re-authorize the disconnected account.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
