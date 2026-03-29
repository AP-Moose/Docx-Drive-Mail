import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FileDown, HardHat, Loader2, Mail, RotateCcw, Scissors, AlignLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import ProposalPreview from "@/components/proposal-preview";
import type { Proposal } from "@shared/schema";

interface FinalizeResult {
  proposal: Proposal;
  completion: {
    proposalReady: boolean;
    fileSaved: boolean;
    emailSent: boolean;
    nextStepComplete: boolean;
  };
  links: {
    driveWebLink?: string;
    gmailSentUrl?: string;
  };
}

function parseApiError(error: unknown): string {
  if (!(error instanceof Error)) return "Something went wrong.";
  const raw = error.message.includes(": ") ? error.message.split(": ").slice(1).join(": ") : error.message;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error || error.message;
  } catch {
    return error.message;
  }
}

export default function ProposalDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editedText, setEditedText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);

  const { data: proposal, isLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", id],
    select: (record: Proposal) => {
      if (!editedText && record?.proposalText) setEditedText(record.proposalText);
      return record;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      return (await res.json()) as Proposal;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Proposal edits were saved." });
      setIsEditing(false);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: parseApiError(error), variant: "destructive" });
    },
  });

  const refineMutation = useMutation({
    mutationFn: async (instruction: "shorter" | "longer" | "regenerate") => {
      await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${id}/refine`, { instruction });
      return (await res.json()) as Proposal;
    },
    onSuccess: (updated) => {
      setEditedText(updated.proposalText || "");
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: (error) => {
      toast({ title: "Refinement failed", description: parseApiError(error), variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${id}/finalize`);
      return (await res.json()) as FinalizeResult;
    },
    onSuccess: (result) => {
      setFinalizeResult(result);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (error) => {
      toast({ title: "Could not finish proposal", description: parseApiError(error), variant: "destructive" });
    },
  });

  function copyLink() {
    const link = finalizeResult?.links.driveWebLink || proposal?.driveWebLink;
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: "The Drive link is on your clipboard." });
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5">
        <p className="text-muted-foreground">Proposal not found.</p>
        <Button onClick={() => navigate("/recent")}>Back to Recent</Button>
      </div>
    );
  }

  const isComplete = proposal.status === "completed" || Boolean(finalizeResult?.completion.nextStepComplete);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f6_0%,#ffffff_22%,#ffffff_100%)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
        <div className="bg-primary px-5 pb-6 pt-10 text-primary-foreground">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/recent")} className="rounded-full p-1 text-primary-foreground/80 transition-colors hover:text-primary-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <HardHat className="h-5 w-5" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{proposal.customerName}</h1>
              <p className="text-sm text-primary-foreground/75">
                {proposal.projectType && proposal.projectType !== "General" ? `${proposal.projectType} · ` : ""}
                v{proposal.version} · {format(new Date(proposal.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-5 py-6">
          {proposal.proposalTitle && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Saved proposal</p>
              <h2 className="text-3xl font-semibold tracking-tight">{proposal.proposalTitle}</h2>
            </div>
          )}

          {proposal.proposalText && (
            <>
              {isEditing ? (
                <div className="space-y-4">
                  <Textarea
                    data-testid="textarea-proposal-edit"
                    className="min-h-[360px] rounded-[28px] bg-card px-5 py-5 font-mono text-sm leading-7 resize-none"
                    value={editedText}
                    onChange={(event) => setEditedText(event.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      data-testid="button-save-edits"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save
                    </Button>
                    <Button variant="secondary" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <ProposalPreview
                  title={proposal.proposalTitle || undefined}
                  text={editedText}
                  customerName={proposal.customerName}
                  customerEmail={proposal.customerEmail || undefined}
                  jobAddress={proposal.jobAddress || undefined}
                  className="max-h-[560px]"
                />
              )}

              <div className="space-y-4 rounded-[28px] border border-border/80 bg-card px-5 py-5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="button-edit-proposal"
                    variant="secondary"
                    onClick={() => setIsEditing((current) => !current)}
                  >
                    {isEditing ? "Preview document" : "Edit text"}
                  </Button>
                  <Button variant="secondary" disabled={refineMutation.isPending} onClick={() => refineMutation.mutate("shorter")}>
                    <Scissors className="mr-2 h-4 w-4" />
                    Shorter
                  </Button>
                  <Button variant="secondary" disabled={refineMutation.isPending} onClick={() => refineMutation.mutate("longer")}>
                    <AlignLeft className="mr-2 h-4 w-4" />
                    Longer
                  </Button>
                  <Button variant="secondary" disabled={refineMutation.isPending} onClick={() => refineMutation.mutate("regenerate")}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Redo
                  </Button>
                </div>

                {isComplete ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-primary">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Proposal package completed</span>
                    </div>

                    {proposal.driveWebLink && (
                      <a
                        href={proposal.driveWebLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="link-drive"
                        className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4"
                      >
                        <ExternalLink className="h-5 w-5 text-primary" />
                        <span className="flex-1 font-medium">Open in Google Drive</span>
                      </a>
                    )}

                    {proposal.gmailMessageId && (
                      <a
                        href="https://mail.google.com/mail/#sent"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="link-gmail"
                        className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4"
                      >
                        <Mail className="h-5 w-5 text-primary" />
                        <span className="flex-1 font-medium">Open sent email</span>
                      </a>
                    )}

                    {proposal.driveWebLink && (
                      <button onClick={copyLink} data-testid="button-copy" className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4 text-left">
                        <Copy className="h-5 w-5 text-muted-foreground" />
                        <span className="flex-1 font-medium">Copy shareable link</span>
                      </button>
                    )}

                    <a
                      href={`/api/proposals/${id}/docx`}
                      data-testid="link-docx"
                      className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4"
                    >
                      <FileDown className="h-5 w-5 text-muted-foreground" />
                      <span className="flex-1 font-medium">Download Word document</span>
                    </a>
                  </div>
                ) : (
                  <Button
                    data-testid="button-finalize"
                    className="h-12 w-full rounded-2xl"
                    onClick={() => finalizeMutation.mutate()}
                    disabled={finalizeMutation.isPending}
                  >
                    {finalizeMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : proposal.mode === "proposal_email" ? (
                      <Send className="mr-2 h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {proposal.mode === "proposal_email" ? "Send proposal" : "Save proposal"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
