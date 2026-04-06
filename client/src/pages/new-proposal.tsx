import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  AlignLeft,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  FileDown,
  HardHat,
  Loader2,
  Mail,
  Mic,
  MicOff,
  Plus,
  RotateCcw,
  Scissors,
  Send,
  Upload,
  X,
} from "lucide-react";
import type { Proposal } from "@shared/schema";
import ProposalPreview from "@/components/proposal-preview";

type Step = "info" | "scope" | "generating" | "review" | "confirm" | "saving" | "done";

interface FormData {
  customerName: string;
  customerEmail: string;
  jobAddress: string;
  scopeNotes: string;
  mode: string;
}

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

function parseApiError(error: unknown): { message: string; code?: string } {
  const fallback = { message: "Something went wrong." };
  if (!(error instanceof Error)) return fallback;

  const raw = error.message.includes(": ") ? error.message.split(": ").slice(1).join(": ") : error.message;
  try {
    const parsed = JSON.parse(raw) as { error?: string; code?: string };
    return {
      message: parsed.error || error.message,
      code: parsed.code,
    };
  } catch {
    return { message: error.message };
  }
}

function ProgressBar({ step }: { step: Step }) {
  const displaySteps = ["info", "scope", "review", "confirm", "done"];
  let displayIndex = displaySteps.indexOf(step);
  if (step === "generating") displayIndex = 2;
  if (step === "saving") displayIndex = 3;
  const progress = ((Math.max(displayIndex, 0) + 1) / displaySteps.length) * 100;

  return (
    <div className="w-full rounded-full bg-white/20 p-0.5">
      <div className="h-2 rounded-full bg-white/15">
        <div
          className="h-full rounded-full bg-white transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function StepLabel({ step, mode }: { step: Step; mode: string }) {
  const labels: Record<Step, string> = {
    info: "Step 1 of 5  Customer details",
    scope: "Step 2 of 5  Describe the work",
    generating: "Writing a customer-ready proposal",
    review: "Step 3 of 5  Review the proposal",
    confirm: mode === "proposal_email" ? "Step 4 of 5  Final send check" : "Step 4 of 5  Final save check",
    saving: mode === "proposal_email" ? "Sending your proposal package" : "Saving your proposal package",
    done: "Step 5 of 5  Completed",
  };

  return <p className="mt-3 text-sm text-primary-foreground/80">{labels[step]}</p>;
}

function StageCard({
  eyebrow,
  title,
  description,
  statuses,
}: {
  eyebrow: string;
  title: string;
  description: string;
  statuses: string[];
}) {
  return (
    <div className="space-y-6 rounded-[28px] border border-primary/15 bg-card px-6 py-8 shadow-[0_20px_60px_-30px_rgba(17,24,39,0.35)]">
      <div className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">{eyebrow}</p>
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/15 bg-primary/10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3 rounded-2xl bg-muted/55 p-4">
        {statuses.map((status, index) => (
          <div key={status} className="flex items-center gap-3 rounded-xl bg-background/75 px-4 py-3">
            {index === 0 ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/60" />
            )}
            <span className={index === 0 ? "text-sm font-medium text-foreground" : "text-sm text-muted-foreground"}>
              {status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuccessRow({
  active,
  label,
  detail,
}: {
  active: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-4 ${
        active
          ? "border-primary/20 bg-primary/5"
          : "border-border bg-card"
      }`}
    >
      {active ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
      ) : (
        <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />
      )}
      <div className="space-y-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export default function NewProposal() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialMode = params.get("mode") || "proposal_email";
  const draftId = params.get("draft");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("info");
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [editedText, setEditedText] = useState("");
  const [editedEmailSubject, setEditedEmailSubject] = useState("");
  const [editedEmailBody, setEditedEmailBody] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [hasRecordedScope, setHasRecordedScope] = useState(false);
  const [isChatListening, setIsChatListening] = useState(false);
  const [isChatTranscribing, setIsChatTranscribing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showTypedAiInput, setShowTypedAiInput] = useState(false);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);

  const scopeRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);

  const [form, setForm] = useState<FormData>({
    customerName: "",
    customerEmail: "",
    jobAddress: "",
    scopeNotes: "",
    mode: initialMode,
  });

  const { data: draftProposal } = useQuery<Proposal>({
    queryKey: ["/api/proposals", draftId],
    enabled: Boolean(draftId),
  });

  useEffect(() => {
    if (!draftProposal) return;

    setProposalId(draftProposal.id);
    setProposal(draftProposal);
    setEditedText(draftProposal.proposalText || "");
    setEditedEmailSubject(draftProposal.emailSubject || "");
    setEditedEmailBody(draftProposal.emailBody || "");
    setEmailList(
      draftProposal.customerEmail
        ? draftProposal.customerEmail.split(",").map((email) => email.trim()).filter(Boolean)
        : [],
    );
    setForm({
      customerName: draftProposal.customerName,
      customerEmail: draftProposal.customerEmail || "",
      jobAddress: draftProposal.jobAddress || "",
      scopeNotes: draftProposal.scopeNotes || "",
      mode: draftProposal.mode || initialMode,
    });

    if (draftProposal.proposalText) {
      setStep("review");
    } else if (draftProposal.scopeNotes) {
      setStep("scope");
    } else {
      setStep("info");
    }
  }, [draftProposal, initialMode]);

  function update(field: keyof FormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function goBack() {
    if (step === "info") navigate("/");
    else if (step === "scope") setStep("info");
    else if (step === "review") setStep("scope");
    else if (step === "confirm") setStep("review");
  }

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
      const parsed = parseApiError(error);
      toast({ title: "Transcription failed", description: parsed.message, variant: "destructive" });
      return null;
    }
  }

  async function toggleVoice() {
    if (isListening) {
      scopeRecorderRef.current?.stop();
      setIsListening(false);
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
        setIsListening(false);
        setIsTranscribing(true);
        const transcript = await transcribeBlob(new Blob(chunks, { type: "audio/webm" }));
        if (transcript) {
          setHasRecordedScope(true);
          setForm((current) => ({
            ...current,
            scopeNotes: current.scopeNotes ? `${current.scopeNotes.trim()}\n${transcript}` : transcript,
          }));
        }
        setIsTranscribing(false);
      };

      scopeRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Allow microphone access to capture the job details by voice.",
        variant: "destructive",
      });
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
        if (transcript) setChatInput(transcript);
        setIsChatTranscribing(false);
      };

      chatRecorderRef.current = recorder;
      recorder.start();
      setIsChatListening(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Allow microphone access to dictate a refinement note.",
        variant: "destructive",
      });
    }
  }

  function addEmail() {
    const email = emailInput.trim().replace(/,+$/, "").trim();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: "Invalid email", description: "Enter a valid recipient email.", variant: "destructive" });
      return;
    }

    if (emailList.includes(email)) {
      toast({ title: "Already added", description: "That email is already on the recipient list.", variant: "destructive" });
      setEmailInput("");
      return;
    }

    const next = [...emailList, email];
    setEmailList(next);
    update("customerEmail", next.join(", "));
    setEmailInput("");
  }

  function buildNextEmailList() {
    const pendingEmail = emailInput.trim().replace(/,+$/, "").trim();
    if (!pendingEmail) return emailList;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(pendingEmail)) {
      toast({ title: "Invalid email", description: "Enter a valid recipient email.", variant: "destructive" });
      return null;
    }

    if (emailList.includes(pendingEmail)) {
      toast({ title: "Already added", description: "That email is already on the recipient list.", variant: "destructive" });
      setEmailInput("");
      return emailList;
    }

    return [...emailList, pendingEmail];
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/proposals", {
        customerName: form.customerName,
        customerEmail: form.customerEmail || null,
        jobAddress: form.jobAddress || null,
        projectType: "General",
        scopeNotes: form.scopeNotes,
        mode: form.mode,
      });
      return (await res.json()) as Proposal;
    },
    onSuccess: (created) => {
      setProposalId(created.id);
      setSubmitError(null);
      setStep("generating");
      generateMutation.mutate(created.id);
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      toast({ title: "Could not start proposal", description: parsed.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/generate`);
      return (await res.json()) as Proposal;
    },
    onSuccess: (generated) => {
      setProposal(generated);
      setEditedText(generated.proposalText || "");
      setEditedEmailSubject(generated.emailSubject || "");
      setEditedEmailBody(generated.emailBody || "");
      setStep("review");
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      toast({ title: "AI generation failed", description: parsed.message, variant: "destructive" });
      setStep("scope");
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/proposals/${proposalId}`, {
        proposalText: editedText,
        emailSubject: editedEmailSubject,
        emailBody: editedEmailBody,
      });
      return (await res.json()) as Proposal;
    },
    onSuccess: (saved) => setProposal(saved),
    onError: (error) => {
      const parsed = parseApiError(error);
      toast({ title: "Could not save edits", description: parsed.message, variant: "destructive" });
    },
  });

  const refineMutation = useMutation({
    mutationFn: async (instruction: string) => {
      await apiRequest("PATCH", `/api/proposals/${proposalId}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${proposalId}/refine`, { instruction });
      return (await res.json()) as Proposal;
    },
    onSuccess: (refined) => {
      setProposal(refined);
      setEditedText(refined.proposalText || "");
      setChatInput("");
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      toast({ title: "Refinement failed", description: parsed.message, variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/proposals/${proposalId}`, {
        proposalText: editedText,
        emailSubject: editedEmailSubject,
        emailBody: editedEmailBody,
      });
      const res = await apiRequest("POST", `/api/proposals/${proposalId}/finalize`);
      return (await res.json()) as FinalizeResult;
    },
    onSuccess: (result) => {
      setProposal(result.proposal);
      setFinalizeResult(result);
      setSubmitError(null);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (error) => {
      const parsed = parseApiError(error);
      const description =
        parsed.code === "DRIVE_NOT_CONNECTED" || parsed.code === "GMAIL_NOT_CONNECTED"
          ? "Finish the required Google connection first, then try again."
          : parsed.message;

      setSubmitError(description);
      setStep("confirm");
      toast({ title: "Could not finish proposal", description, variant: "destructive" });
    },
  });

  function handleChatSubmit() {
    const instruction = chatInput.trim();
    if (!instruction) return;
    refineMutation.mutate(instruction);
  }

  function handleNext() {
    if (step === "info") {
      if (!form.customerName.trim()) {
        toast({ title: "Customer name required", description: "Add the customer name before moving on.", variant: "destructive" });
        return;
      }
      if (form.mode === "proposal_email") {
        const nextEmails = buildNextEmailList();
        if (nextEmails === null) return;
        if (nextEmails.length === 0) {
          toast({ title: "Recipient required", description: "Add at least one email recipient.", variant: "destructive" });
          return;
        }
        if (nextEmails.join(", ") !== form.customerEmail) {
          setEmailList(nextEmails);
          update("customerEmail", nextEmails.join(", "));
          setEmailInput("");
        }
      }
      setStep("scope");
      return;
    }

    if (step === "scope") {
      if (!form.scopeNotes.trim()) {
        toast({ title: "Describe the work", description: "Add the job details before generating the proposal.", variant: "destructive" });
        return;
      }
      createMutation.mutate();
      return;
    }

    if (step === "review") {
      saveMutation.mutate();
      setSubmitError(null);
      setStep("confirm");
      return;
    }

    if (step === "confirm") {
      setSubmitError(null);
      setStep("saving");
      finalizeMutation.mutate();
    }
  }

  function copyLink() {
    const link = finalizeResult?.links.driveWebLink || proposal?.driveWebLink;
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied", description: "The shareable proposal link is on your clipboard." });
  }

  const isLoading =
    createMutation.isPending ||
    generateMutation.isPending ||
    refineMutation.isPending ||
    finalizeMutation.isPending;

  const doneState = finalizeResult?.completion;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f6_0%,#ffffff_22%,#ffffff_100%)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
        <div className="bg-primary px-5 pb-6 pt-10 text-primary-foreground">
          <div className="mb-4 flex items-center gap-3">
            {(step === "info" || step === "scope" || step === "review" || step === "confirm") && (
              <button onClick={goBack} className="rounded-full p-1 text-primary-foreground/80 transition-colors hover:text-primary-foreground">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <HardHat className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.2em]">
                {form.mode === "proposal_email" ? "Proposal + Send" : "Proposal Only"}
              </span>
            </div>
          </div>
          <ProgressBar step={step} />
          <StepLabel step={step} mode={form.mode} />
        </div>

        <div className="flex-1 px-5 py-6">
          {step === "info" && (
            <div className="space-y-4">
              <div className="space-y-5 rounded-[28px] border border-border/80 bg-card px-5 py-6 shadow-[0_20px_60px_-35px_rgba(17,24,39,0.25)]">
                <div>
                  <Label htmlFor="customerName" className="text-base font-medium">
                    Customer name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="customerName"
                    data-testid="input-customer-name"
                    className="mt-2 h-[52px] rounded-2xl border-border/80 text-base"
                    placeholder="John Smith"
                    value={form.customerName}
                    onChange={(event) => update("customerName", event.target.value)}
                  />
                </div>

                {form.mode === "proposal_email" && (
                  <div className="space-y-3">
                    <Label className="text-base font-medium">
                      Recipient email <span className="text-destructive">*</span>
                    </Label>
                    {emailList.length > 0 && (
                      <div className="space-y-2">
                        {emailList.map((email, index) => (
                          <div key={email} className="flex items-center gap-3 rounded-2xl border border-border/80 bg-background px-4 py-3">
                            <Mail className="h-4 w-4 text-primary" />
                            <span className="flex-1 truncate text-sm" data-testid={`text-email-${index}`}>{email}</span>
                            <button
                              type="button"
                              data-testid={`button-remove-email-${index}`}
                              className="rounded-full p-1 text-muted-foreground transition-colors hover:text-destructive"
                              onClick={() => {
                                const next = emailList.filter((_, emailIndex) => emailIndex !== index);
                                setEmailList(next);
                                update("customerEmail", next.join(", "));
                              }}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        data-testid="input-customer-email"
                        type="email"
                        className="h-[52px] flex-1 rounded-2xl border-border/80 text-base"
                        placeholder={emailList.length === 0 ? "john@email.com" : "Add another email"}
                        value={emailInput}
                        onChange={(event) => setEmailInput(event.target.value)}
                        onKeyDown={(event) => {
                          if ((event.key === "Enter" || event.key === ",") && emailInput.trim()) {
                            event.preventDefault();
                            addEmail();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-[52px] rounded-2xl px-4"
                        data-testid="button-add-email"
                        onClick={addEmail}
                        disabled={!emailInput.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {emailList.length > 0 ? `${emailList.length} recipient${emailList.length > 1 ? "s" : ""} ready for send.` : "Add the customer email now so the final send step is one tap."}
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="jobAddress" className="text-base font-medium">Job address</Label>
                  <Input
                    id="jobAddress"
                    data-testid="input-job-address"
                    className="mt-2 h-[52px] rounded-2xl border-border/80 text-base"
                    placeholder="123 Main St, Anytown"
                    value={form.jobAddress}
                    onChange={(event) => update("jobAddress", event.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "scope" && (
            <div className="space-y-4">
              <button
                data-testid="button-voice"
                type="button"
                onClick={toggleVoice}
                disabled={isTranscribing}
                className={`w-full rounded-[32px] border px-6 py-8 text-left transition-all active:scale-[0.99] ${
                  isListening
                    ? "border-amber-300 bg-amber-50 text-amber-900 shadow-[0_24px_60px_-30px_rgba(251,191,36,0.2)]"
                    : isTranscribing
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-primary/20 bg-[linear-gradient(180deg,rgba(22,163,74,0.10),rgba(255,255,255,0.96))] text-foreground shadow-[0_24px_60px_-35px_rgba(22,163,74,0.35)]"
                }`}
              >
                <div className="space-y-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                      <p className={`text-xs font-semibold uppercase tracking-[0.28em] ${isListening ? "text-amber-700" : "text-primary/70"}`}>
                        Voice capture
                      </p>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {isTranscribing
                          ? "Turning your recording into notes"
                          : isListening
                          ? "Tap to stop recording"
                          : hasRecordedScope
                          ? "Tap to record more"
                          : "Tap to start recording"}
                      </h2>
                    </div>
                    <div className={`flex h-16 w-16 items-center justify-center rounded-full ${isListening ? "bg-amber-200 animate-pulse" : "bg-primary/10"}`}>
                      {isTranscribing ? (
                        <Loader2 className="h-7 w-7 animate-spin" />
                      ) : isListening ? (
                        <MicOff className="h-7 w-7 text-amber-700" />
                      ) : (
                        <Mic className="h-7 w-7 text-primary" />
                      )}
                    </div>
                  </div>
                  <div className={`rounded-2xl border px-4 py-4 ${isListening ? "border-amber-200 bg-amber-100/60" : "border-primary/10 bg-background/75"}`}>
                    <p className="text-sm leading-6">
                      {isTranscribing
                        ? "Please wait while the recording is transcribed and added to the project description."
                        : isListening
                        ? "Tap this button again when you're done. Your words will be added to the notes below."
                        : "Example: replace the old deck with a new 16x20 composite deck, black aluminum railings, Trex boards, around $18,000, completed in three weeks."}
                    </p>
                  </div>
                </div>
              </button>

              <div className="space-y-3 rounded-[28px] border border-border/80 bg-card px-5 py-5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Typed notes</p>
                  <p className="text-sm text-muted-foreground">Use this if you prefer to type, or to tighten the transcript before you continue.</p>
                </div>
                <Textarea
                  data-testid="textarea-scope"
                  className="min-h-[240px] rounded-[24px] border-border/80 bg-background text-base leading-7 resize-none"
                  placeholder="Describe the project, materials, timeline, price range, and anything that should sound polished and clear for the customer."
                  value={form.scopeNotes}
                  onChange={(event) => update("scopeNotes", event.target.value)}
                />
              </div>
            </div>
          )}

          {step === "generating" && (
            <StageCard
              eyebrow="Preparing the document"
              title="Building the proposal draft"
              description="The app is translating your field notes into a clean customer-ready proposal with a matching email."
              statuses={[
                "Writing the proposal language",
                "Organizing sections and pricing details",
                "Preparing the send-ready document",
              ]}
            />
          )}

          {step === "review" && proposal && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Proposal review</p>
                <span className="rounded-full border border-border/80 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  {form.mode === "proposal_email" ? "Drive + Email" : "Drive + Manual Share"}
                </span>
              </div>

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

                <div className="space-y-2 rounded-2xl border border-border/80 bg-background px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Edit exact text</p>
                  <Textarea
                    data-testid="textarea-proposal"
                    className="min-h-[220px] rounded-[24px] border-border/80 bg-card px-5 py-5 font-mono text-sm leading-7 resize-none"
                    value={editedText}
                    onChange={(event) => setEditedText(event.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === "confirm" && proposal && (
            <div className="space-y-4">
              {submitError && (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <div className="space-y-4 rounded-[28px] border border-border/80 bg-card px-5 py-5">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Proposal document</p>
                  <p className="text-sm text-muted-foreground">This is the exact document that will be saved and shared.</p>
                </div>
                <ProposalPreview
                  title={proposal.proposalTitle || undefined}
                  text={editedText}
                  customerName={proposal.customerName}
                  customerEmail={proposal.customerEmail || undefined}
                  jobAddress={proposal.jobAddress || undefined}
                />
              </div>

              {form.mode === "proposal_email" && (
                <div className="space-y-4 rounded-[28px] border border-border/80 bg-card px-5 py-5">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Outgoing email</p>
                    <p className="text-sm text-muted-foreground">Make sure the message feels clean and trustworthy before it goes out.</p>
                  </div>

                  <div className="space-y-3 rounded-2xl bg-muted/55 p-4">
                    <p className="text-sm font-semibold">Recipients</p>
                    <div className="space-y-2">
                      {emailList.map((email, index) => (
                        <div key={email} className="flex items-center gap-3 rounded-xl bg-background px-4 py-3 text-sm">
                          <Mail className="h-4 w-4 text-primary" />
                          <span data-testid={`confirm-email-${index}`}>{email}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="emailSubject" className="text-sm font-medium">Subject line</Label>
                    <Input
                      id="emailSubject"
                      data-testid="input-email-subject"
                      className="mt-2 h-12 rounded-2xl"
                      value={editedEmailSubject}
                      onChange={(event) => setEditedEmailSubject(event.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="emailBody" className="text-sm font-medium">Email body</Label>
                    <Textarea
                      id="emailBody"
                      data-testid="textarea-email-body"
                      className="mt-2 min-h-[160px] rounded-[24px] leading-7 resize-none"
                      value={editedEmailBody}
                      onChange={(event) => setEditedEmailBody(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "saving" && (
            <StageCard
              eyebrow={form.mode === "proposal_email" ? "Finishing the send" : "Finishing the save"}
              title={form.mode === "proposal_email" ? "Packaging and sending the proposal" : "Packaging and saving the proposal"}
              description={
                form.mode === "proposal_email"
                  ? "The document is being generated, stored in Drive, and sent to the customer."
                  : "The document is being generated and stored in Drive."
              }
              statuses={
                form.mode === "proposal_email"
                  ? [
                      "Generating the Word document",
                      "Saving the file to Google Drive",
                      "Sending the customer email",
                    ]
                  : [
                      "Generating the Word document",
                      "Saving the file to Google Drive",
                      "Preparing the finished links",
                    ]
              }
            />
          )}

          {step === "done" && proposal && doneState && (
            <div className="space-y-6">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/15 bg-primary/10">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Proposal completed</p>
                <h1 className="text-3xl font-semibold tracking-tight">Everything needed for the next step is ready.</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                  The proposal package has been completed and the follow-up actions are ready below.
                </p>
              </div>

              <div className="space-y-3">
                <SuccessRow active={doneState.proposalReady} label="Proposal created" detail="The proposal text and customer-facing document are ready." />
                {form.mode === "proposal_email" && (
                  <SuccessRow active={doneState.emailSent} label="Email sent" detail="The customer email has been sent with the proposal link included." />
                )}
                <SuccessRow active={doneState.fileSaved} label="File saved" detail="The Word document was uploaded to Google Drive and a shareable link is available." />
                <SuccessRow active={doneState.nextStepComplete} label="Next step complete" detail="You can open the file, copy the link, or move straight to the next customer." />
              </div>

              <div className="space-y-3">
                {finalizeResult?.links.driveWebLink && (
                  <a
                    href={finalizeResult.links.driveWebLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-drive"
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <ExternalLink className="h-5 w-5 text-primary" />
                    <span className="flex-1 font-medium">Open in Google Drive</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                )}

                {finalizeResult?.links.gmailSentUrl && (
                  <a
                    href={finalizeResult.links.gmailSentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-gmail"
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
                  >
                    <Mail className="h-5 w-5 text-primary" />
                    <span className="flex-1 font-medium">Open sent email</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </a>
                )}

                <button
                  onClick={copyLink}
                  data-testid="button-copy-link"
                  className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:bg-muted/40"
                >
                  <Copy className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 font-medium">Copy shareable link</span>
                </button>

                <a
                  href={`/api/proposals/${proposalId}/docx`}
                  data-testid="link-docx"
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 transition-colors hover:bg-muted/40"
                >
                  <FileDown className="h-5 w-5 text-muted-foreground" />
                  <span className="flex-1 font-medium">Download Word document</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  data-testid="button-new-proposal"
                  className="h-12 rounded-2xl"
                  onClick={() => navigate("/")}
                >
                  Back to home
                </Button>
                <Button
                  variant="secondary"
                  className="h-12 rounded-2xl"
                  onClick={() => navigate("/new?mode=proposal_email")}
                >
                  Create another proposal
                </Button>
              </div>
            </div>
          )}
        </div>

        {(step === "info" || step === "scope" || step === "review" || step === "confirm") && (
          <div className="sticky bottom-0 border-t bg-background/95 px-5 py-4 backdrop-blur">
            {step === "review" && (
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
                  data-testid="button-chat-voice-footer"
                  variant="secondary"
                  className={`h-13 w-auto min-w-[220px] rounded-2xl px-5 text-[15px] font-semibold shadow-[0_10px_20px_-18px_rgba(22,101,52,0.35)] ${
                    isChatListening
                      ? "border border-amber-300 bg-amber-50 text-amber-900"
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
                      Tap once and describe the change
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
                      data-testid="input-chat-refine"
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
                      data-testid="button-chat-send"
                      className="h-11 rounded-2xl px-4"
                      onClick={handleChatSubmit}
                      disabled={refineMutation.isPending || !chatInput.trim()}
                    >
                      {refineMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <Button
              data-testid="button-next"
              className="h-14 w-full rounded-2xl text-base font-semibold"
              onClick={handleNext}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : step === "confirm" ? (
                <>
                  {form.mode === "proposal_email" ? (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Send proposal
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Save proposal
                    </>
                  )}
                </>
              ) : step === "review" ? (
                <>
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Continue to final check
                </>
              ) : (
                <>
                  <ArrowRight className="mr-2 h-5 w-5" />
                  Continue
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
