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
  Send,
  SkipForward,
  Upload,
  X,
  Zap,
} from "lucide-react";
import type { Proposal } from "@shared/schema";
import ProposalPreview from "@/components/proposal-preview";

type Step = "info" | "guided" | "generating" | "review" | "confirm" | "saving" | "done";

// ─── Guided Prompts ─────────────────────────────────────────────────────────
const GUIDED_PROMPTS = [
  {
    key: "customerRequest",
    question: "What does the customer want done?",
    placeholder: "e.g. Replace the water heater in the garage",
    hint: "Describe the main job in plain words.",
    optional: false,
  },
  {
    key: "includedWork",
    question: "What work is included?",
    placeholder: "e.g. Remove old unit, install new 40-gal gas heater, connect lines, test everything",
    hint: "List each task. Speak naturally — rough is fine.",
    optional: false,
  },
  {
    key: "exclusions",
    question: "Anything excluded, uncertain, or still to be decided?",
    placeholder: "e.g. Permit fees not included, homeowner picks the brand",
    hint: "Optional — skip if nothing to add.",
    optional: true,
  },
  {
    key: "pricing",
    question: "What is the price or price range?",
    placeholder: "e.g. $1,800 flat, or $1,500–$2,000 depending on fixtures",
    hint: "Rough or exact — both work fine.",
    optional: true,
  },
  {
    key: "timeline",
    question: "When can you start and how long should it take?",
    placeholder: "e.g. Can start Monday, 1–2 days to complete",
    hint: "Optional but helpful for the customer.",
    optional: true,
  },
] as const;

type StepKey = (typeof GUIDED_PROMPTS)[number]["key"];

// ─── Draft Preview Helpers ──────────────────────────────────────────────────
function inferTradeType(text: string): string {
  const t = text.toLowerCase();
  if (/plumb|pipe|water.?heat|drain|toilet|faucet|fixture/.test(t)) return "PLUMBING";
  if (/electric|wir|circuit|panel|outlet|breaker/.test(t)) return "ELECTRICAL";
  if (/paint|coat|prime|stain|color|wall/.test(t)) return "PAINTING";
  if (/hvac|heat|cool|\bac\b|air.?condit|furnac|duct|vent/.test(t)) return "HVAC";
  if (/floor|tile|carpet|hardwood|laminate|vinyl/.test(t)) return "FLOORING";
  if (/bathroom|bath|shower|tub/.test(t)) return "BATHROOM RENOVATION";
  if (/kitchen/.test(t)) return "KITCHEN";
  if (/roof|shingle|gutter/.test(t)) return "ROOFING";
  if (/deck|fence|patio/.test(t)) return "DECK";
  if (/window|door/.test(t)) return "WINDOWS & DOORS";
  if (/drywall|patch|plaster/.test(t)) return "DRYWALL";
  if (/handyman|repair|fix/.test(t)) return "HOME REPAIR";
  return "RENOVATION";
}

function extractBullets(text: string): string[] {
  if (!text.trim()) return [];
  const parts = text
    .split(/\n|(?:,\s*(?=\S))|(?:\s+and\s+(?=[a-z]))/i)
    .map((s) => s.trim().replace(/^[-•*]\s*/, "").trim())
    .filter((s) => s.length > 3);
  return parts.length > 0 ? parts : [text.trim()];
}

function buildDraftTitle(transcripts: Record<string, string>, jobAddress?: string): string {
  const source = `${transcripts.customerRequest || ""} ${transcripts.includedWork || ""}`;
  const trade = inferTradeType(source);
  const title = `${trade} PROPOSAL`;
  return jobAddress ? `${title}\n${jobAddress}` : title;
}

function buildDraftText(transcripts: Record<string, string>): string {
  const hasContent = Object.values(transcripts).some((v) => v.trim());
  if (!hasContent) return "";

  const parts: string[] = [];

  const scopeSource = transcripts.includedWork || transcripts.customerRequest;
  if (scopeSource) {
    parts.push("PROJECT SCOPE");
    parts.push("");
    extractBullets(scopeSource).forEach((b) => parts.push(`- ${b}`));
    parts.push("");
  }

  if (transcripts.pricing) {
    parts.push("TOTAL INVESTMENT");
    parts.push("");
    parts.push(transcripts.pricing.trim());
    parts.push("");
  }

  const details: string[] = [];
  if (transcripts.timeline) {
    details.push(`Estimated timeline: ${transcripts.timeline.trim()}`);
  }
  if (transcripts.exclusions) {
    extractBullets(transcripts.exclusions).forEach((b) => details.push(b));
  }
  if (details.length > 0) {
    parts.push("PROJECT DETAILS");
    parts.push("");
    details.forEach((d) => parts.push(`- ${d}`));
    parts.push("");
  }

  if (parts.length > 0) {
    parts.push("ACCEPTANCE OF PROPOSAL");
    parts.push("");
    parts.push("Client Name (Printed): __________________________________________");
    parts.push("");
    parts.push("Client Signature: ________________________________________________");
    parts.push("");
    parts.push("Date: _______________________");
  }

  return parts.join("\n");
}

function buildScopeNotes(transcripts: Record<string, string>): string {
  const sections: string[] = [];
  if (transcripts.customerRequest) sections.push(`CUSTOMER REQUEST:\n${transcripts.customerRequest}`);
  if (transcripts.includedWork) sections.push(`INCLUDED WORK:\n${transcripts.includedWork}`);
  if (transcripts.exclusions) sections.push(`EXCLUSIONS / ASSUMPTIONS:\n${transcripts.exclusions}`);
  if (transcripts.pricing) sections.push(`PRICING:\n${transcripts.pricing}`);
  if (transcripts.timeline) sections.push(`TIMELINE:\n${transcripts.timeline}`);
  return sections.join("\n\n");
}

// ─── Types ──────────────────────────────────────────────────────────────────
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
    return { message: parsed.error || error.message, code: parsed.code };
  } catch {
    return { message: error.message };
  }
}

// ─── UI Subcomponents ────────────────────────────────────────────────────────
function ProgressBar({ step }: { step: Step }) {
  const displaySteps = ["info", "guided", "review", "confirm", "done"];
  let displayIndex = displaySteps.indexOf(step);
  if (step === "generating") displayIndex = 2;
  if (step === "saving") displayIndex = 3;
  const progress = ((Math.max(displayIndex, 0) + 1) / displaySteps.length) * 100;
  return (
    <div className="w-full rounded-full bg-white/20 p-0.5">
      <div className="h-2 rounded-full bg-white/15">
        <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

function StepLabel({ step, mode }: { step: Step; mode: string }) {
  const labels: Record<Step, string> = {
    info: "Step 1 of 5  Customer details",
    guided: "Step 2 of 5  Describe the work",
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

function SuccessRow({ active, label, detail }: { active: boolean; label: string; detail: string }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-4 ${
        active ? "border-primary/20 bg-primary/5" : "border-border bg-card"
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

// ─── Main Component ─────────────────────────────────────────────────────────
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
  const [emailList, setEmailList] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeResult | null>(null);

  // Guided prompts state
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [stepTranscripts, setStepTranscripts] = useState<Record<StepKey, string>>({
    customerRequest: "",
    includedWork: "",
    exclusions: "",
    pricing: "",
    timeline: "",
  });
  const [isGuidedListening, setIsGuidedListening] = useState(false);
  const [isGuidedTranscribing, setIsGuidedTranscribing] = useState(false);
  const guidedRecorderRef = useRef<MediaRecorder | null>(null);

  // Chat/refine state (review step)
  const [isChatListening, setIsChatListening] = useState(false);
  const [isChatTranscribing, setIsChatTranscribing] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [showTypedAiInput, setShowTypedAiInput] = useState(false);
  const chatRecorderRef = useRef<MediaRecorder | null>(null);
  const editExactTextRef = useRef<HTMLDivElement | null>(null);

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
        ? draftProposal.customerEmail.split(",").map((e) => e.trim()).filter(Boolean)
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
    } else {
      setStep("info");
    }
  }, [draftProposal, initialMode]);

  function update(field: keyof FormData, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function goBack() {
    if (step === "info") navigate("/");
    else if (step === "guided") {
      if (guidedStepIndex > 0) {
        setGuidedStepIndex((i) => i - 1);
      } else {
        setStep("info");
      }
    } else if (step === "review") setStep("guided");
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

  // ─── Guided voice recording ────────────────────────────────────────────────
  async function toggleGuidedVoice() {
    if (isGuidedListening) {
      guidedRecorderRef.current?.stop();
      setIsGuidedListening(false);
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
        setIsGuidedListening(false);
        setIsGuidedTranscribing(true);
        const transcript = await transcribeBlob(new Blob(chunks, { type: "audio/webm" }));
        if (transcript) {
          const key = GUIDED_PROMPTS[guidedStepIndex].key;
          setStepTranscripts((current) => ({
            ...current,
            [key]: current[key] ? `${current[key].trim()} ${transcript}` : transcript,
          }));
        }
        setIsGuidedTranscribing(false);
      };
      guidedRecorderRef.current = recorder;
      recorder.start();
      setIsGuidedListening(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Allow microphone access to record your answer.",
        variant: "destructive",
      });
    }
  }

  // ─── Chat/refine voice recording ──────────────────────────────────────────
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

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (scopeNotes: string) => {
      const res = await apiRequest("POST", "/api/proposals", {
        customerName: form.customerName,
        customerEmail: form.customerEmail || null,
        jobAddress: form.jobAddress || null,
        projectType: "General",
        scopeNotes,
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
      setStep("guided");
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
      setStep("guided");
      setGuidedStepIndex(0);
      return;
    }

    if (step === "guided") {
      if (guidedStepIndex < GUIDED_PROMPTS.length - 1) {
        setGuidedStepIndex((i) => i + 1);
        return;
      }
      // Last prompt — fall through to generate
      triggerGenerate();
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

  function triggerGenerate() {
    const hasContent =
      stepTranscripts.customerRequest.trim() || stepTranscripts.includedWork.trim();
    if (!hasContent) {
      toast({
        title: "Describe the job first",
        description: "Answer at least the first prompt before generating.",
        variant: "destructive",
      });
      setGuidedStepIndex(0);
      return;
    }
    const scopeNotes = buildScopeNotes(stepTranscripts);
    createMutation.mutate(scopeNotes);
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
  const currentPrompt = GUIDED_PROMPTS[guidedStepIndex];
  const currentTranscript = stepTranscripts[currentPrompt?.key as StepKey] ?? "";
  const draftTitle = buildDraftTitle(stepTranscripts, form.jobAddress);
  const draftText = buildDraftText(stepTranscripts);
  const hasDraftContent = Object.values(stepTranscripts).some((v) => v.trim());

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f8f6_0%,#ffffff_22%,#ffffff_100%)]">
      <div className={`mx-auto flex min-h-screen flex-col ${step === "guided" ? "max-w-5xl" : "max-w-2xl"}`}>
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className="bg-primary px-5 pb-6 pt-10 text-primary-foreground">
          <div className="mb-4 flex items-center gap-3">
            {(step === "info" || step === "guided" || step === "review" || step === "confirm") && (
              <button
                onClick={goBack}
                className="rounded-full p-1 text-primary-foreground/80 transition-colors hover:text-primary-foreground"
              >
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

        {/* ─── Main content ────────────────────────────────────────── */}
        <div className="flex-1 px-5 py-6">

          {/* INFO STEP */}
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
                                const next = emailList.filter((_, i) => i !== index);
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
                      {emailList.length > 0
                        ? `${emailList.length} recipient${emailList.length > 1 ? "s" : ""} ready for send.`
                        : "Add the customer email now so the final send step is one tap."}
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

          {/* GUIDED STEP */}
          {step === "guided" && (
            <div className="space-y-4">
              {/* Customer info bar */}
              <div className="flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{form.customerName}</p>
                  {form.jobAddress && (
                    <p className="text-sm text-muted-foreground truncate">{form.jobAddress}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex gap-1">
                    {GUIDED_PROMPTS.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setGuidedStepIndex(i)}
                        className={`h-2 rounded-full transition-all ${
                          i === guidedStepIndex
                            ? "w-5 bg-primary"
                            : stepTranscripts[GUIDED_PROMPTS[i].key as StepKey]
                            ? "w-2 bg-primary/60"
                            : "w-2 bg-border"
                        }`}
                        data-testid={`button-prompt-dot-${i}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground ml-1">
                    {guidedStepIndex + 1}/{GUIDED_PROMPTS.length}
                  </span>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="flex flex-col lg:flex-row gap-5 items-start">
                {/* Left: Prompt + recorder */}
                <div className="w-full lg:w-[420px] flex-shrink-0 space-y-3">
                  {/* Prompt card */}
                  <div className="rounded-[28px] border border-border/80 bg-card px-5 py-6 shadow-[0_20px_60px_-35px_rgba(17,24,39,0.25)] space-y-5">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">
                        Prompt {guidedStepIndex + 1}
                      </p>
                      <h2 className="text-xl font-semibold tracking-tight leading-snug">
                        {currentPrompt.question}
                      </h2>
                      {currentPrompt.hint && (
                        <p className="text-sm text-muted-foreground">{currentPrompt.hint}</p>
                      )}
                    </div>

                    {/* Voice button */}
                    <button
                      type="button"
                      data-testid="button-guided-voice"
                      onClick={toggleGuidedVoice}
                      disabled={isGuidedTranscribing}
                      className={`w-full rounded-[22px] border px-5 py-5 text-left transition-all active:scale-[0.99] ${
                        isGuidedListening
                          ? "border-amber-300 bg-amber-50 text-amber-900 shadow-[0_12px_30px_-15px_rgba(251,191,36,0.3)]"
                          : isGuidedTranscribing
                          ? "border-primary/30 bg-primary/8 text-primary"
                          : "border-primary/20 bg-[linear-gradient(180deg,rgba(22,163,74,0.08),rgba(255,255,255,0.96))] text-foreground shadow-[0_12px_30px_-18px_rgba(22,163,74,0.3)]"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full ${
                            isGuidedListening
                              ? "bg-amber-200 animate-pulse"
                              : isGuidedTranscribing
                              ? "bg-primary/15"
                              : "bg-primary/10"
                          }`}
                        >
                          {isGuidedTranscribing ? (
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                          ) : isGuidedListening ? (
                            <MicOff className="h-6 w-6 text-amber-700" />
                          ) : (
                            <Mic className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[15px]">
                            {isGuidedTranscribing
                              ? "Transcribing…"
                              : isGuidedListening
                              ? "Tap to stop"
                              : currentTranscript
                              ? "Tap to record more"
                              : "Tap to speak"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {isGuidedListening
                              ? "Listening — speak naturally"
                              : "Or type below"}
                          </p>
                        </div>
                      </div>
                    </button>

                    {/* Transcript / text area */}
                    <Textarea
                      data-testid={`textarea-prompt-${guidedStepIndex}`}
                      className="min-h-[100px] rounded-[20px] border-border/80 bg-background text-base leading-7 resize-none"
                      placeholder={currentPrompt.placeholder}
                      value={currentTranscript}
                      onChange={(e) => {
                        const key = currentPrompt.key as StepKey;
                        setStepTranscripts((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }));
                      }}
                    />

                    {/* Clear button */}
                    {currentTranscript && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => {
                          const key = currentPrompt.key as StepKey;
                          setStepTranscripts((current) => ({ ...current, [key]: "" }));
                        }}
                      >
                        Clear this answer
                      </button>
                    )}
                  </div>

                  {/* Navigation row */}
                  <div className="flex items-center gap-2">
                    {guidedStepIndex > 0 && (
                      <Button
                        variant="secondary"
                        className="h-10 rounded-2xl px-4 text-sm"
                        onClick={() => setGuidedStepIndex((i) => i - 1)}
                        data-testid="button-guided-back"
                      >
                        <ArrowLeft className="mr-1.5 h-4 w-4" />
                        Back
                      </Button>
                    )}
                    <div className="flex-1" />
                    {currentPrompt.optional && !currentTranscript && (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
                        onClick={() => {
                          if (guidedStepIndex < GUIDED_PROMPTS.length - 1) {
                            setGuidedStepIndex((i) => i + 1);
                          } else {
                            triggerGenerate();
                          }
                        }}
                        data-testid="button-guided-skip"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                        Skip
                      </button>
                    )}
                    {guidedStepIndex < GUIDED_PROMPTS.length - 1 ? (
                      <Button
                        className="h-10 rounded-2xl px-5 text-sm"
                        onClick={() => setGuidedStepIndex((i) => i + 1)}
                        data-testid="button-guided-next"
                      >
                        Next
                        <ArrowRight className="ml-1.5 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        className="h-10 rounded-2xl px-5 text-sm"
                        onClick={triggerGenerate}
                        disabled={isLoading}
                        data-testid="button-guided-generate"
                      >
                        {isLoading ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="mr-1.5 h-4 w-4" />
                        )}
                        Generate
                      </Button>
                    )}
                  </div>
                </div>

                {/* Right: Live draft preview */}
                <div className="w-full flex-1 min-w-0">
                  {hasDraftContent ? (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70 px-1">
                        Live draft preview
                      </p>
                      <ProposalPreview
                        title={draftTitle}
                        text={draftText}
                        customerName={form.customerName}
                        customerEmail={form.customerEmail || undefined}
                        jobAddress={form.jobAddress || undefined}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-border/60 bg-muted/20 px-6 py-14 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <Mic className="h-5 w-5 text-primary/60" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Your proposal preview will appear here
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        It updates as you answer each prompt
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GENERATING STEP */}
          {step === "generating" && (
            <StageCard
              eyebrow="Preparing the document"
              title="Building the proposal draft"
              description="Translating your field notes into a clean, customer-ready proposal."
              statuses={[
                "Writing the proposal language",
                "Organizing sections and pricing",
                "Preparing the customer-ready document",
              ]}
            />
          )}

          {/* REVIEW STEP */}
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
                  <button
                    onClick={() => editExactTextRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    Edit
                  </button>
                </div>

                <ProposalPreview
                  title={proposal.proposalTitle || undefined}
                  text={editedText}
                  customerName={proposal.customerName}
                  customerEmail={proposal.customerEmail || undefined}
                  jobAddress={proposal.jobAddress || undefined}
                />

                <div ref={editExactTextRef} className="space-y-2 rounded-2xl border border-border/80 bg-background px-4 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Edit exact text</p>
                  <Textarea
                    data-testid="textarea-proposal"
                    className="min-h-[220px] rounded-[24px] border-border/80 bg-card px-5 py-5 font-mono text-sm leading-7 resize-none"
                    value={editedText}
                    onChange={(event) => setEditedText(event.target.value)}
                  />
                </div>
              </div>

              {/* DOCX download link */}
              {proposalId && (
                <a
                  href={`/api/proposals/${proposalId}/docx`}
                  data-testid="link-docx-review"
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-sm transition-colors hover:bg-muted/40"
                >
                  <FileDown className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">Download Word document preview</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </a>
              )}
            </div>
          )}

          {/* CONFIRM STEP */}
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

          {/* SAVING STEP */}
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
                  ? ["Generating the Word document", "Saving the file to Google Drive", "Sending the customer email"]
                  : ["Generating the Word document", "Saving the file to Google Drive", "Preparing the finished links"]
              }
            />
          )}

          {/* DONE STEP */}
          {step === "done" && proposal && doneState && (
            <div className="space-y-6">
              <div className="space-y-3 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-primary/15 bg-primary/10">
                  <CheckCircle2 className="h-10 w-10 text-primary" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">Proposal completed</p>
                <h1 className="text-3xl font-semibold tracking-tight">Everything is ready.</h1>
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
                  data-testid="button-go-home"
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

        {/* ─── Sticky footer ───────────────────────────────────────── */}
        {(step === "info" || step === "guided" || step === "review" || step === "confirm") && (
          <div className={`sticky bottom-0 border-t bg-background/95 px-5 py-4 backdrop-blur ${step === "guided" ? "max-w-5xl" : ""}`}>
            {/* Review step: AI chat bar */}
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

                <div className="flex flex-wrap gap-2 pb-1">
                  {["shorter", "longer", "regenerate"].map((shortcut) => (
                    <button
                      key={shortcut}
                      data-testid={`button-shortcut-${shortcut}`}
                      className="rounded-full border border-border/80 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/50 disabled:opacity-50"
                      onClick={() => refineMutation.mutate(shortcut)}
                      disabled={refineMutation.isPending}
                    >
                      {shortcut.charAt(0).toUpperCase() + shortcut.slice(1)}
                    </button>
                  ))}
                </div>

                <Button
                  data-testid="button-chat-voice-footer"
                  variant="secondary"
                  className={`h-13 w-auto min-w-[220px] rounded-2xl px-5 text-[15px] font-semibold ${
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

            {/* Guided step: Generate button in footer */}
            {step === "guided" && (
              <Button
                data-testid="button-generate-proposal"
                className="mb-3 h-12 w-full rounded-2xl text-base font-semibold"
                onClick={triggerGenerate}
                disabled={isLoading || !Object.values(stepTranscripts).some((v) => v.trim())}
                variant="default"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Building proposal…
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-5 w-5" />
                    Generate Proposal
                  </>
                )}
              </Button>
            )}

            {step !== "guided" && (
              <Button
                data-testid="button-next"
                className="h-14 w-full rounded-2xl text-base font-semibold"
                onClick={handleNext}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : step === "confirm" ? (
                  form.mode === "proposal_email" ? (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Send proposal
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-5 w-5" />
                      Save proposal
                    </>
                  )
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}
