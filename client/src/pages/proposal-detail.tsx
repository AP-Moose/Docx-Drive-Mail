import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  FileDown,
  Copy,
  Loader2,
  Upload,
  CheckCircle2,
  HardHat,
  RotateCcw,
  Scissors,
  AlignLeft,
} from "lucide-react";
import type { Proposal } from "@shared/schema";
import { format } from "date-fns";

export default function ProposalDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const { data: proposal, isLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", id],
    select: (p: any) => {
      if (!editedText && p?.proposalText) {
        setEditedText(p.proposalText);
      }
      return p;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: () => {
      toast({ title: "Saved!" });
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const refineMutation = useMutation({
    mutationFn: async (instruction: "shorter" | "longer" | "regenerate") => {
      await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${id}/refine`, { instruction });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      setEditedText(p.proposalText || "");
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: (e: any) => toast({ title: "Refinement failed", description: e.message, variant: "destructive" }),
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${id}/finalize`);
      return res.json() as Promise<{ fileId: string; webViewLink: string; gmailDraftId?: string; proposal: Proposal }>;
    },
    onSuccess: () => {
      setFinalized(true);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (e: any) => {
      const code = (e as any).code;
      if (code === "DRIVE_NOT_CONNECTED" || code === "GMAIL_NOT_CONNECTED") {
        toast({
          title: "Google not connected",
          description: "Please connect your Google account to save to Drive.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Failed", description: e.message, variant: "destructive" });
      }
    },
  });

  function copyLink() {
    if (proposal?.driveWebLink) {
      navigator.clipboard.writeText(proposal.driveWebLink);
      toast({ title: "Link copied!" });
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-muted-foreground">Proposal not found.</p>
        <Button onClick={() => navigate("/recent")}>Back to Recent</Button>
      </div>
    );
  }

  const isComplete = proposal.status === "completed" || finalized;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-primary px-5 pt-10 pb-6 text-primary-foreground">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate("/recent")} className="text-primary-foreground/80">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <HardHat className="w-5 h-5" />
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{proposal.customerName}</h1>
            <p className="text-primary-foreground/75 text-sm">
              {proposal.projectType} · v{proposal.version} · {format(new Date(proposal.createdAt), "MMM d, yyyy")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 space-y-5">
        {/* Proposal title */}
        {proposal.proposalTitle && (
          <h2 className="text-xl font-bold">{proposal.proposalTitle}</h2>
        )}

        {/* Proposal text */}
        {proposal.proposalText && (
          <div className="space-y-3">
            {isEditing ? (
              <>
                <Textarea
                  data-testid="textarea-proposal-edit"
                  className="text-sm min-h-[300px] font-mono leading-relaxed resize-none"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    data-testid="button-save-edits"
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>

                {/* Refine buttons */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Adjust:</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      disabled={refineMutation.isPending}
                      onClick={() => refineMutation.mutate("shorter")}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      Shorter
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      disabled={refineMutation.isPending}
                      onClick={() => refineMutation.mutate("longer")}
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                      Longer
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="gap-1"
                      disabled={refineMutation.isPending}
                      onClick={() => refineMutation.mutate("regenerate")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Redo
                    </Button>
                  </div>
                  {refineMutation.isPending && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Rewriting…
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div
                  data-testid="text-proposal-body"
                  className="bg-card border border-card-border rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap"
                >
                  {proposal.proposalText}
                </div>
                <Button
                  data-testid="button-edit-proposal"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  Edit Proposal
                </Button>
              </>
            )}
          </div>
        )}

        {/* Links when completed */}
        {isComplete && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium text-sm">Saved to Google Drive</span>
            </div>

            {proposal.driveWebLink && (
              <a
                href={proposal.driveWebLink}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-drive"
                className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
              >
                <ExternalLink className="w-5 h-5 text-blue-600" />
                <span className="font-medium">Open in Google Drive</span>
              </a>
            )}

            {proposal.gmailDraftId && (
              <a
                href="https://mail.google.com/mail/#sent"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-gmail"
                className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
              >
                <Mail className="w-5 h-5 text-green-500" />
                <span className="font-medium">View Sent Email in Gmail</span>
              </a>
            )}

            {proposal.driveWebLink && (
              <button
                onClick={copyLink}
                data-testid="button-copy"
                className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
              >
                <Copy className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium">Copy Shareable Link</span>
              </button>
            )}

            <a
              href={`/api/proposals/${id}/docx`}
              data-testid="link-docx"
              className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
            >
              <FileDown className="w-5 h-5 text-muted-foreground" />
              <span className="font-medium">Download Word Document</span>
            </a>
          </div>
        )}

        {/* Finalize button if not yet completed */}
        {!isComplete && proposal.proposalText && (
          <Button
            data-testid="button-finalize"
            className="w-full h-12"
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
          >
            {finalizeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {finalizeMutation.isPending ? "Saving…" : "Save to Drive"}
          </Button>
        )}
      </div>
    </div>
  );
}
