import { useLocation } from "wouter";
import { Clock, FileText, Plus, Settings } from "lucide-react";
import logoPath from "@assets/prolynk-logo.png";

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto">
      <div className="bg-primary px-5 pt-8 pb-5 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/95 px-2 py-1.5 shadow-sm">
            <img src={logoPath} alt="ProLynk" className="h-7 w-auto" />
          </div>
          <div>
            <a href="https://system.prolynk.io" target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary-foreground/70 hover:text-primary-foreground transition-colors">Dave · ProLynk</a>
            <h1 className="text-lg font-bold leading-tight">Proposal Builder</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 pb-4 pt-5">
        <div className="space-y-4 rounded-[34px] bg-white/96 p-4 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.55)]">
          <button
            data-testid="button-new-proposal"
            onClick={() => navigate("/new?mode=proposal_email")}
            className="w-full rounded-[30px] bg-[linear-gradient(90deg,#6366FF_0%,#4F46FF_100%)] px-6 py-7 text-left text-white shadow-[0_28px_60px_-34px_rgba(99,102,255,0.5)] transition-transform active:scale-[0.99]"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-white/10 p-4">
                <Plus className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">Primary action</p>
                <h2 className="text-2xl font-semibold tracking-tight">Create Proposal</h2>
                <p className="max-w-sm text-sm leading-6 text-white/75">
                  Customer info, scope, review, then send.
                </p>
              </div>
            </div>
          </button>

          <div className="space-y-2 rounded-[28px] border border-border/80 bg-card px-4 py-4">
            <button
              data-testid="button-recent"
              onClick={() => navigate("/recent")}
              className="flex w-full items-center gap-4 rounded-[22px] px-2 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="rounded-full bg-muted p-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Recent proposals</div>
                <div className="text-sm text-muted-foreground">Open finished proposals and resend if needed.</div>
              </div>
            </button>

            <button
              data-testid="button-proposal-only"
              onClick={() => navigate("/new?mode=proposal_only")}
              className="flex w-full items-center gap-4 rounded-[22px] px-2 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="rounded-full bg-muted p-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">Proposal only</div>
                <div className="text-sm text-muted-foreground">Create it and save it without email.</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="rounded-[28px] border border-border/60 bg-card px-5 py-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-primary/70">How it works</p>
          <div className="space-y-5">
            <div className="flex gap-4 items-start">
              <span className="min-w-[2rem] text-xl font-bold text-primary/25 leading-none">01</span>
              <div>
                <p className="font-semibold leading-snug">Add the customer</p>
                <p className="text-sm text-muted-foreground mt-0.5">Name, email, and address. Takes seconds.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="min-w-[2rem] text-xl font-bold text-primary/25 leading-none">02</span>
              <div>
                <p className="font-semibold leading-snug">Say the job</p>
                <p className="text-sm text-muted-foreground mt-0.5">Speak the scope out loud. AI builds the proposal.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <span className="min-w-[2rem] text-xl font-bold text-primary/25 leading-none">03</span>
              <div>
                <p className="font-semibold leading-snug">Review and send</p>
                <p className="text-sm text-muted-foreground mt-0.5">Check everything, then send with one tap.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-6">
        <button
          data-testid="button-settings"
          onClick={() => navigate("/settings")}
          className="mx-auto flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
      </div>
    </div>
  );
}
