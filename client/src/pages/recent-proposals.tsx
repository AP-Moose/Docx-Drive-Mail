import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  HardHat,
  Clock,
} from "lucide-react";
import type { Proposal } from "@shared/schema";
import { format } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "saved":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "generated":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "generated":
      return "Ready";
    case "saved":
      return "Saved";
    case "completed":
      return "Done";
    default:
      return "Draft";
  }
}

function openPath(proposal: Proposal) {
  return proposal.status === "draft" ? `/new?draft=${proposal.id}` : `/proposals/${proposal.id}`;
}

export default function RecentProposals() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

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
      const created = (await res.json()) as Proposal;

      if (!p.proposalText) return created;

      const patchRes = await apiRequest("PATCH", `/api/proposals/${created.id}`, {
        proposalTitle: p.proposalTitle,
        proposalText: p.proposalText,
        emailSubject: p.emailSubject,
        emailBody: p.emailBody,
        status: "generated",
        driveFileId: null,
        driveWebLink: null,
        gmailMessageId: null,
      });

      return (await patchRes.json()) as Proposal;
    },
    onSuccess: async (p) => {
      setHighlightedId(p.id);
      toast({ title: "Duplicated", description: `Copied for ${p.customerName}` });
      await qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      window.setTimeout(() => {
        document.querySelector(`[data-testid="card-proposal-${p.id}"]`)?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      }, 50);
      window.setTimeout(() => setHighlightedId((current) => (current === p.id ? null : current)), 2400);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/proposals/${id}`);
    },
    onSuccess: async () => {
      toast({ title: "Proposal deleted", description: "The proposal has been removed from your history." });
      await qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
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
              className={`rounded-xl p-4 space-y-3 border transition-colors ${
                highlightedId === p.id
                  ? "border-primary/40 bg-primary/5"
                  : "border-card-border bg-card"
              }`}
            >
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
                  {statusLabel(p.status)}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {format(new Date(p.createdAt), "MMM d, yyyy")}
                </span>
                <span>v{p.version}</span>
                <span>{p.mode === "proposal_email" ? "With Email" : "Proposal Only"}</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  data-testid={`button-open-${p.id}`}
                  size="sm"
                  variant="default"
                  onClick={() => navigate(openPath(p))}
                >
                  Open
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

                {p.gmailMessageId && (
                  <Button
                    data-testid={`button-sent-email-${p.id}`}
                    size="sm"
                    variant="secondary"
                    asChild
                  >
                    <a href="https://mail.google.com/mail/#sent" target="_blank" rel="noopener noreferrer">
                      <Mail className="w-3.5 h-3.5 mr-1" />
                      Sent email
                    </a>
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid={`button-more-${p.id}`}
                    >
                      <MoreHorizontal className="w-3.5 h-3.5 mr-1" />
                      More
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      data-testid={`button-duplicate-${p.id}`}
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(p)}
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      data-testid={`button-delete-${p.id}`}
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTargetId(p.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog open={deleteTargetId !== null} onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this proposal?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the proposal from this app only. It does not unsend the email or delete the file from Google Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-delete-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTargetId !== null) {
                  deleteMutation.mutate(deleteTargetId, {
                    onSettled: () => setDeleteTargetId(null),
                  });
                }
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
