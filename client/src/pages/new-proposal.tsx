import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mic,
  MicOff,
  CheckCircle2,
  Scissors,
  AlignLeft,
  RotateCcw,
  Upload,
  Mail,
  ExternalLink,
  Copy,
  FileDown,
  HardHat,
  Send,
  MessageSquare,
  Eye,
  Pencil,
  Plus,
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

function ProgressBar({ step }: { step: Step }) {
  const displaySteps = ["info", "scope", "review", "confirm", "done"];
  const total = displaySteps.length;
  let displayIndex = displaySteps.indexOf(step as any);
  if (step === "generating") displayIndex = 2;
  if (step === "saving") displayIndex = 3;
  const progress = ((Math.max(displayIndex, 0) + 1) / total) * 100;

  return (
    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
      <div
        className="bg-primary h-full rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function StepLabel({ step, mode }: { step: Step; mode: string }) {
  const labels: Record<Step, string> = {
    info: "Step 1 of 5 — Customer Info",
    scope: "Step 2 of 5 — Describe the Work",
    generating: "Generating your proposal…",
    review: "Step 3 of 5 — Review & Edit",
    confirm: mode === "proposal_email" ? "Step 4 of 5 — Review Email & Send" : "Step 4 of 5 — Confirm & Upload",
    saving: "Saving…",
    done: "Step 5 of 5 — Done!",
  };
  return <p className="text-sm text-muted-foreground mt-2">{labels[step]}</p>;
}

export default function NewProposal() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialMode = params.get("mode") || "proposal_email";
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
  const [isChatListening, setIsChatListening] = useState(false);
  const [isChatTranscribing, setIsChatTranscribing] = useState(false);
  const scopeRecorderRef = useRef<MediaRecorder | null>(null);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);
  const [chatInput, setChatInput] = useState("");
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [emailList, setEmailList] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  const [form, setForm] = useState<FormData>({
    customerName: "",
    customerEmail: "",
    jobAddress: "",
    scopeNotes: "",
    mode: initialMode,
  });

  async function transcribeBlob(blob: Blob): Promise<string | null> {
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
      });
      const data = await res.json() as { transcript?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Transcription failed");
      return data.transcript ?? null;
    } catch (e: any) {
      toast({ title: "Transcription failed", description: e.message, variant: "destructive" });
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
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        setIsTranscribing(true);
        const blob = new Blob(chunks, { type: "audio/webm" });
        const transcript = await transcribeBlob(blob);
        if (transcript) setForm((f) => ({ ...f, scopeNotes: transcript }));
        setIsTranscribing(false);
      };
      scopeRecorderRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      toast({ title: "Microphone access denied", description: "Allow microphone access to use voice", variant: "destructive" });
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
      const rec = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsChatListening(false);
        setIsChatTranscribing(true);
        const blob = new Blob(chunks, { type: "audio/webm" });
        const transcript = await transcribeBlob(blob);
        if (transcript) setChatInput(transcript);
        setIsChatTranscribing(false);
      };
      chatRecorderRef.current = rec;
      rec.start();
      setIsChatListening(true);
    } catch {
      toast({ title: "Microphone access denied", description: "Allow microphone access to use voice", variant: "destructive" });
    }
  }

  function update(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function addEmail() {
    const email = emailInput.trim().replace(/,+$/, "").trim();
    if (!email) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({ title: "Invalid email", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }
    if (emailList.includes(email)) {
      toast({ title: "Duplicate", description: "This email is already added", variant: "destructive" });
      setEmailInput("");
      return;
    }
    const next = [...emailList, email];
    setEmailList(next);
    update("customerEmail", next.join(", "));
    setEmailInput("");
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
      return res.json() as Promise<Proposal>;
    },
    onSuccess: async (p) => {
      setProposalId(p.id);
      setStep("generating");
      generateMutation.mutate(p.id);
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/generate`);
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      setProposal(p);
      setEditedText(p.proposalText || "");
      setEditedEmailSubject(p.emailSubject || "");
      setEditedEmailBody(p.emailBody || "");
      setStep("review");
    },
    onError: (e: any) => {
      toast({ title: "AI generation failed", description: e.message, variant: "destructive" });
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
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => setProposal(p),
  });

  const refineMutation = useMutation({
    mutationFn: async (instruction: string) => {
      await apiRequest("PATCH", `/api/proposals/${proposalId}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${proposalId}/refine`, { instruction });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      setProposal(p);
      setEditedText(p.proposalText || "");
      setChatInput("");
    },
    onError: (e: any) => {
      toast({ title: "Refinement failed", description: e.message, variant: "destructive" });
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
      return res.json() as Promise<{ fileId: string; webViewLink: string; gmailDraftId?: string; proposal: Proposal }>;
    },
    onSuccess: (data) => {
      setProposal(data.proposal);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (e: any) => {
      const code = (e as any).code;
      if (code === "DRIVE_NOT_CONNECTED" || code === "GMAIL_NOT_CONNECTED") {
        toast({
          title: "Google not connected",
          description: "Please connect your Google account first.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Save failed", description: e.message, variant: "destructive" });
      }
      setStep("confirm");
    },
  });

  function handleChatSubmit() {
    const msg = chatInput.trim();
    if (!msg) return;
    refineMutation.mutate(msg);
  }

  function handleNext() {
    if (step === "info") {
      if (!form.customerName.trim()) {
        toast({ title: "Required", description: "Please enter the customer name", variant: "destructive" });
        return;
      }
      if (form.mode === "proposal_email" && emailList.length === 0) {
        if (emailInput.trim()) {
          addEmail();
          return;
        }
        toast({ title: "Required", description: "Add at least one customer email for email mode", variant: "destructive" });
        return;
      }
      setStep("scope");
    } else if (step === "scope") {
      if (!form.scopeNotes.trim()) {
        toast({ title: "Required", description: "Please describe the project scope", variant: "destructive" });
        return;
      }
      createMutation.mutate();
    } else if (step === "review") {
      saveMutation.mutate();
      setStep("confirm");
    } else if (step === "confirm") {
      setStep("saving");
      finalizeMutation.mutate();
    }
  }

  function copyLink() {
    if (proposal?.driveWebLink) {
      navigator.clipboard.writeText(proposal.driveWebLink);
      toast({ title: "Link copied!" });
    }
  }

  const isLoading =
    createMutation.isPending ||
    generateMutation.isPending ||
    refineMutation.isPending ||
    finalizeMutation.isPending;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      <div className="bg-primary px-5 pt-10 pb-5 text-primary-foreground">
        <div className="flex items-center gap-3 mb-3">
          {step !== "done" && (
            <button onClick={() => navigate("/")} className="text-primary-foreground/80">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="flex items-center gap-2 flex-1">
            <HardHat className="w-5 h-5" />
            <span className="font-semibold">
              {form.mode === "proposal_email" ? "New Proposal" : "Proposal Only"}
            </span>
          </div>
        </div>
        <ProgressBar step={step} />
        <StepLabel step={step} mode={form.mode} />
      </div>

      <div className="flex-1 px-5 py-6">

        {step === "info" && (
          <div className="space-y-5">
            <div>
              <Label htmlFor="customerName" className="text-base font-medium">
                Customer Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customerName"
                data-testid="input-customer-name"
                className="mt-1.5 h-12 text-base"
                placeholder="John Smith"
                value={form.customerName}
                onChange={(e) => update("customerName", e.target.value)}
              />
            </div>

            {form.mode === "proposal_email" && (
              <div>
                <Label className="text-base font-medium">
                  Customer Email(s) <span className="text-destructive">*</span>
                </Label>
                <div className="mt-1.5 space-y-2">
                  {emailList.map((email, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-sm truncate" data-testid={`text-email-${i}`}>{email}</span>
                      <button
                        type="button"
                        data-testid={`button-remove-email-${i}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          const next = emailList.filter((_, idx) => idx !== i);
                          setEmailList(next);
                          update("customerEmail", next.join(", "));
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      data-testid="input-customer-email"
                      type="email"
                      className="flex-1 h-12 text-base"
                      placeholder={emailList.length === 0 ? "john@email.com" : "Add another email…"}
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === ",") && emailInput.trim()) {
                          e.preventDefault();
                          addEmail();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-12 px-3"
                      data-testid="button-add-email"
                      onClick={addEmail}
                      disabled={!emailInput.trim()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {emailList.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {emailList.length} recipient{emailList.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label htmlFor="jobAddress" className="text-base font-medium">Job Address</Label>
              <Input
                id="jobAddress"
                data-testid="input-job-address"
                className="mt-1.5 h-12 text-base"
                placeholder="123 Main St, Anytown"
                value={form.jobAddress}
                onChange={(e) => update("jobAddress", e.target.value)}
              />
            </div>
          </div>
        )}

        {step === "scope" && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <p className="text-base font-medium">What work are you doing?</p>
              <p className="text-sm text-muted-foreground">
                Describe the job in your own words — materials, scope, price, timeline.
                The AI will figure out the rest.
              </p>
            </div>

            <button
              data-testid="button-voice"
              type="button"
              onClick={toggleVoice}
              disabled={isTranscribing}
              className={`w-full flex flex-col items-center justify-center gap-3 rounded-2xl p-8 transition-all active:scale-[0.97] disabled:opacity-60 disabled:pointer-events-none ${
                isListening
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/25"
                  : isTranscribing
                  ? "bg-primary/20 text-primary border-2 border-primary/40"
                  : "bg-primary/10 text-primary border-2 border-dashed border-primary/30"
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : isListening ? (
                <MicOff className="w-10 h-10" />
              ) : (
                <Mic className="w-10 h-10" />
              )}
              <span className="text-lg font-semibold">
                {isTranscribing ? "Transcribing…" : isListening ? "Tap to Stop Recording" : "Tap to Record"}
              </span>
              {!isListening && !isTranscribing && (
                <span className="text-sm opacity-70">Describe the job — Whisper will transcribe</span>
              )}
              {isListening && (
                <span className="text-sm opacity-80 animate-pulse">Recording…</span>
              )}
            </button>

            <div className="relative">
              <p className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide font-medium">
                Or type it out:
              </p>
              <Textarea
                data-testid="textarea-scope"
                className="text-base min-h-[180px] resize-none"
                placeholder="Example: Tear out old deck, build new 16x20 composite deck with aluminum railing. Customer wants Trex Enhance in Toasted Sand. Price around $18,000, should take about 3 weeks."
                value={form.scopeNotes}
                onChange={(e) => update("scopeNotes", e.target.value)}
              />
            </div>
          </div>
        )}

        {step === "generating" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-5">
            <div className="bg-primary/10 rounded-full p-6">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold">Creating Your Proposal</h2>
              <p className="text-muted-foreground mt-2 text-sm px-4">
                AI is writing a professional proposal based on your notes…
              </p>
            </div>
          </div>
        )}

        {step === "review" && proposal && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{proposal.proposalTitle}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {proposal.customerName}
                  {proposal.jobAddress ? ` · ${proposal.jobAddress}` : ""}
                </p>
              </div>
              <Button
                data-testid="button-toggle-preview"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? (
                  <>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    Preview
                  </>
                )}
              </Button>
            </div>

            {previewMode ? (
              <ProposalPreview
                title={proposal.proposalTitle || undefined}
                text={editedText}
                customerName={proposal.customerName}
                customerEmail={proposal.customerEmail || undefined}
                jobAddress={proposal.jobAddress || undefined}
                className="max-h-[400px]"
              />
            ) : (
              <Textarea
                data-testid="textarea-proposal"
                className="text-sm min-h-[300px] font-mono leading-relaxed resize-none"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
              />
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Quick adjustments:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  data-testid="button-make-shorter"
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
                  data-testid="button-make-longer"
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
                  data-testid="button-regenerate"
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
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Tell AI what to change:
              </p>
              <div className="flex gap-2">
                <Input
                  ref={chatInputRef}
                  data-testid="input-chat-refine"
                  className="flex-1 h-10 text-sm"
                  placeholder={isChatListening ? "Listening…" : isChatTranscribing ? "Transcribing…" : 'e.g. "Change price to $10,000"'}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && chatInput.trim()) handleChatSubmit();
                  }}
                  disabled={refineMutation.isPending}
                />
                <Button
                  data-testid="button-chat-voice"
                  variant={isChatListening ? "destructive" : "secondary"}
                  size="sm"
                  className="h-10 px-3"
                  onClick={toggleChatVoice}
                  disabled={refineMutation.isPending || isChatTranscribing}
                >
                  {isChatTranscribing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isChatListening ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  data-testid="button-chat-send"
                  size="sm"
                  className="h-10 px-3"
                  onClick={handleChatSubmit}
                  disabled={refineMutation.isPending || !chatInput.trim()}
                >
                  {refineMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
              {isChatListening && (
                <p className="text-sm text-primary mt-2 flex items-center gap-2 animate-pulse">
                  <Mic className="w-3.5 h-3.5" />
                  Listening — tap mic to stop, then send
                </p>
              )}
              {isChatTranscribing && (
                <p className="text-sm text-primary mt-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Transcribing…
                </p>
              )}
              {refineMutation.isPending && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Rewriting…
                </p>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && proposal && (
          <div className="space-y-5">
            <h2 className="text-lg font-bold">Review Before Sending</h2>

            <ProposalPreview
              title={proposal.proposalTitle || undefined}
              text={editedText}
              customerName={proposal.customerName}
              customerEmail={proposal.customerEmail || undefined}
              jobAddress={proposal.jobAddress || undefined}
              className="max-h-[300px]"
            />

            {form.mode === "proposal_email" && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="emailSubject" className="text-sm font-medium">Email Subject</Label>
                  <Input
                    id="emailSubject"
                    data-testid="input-email-subject"
                    className="mt-1 h-10 text-sm"
                    value={editedEmailSubject}
                    onChange={(e) => setEditedEmailSubject(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="emailBody" className="text-sm font-medium">Email Body</Label>
                  <Textarea
                    id="emailBody"
                    data-testid="textarea-email-body"
                    className="mt-1 text-sm min-h-[120px] resize-none"
                    value={editedEmailBody}
                    onChange={(e) => setEditedEmailBody(e.target.value)}
                  />
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                    This will send the email directly to:
                  </p>
                  <div className="space-y-1">
                    {emailList.map((email, i) => (
                      <p key={i} className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5" />
                        <span data-testid={`confirm-email-${i}`}>{email}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-5">
            <div className="bg-primary/10 rounded-full p-6">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold">
                {form.mode === "proposal_email" ? "Sending…" : "Uploading…"}
              </h2>
              <p className="text-muted-foreground mt-2 text-sm px-4">
                Generating Word doc, uploading to Drive
                {form.mode === "proposal_email" ? ", and sending email…" : "…"}
              </p>
            </div>
          </div>
        )}

        {step === "done" && proposal && (
          <div className="space-y-5">
            <div className="flex flex-col items-center text-center py-6 space-y-3">
              <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-4">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold">All Done!</h2>
              <p className="text-muted-foreground text-sm">
                Your proposal has been saved to Google Drive
                {proposal.gmailDraftId ? " and emailed to the customer." : "."}
              </p>
            </div>

            <div className="space-y-3">
              {proposal.driveWebLink && (
                <a
                  href={proposal.driveWebLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-drive"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4 active:bg-muted transition-colors"
                >
                  <ExternalLink className="w-5 h-5 text-green-600" />
                  <span className="font-medium flex-1">Open in Google Drive</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </a>
              )}

              {proposal.gmailDraftId && (
                <a
                  href="https://mail.google.com/mail/#sent"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-gmail"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4 active:bg-muted transition-colors"
                >
                  <Mail className="w-5 h-5 text-green-500" />
                  <span className="font-medium flex-1">Email Sent</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </a>
              )}

              {proposal.driveWebLink && (
                <button
                  onClick={copyLink}
                  data-testid="button-copy-link"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4 active:bg-muted transition-colors text-left"
                >
                  <Copy className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium flex-1">Copy Shareable Link</span>
                </button>
              )}

              <a
                href={`/api/proposals/${proposalId}/docx`}
                data-testid="link-docx"
                className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4 active:bg-muted transition-colors"
              >
                <FileDown className="w-5 h-5 text-muted-foreground" />
                <span className="font-medium flex-1">Download Word Document</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
              </a>
            </div>

            <Button
              data-testid="button-new-proposal"
              className="w-full h-12 mt-4"
              onClick={() => navigate("/")}
            >
              <HardHat className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </div>
        )}
      </div>

      {(step === "info" || step === "scope" || step === "review" || step === "confirm") && (
        <div className="sticky bottom-0 bg-background border-t px-5 py-4">
          <Button
            data-testid="button-next"
            className="w-full h-14 text-base font-semibold gap-2"
            onClick={handleNext}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : step === "confirm" ? (
              <>
                {form.mode === "proposal_email" ? (
                  <>
                    <Send className="w-5 h-5" />
                    Upload & Send Email
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Upload to Drive
                  </>
                )}
              </>
            ) : step === "review" ? (
              <>
                <ArrowRight className="w-5 h-5" />
                {form.mode === "proposal_email" ? "Review Email & Send" : "Confirm & Upload"}
              </>
            ) : (
              <>
                <ArrowRight className="w-5 h-5" />
                Next
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
