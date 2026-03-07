import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Mic,
  MicOff,
  CheckCircle2,
  RotateCcw,
  Scissors,
  AlignLeft,
  Upload,
  Mail,
  ExternalLink,
  Copy,
  FileDown,
  HardHat,
} from "lucide-react";
import { PROJECT_TYPES } from "@shared/schema";
import type { Proposal } from "@shared/schema";

type Step = "info" | "scope" | "generating" | "review" | "saving" | "done";

interface FormData {
  customerName: string;
  customerEmail: string;
  jobAddress: string;
  projectType: string;
  priceEstimate: string;
  timeline: string;
  scopeNotes: string;
  mode: string;
}

function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ["info", "scope", "generating", "review", "saving", "done"];
  const current = steps.indexOf(step);
  const total = 4; // info, scope, review, done
  const displaySteps = ["info", "scope", "review", "done"];
  const displayIndex = Math.min(displaySteps.indexOf(step as any), 3);
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

function StepLabel({ step }: { step: Step }) {
  const labels: Record<Step, string> = {
    info: "Step 1 of 4 — Job Info",
    scope: "Step 2 of 4 — Describe the Work",
    generating: "Generating your proposal…",
    review: "Step 3 of 4 — Review",
    saving: "Saving…",
    done: "Step 4 of 4 — Done!",
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
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const [form, setForm] = useState<FormData>({
    customerName: "",
    customerEmail: "",
    jobAddress: "",
    projectType: "",
    priceEstimate: "",
    timeline: "",
    scopeNotes: "",
    mode: initialMode,
  });

  // Voice input setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        const transcript = Array.from(e.results)
          .map((r: any) => r[0].transcript)
          .join(" ");
        setForm((f) => ({ ...f, scopeNotes: transcript }));
      };
      rec.onend = () => setIsListening(false);
      setRecognition(rec);
    }
  }, []);

  function toggleVoice() {
    if (!recognition) {
      toast({ title: "Voice not supported", description: "Use typing instead", variant: "destructive" });
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
    }
  }

  function update(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // Create proposal record
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/proposals", {
        customerName: form.customerName,
        customerEmail: form.customerEmail || null,
        jobAddress: form.jobAddress || null,
        projectType: form.projectType,
        priceEstimate: form.priceEstimate || null,
        timeline: form.timeline || null,
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

  // Generate AI text
  const generateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/proposals/${id}/generate`);
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      setProposal(p);
      setEditedText(p.proposalText || "");
      setStep("review");
    },
    onError: (e: any) => {
      toast({ title: "AI generation failed", description: e.message, variant: "destructive" });
      setStep("scope");
    },
  });

  // Save text edits
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/proposals/${proposalId}`, {
        proposalText: editedText,
      });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => setProposal(p),
  });

  // Refine proposal
  const refineMutation = useMutation({
    mutationFn: async (instruction: "shorter" | "longer" | "regenerate") => {
      // Save current edits first
      await apiRequest("PATCH", `/api/proposals/${proposalId}`, { proposalText: editedText });
      const res = await apiRequest("POST", `/api/proposals/${proposalId}/refine`, { instruction });
      return res.json() as Promise<Proposal>;
    },
    onSuccess: (p) => {
      setProposal(p);
      setEditedText(p.proposalText || "");
    },
    onError: (e: any) => {
      toast({ title: "Refinement failed", description: e.message, variant: "destructive" });
    },
  });

  // Finalize: Drive upload + Gmail draft
  const finalizeMutation = useMutation({
    mutationFn: async () => {
      // Save latest text edits first
      await apiRequest("PATCH", `/api/proposals/${proposalId}`, { proposalText: editedText });
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
          description: "Please connect your Google account first. Check the setup instructions.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Save failed", description: e.message, variant: "destructive" });
      }
      setStep("review");
    },
  });

  function handleNext() {
    if (step === "info") {
      if (!form.customerName.trim()) {
        toast({ title: "Required", description: "Please enter the customer name", variant: "destructive" });
        return;
      }
      if (form.mode === "proposal_email" && !form.customerEmail.trim()) {
        toast({ title: "Required", description: "Customer email is required for email mode", variant: "destructive" });
        return;
      }
      if (!form.projectType) {
        toast({ title: "Required", description: "Please select a project type", variant: "destructive" });
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
      {/* Header */}
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
              {form.mode === "proposal_email" ? "New Proposal + Email" : "Proposal Only"}
            </span>
          </div>
        </div>
        <ProgressBar step={step} />
        <StepLabel step={step} />
      </div>

      {/* Step Content */}
      <div className="flex-1 px-5 py-6">

        {/* ── Step 1: Info ─────────────────────────────── */}
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
                <Label htmlFor="customerEmail" className="text-base font-medium">
                  Customer Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="customerEmail"
                  data-testid="input-customer-email"
                  type="email"
                  className="mt-1.5 h-12 text-base"
                  placeholder="john@email.com"
                  value={form.customerEmail}
                  onChange={(e) => update("customerEmail", e.target.value)}
                />
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

            <div>
              <Label className="text-base font-medium">
                Project Type <span className="text-destructive">*</span>
              </Label>
              <Select value={form.projectType} onValueChange={(v) => update("projectType", v)}>
                <SelectTrigger data-testid="select-project-type" className="mt-1.5 h-12 text-base">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-base py-3">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="priceEstimate" className="text-base font-medium">
                Price / Estimate <span className="text-muted-foreground text-sm font-normal">(optional)</span>
              </Label>
              <Input
                id="priceEstimate"
                data-testid="input-price"
                className="mt-1.5 h-12 text-base"
                placeholder="$5,000 – $7,500"
                value={form.priceEstimate}
                onChange={(e) => update("priceEstimate", e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="timeline" className="text-base font-medium">
                Timeline <span className="text-muted-foreground text-sm font-normal">(optional)</span>
              </Label>
              <Input
                id="timeline"
                data-testid="input-timeline"
                className="mt-1.5 h-12 text-base"
                placeholder="2–3 weeks"
                value={form.timeline}
                onChange={(e) => update("timeline", e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Scope ────────────────────────────── */}
        {step === "scope" && (
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Describe the Project</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Use plain English. Mention what you're replacing, installing, repairing, materials, allowances, exclusions, and anything the customer asked for.
              </p>
            </div>

            <Textarea
              data-testid="textarea-scope"
              className="mt-2 text-base min-h-[220px] resize-none"
              placeholder="Example: Removing existing tile floor in master bath, about 120 sq ft. Installing new porcelain tile (customer picked from showroom). Replacing toilet and vanity. Keeping existing shower. Labor includes demo, prep, tile work, and fixture install. No electrical work included."
              value={form.scopeNotes}
              onChange={(e) => update("scopeNotes", e.target.value)}
            />

            {recognition && (
              <Button
                data-testid="button-voice"
                type="button"
                variant={isListening ? "destructive" : "secondary"}
                className="w-full h-12 gap-2"
                onClick={toggleVoice}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-5 h-5" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic className="w-5 h-5" />
                    Tap to Speak
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── Generating ───────────────────────────────── */}
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

        {/* ── Step 3: Review ──────────────────────────── */}
        {step === "review" && proposal && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold">{proposal.proposalTitle}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {proposal.customerName} · {proposal.projectType}
              </p>
            </div>

            <Textarea
              data-testid="textarea-proposal"
              className="text-sm min-h-[300px] font-mono leading-relaxed resize-none"
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
            />

            {/* Refine buttons */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">
                Adjust proposal:
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
              {refineMutation.isPending && (
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rewriting…
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Saving ───────────────────────────────────── */}
        {step === "saving" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-5">
            <div className="bg-primary/10 rounded-full p-6">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold">Saving Your Proposal</h2>
              <p className="text-muted-foreground mt-2 text-sm px-4">
                Generating Word document, uploading to Google Drive
                {form.mode === "proposal_email" ? ", and sending email" : ""}…
              </p>
            </div>
          </div>
        )}

        {/* ── Done ────────────────────────────────────── */}
        {step === "done" && proposal && (
          <div className="space-y-6">
            <div className="flex flex-col items-center py-6 text-center space-y-2">
              <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-4">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold mt-2">All Done!</h2>
              <p className="text-muted-foreground text-sm">
                Your proposal has been saved to Google Drive
                {proposal.gmailDraftId ? " and the email has been sent." : "."}
              </p>
            </div>

            <div className="space-y-3">
              {proposal.driveWebLink && (
                <a
                  href={proposal.driveWebLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-open-proposal"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
                >
                  <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-2.5">
                    <ExternalLink className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Open Proposal in Drive</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{proposal.driveWebLink}</div>
                  </div>
                </a>
              )}

              {proposal.gmailDraftId && (
                <a
                  href="https://mail.google.com/mail/#sent"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-view-sent"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
                >
                  <div className="bg-green-100 dark:bg-green-900/30 rounded-full p-2.5">
                    <Mail className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Email Sent</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Sent to {proposal.customerEmail} — view in Gmail Sent</div>
                  </div>
                </a>
              )}

              {proposal.driveWebLink && (
                <button
                  onClick={copyLink}
                  data-testid="button-copy-link"
                  className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
                >
                  <div className="bg-muted rounded-full p-2.5">
                    <Copy className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="font-medium">Copy Shareable Link</div>
                </button>
              )}

              <a
                href={`/api/proposals/${proposal.id}/docx`}
                data-testid="link-download-docx"
                className="flex items-center gap-3 w-full bg-card border border-card-border rounded-xl p-4"
              >
                <div className="bg-muted rounded-full p-2.5">
                  <FileDown className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="font-medium">Download Word Document</div>
              </a>
            </div>

            <Button
              data-testid="button-new-proposal-again"
              className="w-full h-12"
              onClick={() => navigate("/")}
            >
              Back to Home
            </Button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      {(step === "info" || step === "scope" || step === "review") && (
        <div className="px-5 pb-8 pt-4 border-t border-border flex gap-3">
          {step !== "info" && (
            <Button
              data-testid="button-back"
              variant="secondary"
              className="flex-1 h-12"
              onClick={() => {
                if (step === "scope") setStep("info");
                else if (step === "review") setStep("scope");
              }}
              disabled={isLoading}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <Button
            data-testid="button-next"
            className="flex-1 h-12"
            onClick={handleNext}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step === "review" ? (
              <>
                <Upload className="w-4 h-4 mr-1" />
                Save & Finalize
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
