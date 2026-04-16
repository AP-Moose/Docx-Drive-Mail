import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, CheckCircle2, Copy, ExternalLink, FileDown, HardHat, Loader2, Mail, Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function ProposalDetail() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editedText, setEditedText] = useState("");
  const [editedEmailSubject, setEditedEmailSubject] = useState("");
  const [editedEmailBody, setEditedEmailBody] = useState("");
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [showTypedAiInput, setShowTypedAiInput] = useState(false);
  const [isChatListening, setIsChatListening] = useState(false);
  const [isChatTranscribing, setIsChatTranscribing] = useState(false);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);

  const { data: proposal, isLoading } = useQuery<Proposal>({
    queryKey: ["/api/proposals", id],
    select: (record: Proposal) => {
      if (!editedText && record?.proposalText) setEditedText(record.proposalText);
      if (!editedEmailSubject && record?.emailSubject) setEditedEmailSubject(record.emailSubject);
      if (!editedEmailBody && record?.emailBody) setEditedEmailBody(record.emailBody);
      return record;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/proposals/${id}`, {
        proposalText: editedText,
        emailSubject: editedEmailSubject || undefined,
        emailBody: editedEmailBody || undefined,
      });
      return (await res.json()) as Proposal;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Proposal edits were saved." });
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: parseApiError(error), variant: "destructive" });
    },
  });

  const refineMutation = useMutation({
    mutationFn: async (instruction: string) => {
      await apiRequest("PATCH", `/api/proposals/${id}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${id}/refine`, { instruction });
      return (await res.json()) as Proposal;
    },
    onSuccess: (refined) => {
      setEditedText(refined.proposalText || "");
      setChatInput("");
      setShowTypedAiInput(false);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (error) => {
      toast({ title: "Refine failed", description: parseApiError(error), variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/proposals/${id}`, {
        proposalText: editedText,
        emailSubject: editedEmailSubject || undefined,
        emailBody: editedEmailBody || undefined,
      });
      const res = await apiRequest("POST", `/api/proposals/${id}/finalize`);
      return (await res.json()) as FinalizeResult;
    },
    onSuccess: (result) => {
      setFinalizeResult(result);
      qc.invalidateQueries({ queryKey: ["/api/proposals", id] });
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
      const isSend = result.proposal.mode === "proposal_email";
      toast({
        title: isSend ? "Proposal sent!" : "Proposal saved!",
        description: isSend
          ? "The Word doc is in Drive and the email is on its way."
          : "The Word doc has been saved to Google Drive.",
      });
    },
    onError: (error) => {
      toast({ title: "Could not finish proposal", description: parseApiError(error), variant: "destructive" });
    },
  });

  async function transcribeBlob(blob: Blob): Promise<string | null> {
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data = (await res.json()) as { transcript?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Transcription failed");
      return data.transcript ?? null;
    } catch (error) {
      toast({ title: "Voice failed", description: parseApiError(error), variant: "destructive" });
      return null;
    }
  }

  async function toggleChatVoice() {
    if (isChatListening) {
      chatRecorderRef.current?.stop();
      setIsChatListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setIsChatListening(false);
        setIsChatTranscribing(true);
        const transcript = await transcribeBlob(new Blob(chunks, { type: "audio/webm" }));
        if (transcript) {
          setChatInput(transcript);
          refineMutation.mutate(transcript);
        }
        setIsChatTranscribing(false);
      };

      chatRecorderRef.current = recorder;
      recorder.start();
      setIsChatListening(true);
    } catch {
      toast({
        title: "Mic blocked",
        description: "Allow microphone access to change the proposal by voice.",
        variant: "destructive",
      });
    }
  }

  function handleChatSubmit() {
    const instruction = chatInput.trim();
    if (!instruction) return;
    refineMutation.mutate(instruction);
  }

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
  const isEditable = !isComplete;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f6_0%,#ffffff_22%,#ffffff_100%)]">
      {finalizeMutation.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm px-5">
          <div className="w-full max-w-sm space-y-6 rounded-[28px] border border-primary/15 bg-card px-6 py-8 shadow-[0_20px_60px_-30px_rgba(17,24,39,0.35)]">
            <div className="space-y-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">
                {proposal.mode === "proposal_email" ? "Sending proposal" : "Saving proposal"}
              </p>
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/15 bg-primary/10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  {proposal.mode === "proposal_email" ? "Packaging and sending…" : "Packaging and saving…"}
                </h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {proposal.mode === "proposal_email"
                    ? "Generating the Word doc, uploading to Drive, and emailing the customer."
                    : "Generating the Word doc and uploading to Drive."}
                </p>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl bg-muted/55 p-4">
              {(proposal.mode === "proposal_email"
                ? ["Generating the Word document", "Saving to Google Drive", "Sending the customer email"]
                : ["Generating the Word document", "Saving to Google Drive"]
              ).map((label, i) => (
                <div key={label} className="flex items-center gap-3 rounded-xl bg-background/75 px-4 py-3">
                  {i === 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 shrink-0" />
                  )}
                  <span className={i === 0 ? "text-sm font-medium" : "text-sm text-muted-foreground"}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
        <div className="bg-primary px-5 pb-6 pt-10 text-primary-foreground">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="rounded-full p-1 text-primary-foreground/80 transition-colors hover:text-primary-foreground">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <HardHat className="h-5 w-5" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">{proposal.customerName}</h1>
              <p className="text-sm text-primary-foreground/75">
                {statusLabel(proposal.status)} · v{proposal.version} · {format(new Date(proposal.createdAt), "MMM d, yyyy")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-5 py-6">
          {proposal.proposalTitle && !isComplete && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Proposal</p>
              <h2 className="text-3xl font-semibold tracking-tight">{proposal.proposalTitle}</h2>
            </div>
          )}

          {proposal.proposalText && (
            <>
              <div className="space-y-3 rounded-[28px] border border-border/80 bg-card px-5 py-4 shadow-[0_20px_60px_-35px_rgba(17,24,39,0.28)]">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Customer view</p>
                  <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">Live preview</div>
                </div>

                <ProposalPreview
                  title={proposal.proposalTitle || undefined}
                  text={editedText}
                  customerName={proposal.customerName}
                  customerEmail={proposal.customerEmail || undefined}
                  jobAddress={proposal.jobAddress || undefined}
                />

                {isEditable && (
                  <div className="space-y-2 rounded-2xl border border-border/80 bg-background px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Edit exact text</p>
                    <Textarea
                      data-testid="textarea-proposal-edit"
                      className="min-h-[220px] rounded-[24px] bg-card px-5 py-5 font-mono text-sm leading-7 resize-none"
                      value={editedText}
                      onChange={(event) => setEditedText(event.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-[28px] border border-border/80 bg-card px-5 py-5">
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
                      <button onClick={copyLink} data-testid="button-copy" className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4 text-left w-full">
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
                  <>
                    {proposal.status === "saved" && (
                      <div className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                        Edit, then save again.
                      </div>
                    )}

                    {proposal.mode === "proposal_email" && (
                      <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/40 px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Outgoing email</p>
                        <div>
                          <p className="mb-1.5 text-sm font-medium">Subject line</p>
                          <Input
                            data-testid="input-detail-email-subject"
                            className="h-11 rounded-2xl"
                            value={editedEmailSubject}
                            onChange={(event) => setEditedEmailSubject(event.target.value)}
                          />
                        </div>
                        <div>
                          <p className="mb-1.5 text-sm font-medium">Email body</p>
                          <Textarea
                            data-testid="textarea-detail-email-body"
                            className="min-h-[140px] rounded-[20px] leading-7 resize-none"
                            value={editedEmailBody}
                            onChange={(event) => setEditedEmailBody(event.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <Button
                      data-testid="button-save-edits"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                    >
                      {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save changes
                    </Button>
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
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {isEditable && proposal.proposalText && (
          <div className="sticky bottom-0 border-t bg-background/95 px-5 py-4 backdrop-blur">
            <div className="mb-3 space-y-2 rounded-[20px] border border-border/70 bg-background/98 px-3 py-2.5 shadow-[0_10px_24px_-20px_rgba(17,24,39,0.22)]">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/65">Change with AI</p>
                {(isChatListening || isChatTranscribing || refineMutation.isPending) && (
                  <p className="text-xs text-muted-foreground">
                    {isChatListening ? "Listening…" : isChatTranscribing || refineMutation.isPending ? "Rewriting…" : ""}
                  </p>
                )}
              </div>

              <Button
                data-testid="button-detail-chat-voice"
                variant="secondary"
                className={`h-13 w-auto min-w-[220px] rounded-2xl px-5 text-[15px] font-semibold shadow-[0_10px_20px_-18px_rgba(22,101,52,0.35)] ${
                  isChatListening
                    ? "border border-amber-300 bg-amber-50 text-amber-900 animate-pulse"
                    : "border border-primary/15 bg-primary/8 text-primary"
                }`}
                onClick={toggleChatVoice}
                disabled={refineMutation.isPending || isChatTranscribing}
              >
                {isChatTranscribing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Rewriting with your voice note
                  </>
                ) : isChatListening ? (
                  <>
                    <MicOff className="mr-2 h-5 w-5" />
                    Tap to stop recording
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 h-5 w-5" />
                    Tap to start recording
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3 px-1 pt-0.5">
                <button
                  type="button"
                  className="text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                  onClick={() => setShowTypedAiInput((current) => !current)}
                >
                  {showTypedAiInput ? "Hide typing" : "Type instead"}
                </button>
              </div>

              {showTypedAiInput && (
                <div className="flex gap-2 pt-0.5">
                  <Input
                    data-testid="input-detail-chat-refine"
                    className="h-11 rounded-2xl border-border/80 bg-white text-[15px] shadow-sm"
                    placeholder="Type the change you want"
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && chatInput.trim()) handleChatSubmit();
                    }}
                    disabled={refineMutation.isPending}
                  />
                  <Button
                    data-testid="button-detail-chat-send"
                    className="h-11 rounded-2xl px-4"
                    onClick={handleChatSubmit}
                    disabled={refineMutation.isPending || !chatInput.trim()}
                  >
                    {refineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
