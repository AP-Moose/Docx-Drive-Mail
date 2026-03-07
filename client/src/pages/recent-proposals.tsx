import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  FileText,
  Copy,
  Loader2,
  HardHat,
  Clock,
} from "lucide-react";
import type { Proposal } from "@shared/schema";
import { format } from "date-fns";

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "saved":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "generated":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function RecentProposals() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: proposals, isLoading } = useQuery<Proposal[]>({
    queryKey: ["/api/proposals"],
  });

  const duplicateMutation = useMutation({
    mutationFn: async (p: Proposal) => {
      const res = await apiRequest("POST", "/api/proposals", {
        customerName: p.customerName,
        customerEmail: p.customerEmail,
        jobAddress: p.jobAddress,
        projectType: p.projectType || "General",
        scopeNotes: p.scopeNotes,
        mode: p.mode,
      });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      toast({ title: "Duplicated", description: `New draft created for ${p.customerName}` });
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      navigate(`/proposals/${p.id}`);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-primary px-5 pt-10 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-primary-foreground/80">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <HardHat className="w-5 h-5" />
          <h1 className="text-xl font-bold">Recent Proposals</h1>
        </div>
      </div>

      <div className="flex-1 px-5 py-5">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && (!proposals || proposals.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
            <div className="bg-muted rounded-full p-5">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No proposals yet</h2>
            <p className="text-muted-foreground text-sm">Create your first proposal to get started.</p>
            <Button onClick={() => navigate("/new")} className="mt-2">
              Create Proposal
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {proposals?.map((p) => (
            <div
              key={p.id}
              data-testid={`card-proposal-${p.id}`}
              className="bg-card border border-card-border rounded-xl p-4 space-y-3"
            >
              {/* Header row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base truncate">{p.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.projectType && p.projectType !== "General" ? p.projectType : ""}
                    {p.projectType && p.projectType !== "General" && p.jobAddress ? " · " : ""}
                    {p.jobAddress || ""}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(p.createdAt), "MMM d, yyyy")}
                </span>
                <span>v{p.version}</span>
                <span>{p.mode === "proposal_email" ? "With Email" : "Proposal Only"}</span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  data-testid={`button-open-${p.id}`}
                  size="sm"
                  variant="default"
                  onClick={() => navigate(`/proposals/${p.id}`)}
                >
                  Open
                </Button>

                <Button
                  data-testid={`button-duplicate-${p.id}`}
                  size="sm"
                  variant="secondary"
                  disabled={duplicateMutation.isPending}
                  onClick={() => duplicateMutation.mutate(p)}
                >
                  Duplicate
                </Button>

                {p.driveWebLink && (
                  <Button
                    data-testid={`button-drive-${p.id}`}
                    size="sm"
                    variant="secondary"
                    asChild
                  >
                    <a href={p.driveWebLink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-3.5 h-3.5 mr-1" />
                      Drive
                    </a>
                  </Button>
                )}

                {p.gmailDraftId && (
                  <Button
                    data-testid={`button-gmail-${p.id}`}
                    size="sm"
                    variant="secondary"
                    asChild
                  >
                    <a href="https://mail.google.com/mail/#drafts" target="_blank" rel="noopener noreferrer">
                      <Mail className="w-3.5 h-3.5 mr-1" />
                      Draft
                    </a>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
