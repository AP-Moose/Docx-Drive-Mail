import { useLocation } from "wouter";
import { Clock, FileText, HardHat, Plus, Settings } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0f5a18_0%,#167a2c_18%,#f6f7f3_18%,#ffffff_100%)]">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
        <div className="px-6 pb-10 pt-12 text-primary-foreground">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full border border-white/15 bg-white/10 p-3">
              <HardHat className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-foreground/70">Inspiring Services</p>
              <h1 className="text-3xl font-semibold tracking-tight">Proposal Builder</h1>
            </div>
          </div>
          <p className="max-w-md text-sm leading-6 text-primary-foreground/80">
            Build the proposal, save it to Drive, and send it out.
          </p>
        </div>

        <div className="flex-1 px-5 pb-8">
          <div className="space-y-4 rounded-[34px] bg-white/96 p-4 shadow-[0_40px_90px_-50px_rgba(15,23,42,0.55)]">
            <button
              data-testid="button-new-proposal"
              onClick={() => navigate("/new?mode=proposal_email")}
              className="w-full rounded-[30px] bg-[linear-gradient(180deg,#14532d_0%,#166534_100%)] px-6 py-7 text-left text-white shadow-[0_28px_60px_-34px_rgba(22,101,52,0.7)] transition-transform active:scale-[0.99]"
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

        <div className="px-5 pb-8">
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
    </div>
  );
}
