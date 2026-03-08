import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Plus, Clock, HardHat, FileText, Settings } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary px-6 pt-12 pb-10 text-primary-foreground">
        <div className="flex items-center gap-3 mb-2">
          <HardHat className="w-8 h-8" />
          <h1 className="text-2xl font-bold tracking-tight">Proposal Builder</h1>
        </div>
        <p className="text-primary-foreground/80 text-sm">
          Create professional proposals in minutes
        </p>
      </div>

      <div className="flex-1 px-5 py-8 space-y-4">
        <button
          data-testid="button-new-proposal"
          onClick={() => navigate("/new?mode=proposal_email")}
          className="w-full bg-primary text-primary-foreground rounded-xl p-6 flex items-center gap-4 text-left shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="bg-primary-foreground/20 rounded-full p-4">
            <Plus className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-xl">Create Proposal</div>
            <div className="text-primary-foreground/75 text-sm mt-1">
              Fill in the basics, AI writes it, sends to customer
            </div>
          </div>
        </button>

        <button
          data-testid="button-recent"
          onClick={() => navigate("/recent")}
          className="w-full bg-card border border-card-border text-card-foreground rounded-xl p-5 flex items-center gap-4 text-left shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="bg-muted rounded-full p-3">
            <Clock className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Recent Proposals</div>
            <div className="text-muted-foreground text-sm mt-0.5">
              View, duplicate, or open saved proposals
            </div>
          </div>
        </button>

        <button
          data-testid="button-proposal-only"
          onClick={() => navigate("/new?mode=proposal_only")}
          className="w-full text-muted-foreground rounded-xl p-4 flex items-center justify-center gap-2 text-sm active:scale-[0.98] transition-transform"
        >
          <FileText className="w-4 h-4" />
          Create without sending email
        </button>
      </div>

      <div className="px-5 pb-8 flex flex-col items-center gap-3">
        <button
          data-testid="button-settings"
          onClick={() => navigate("/settings")}
          className="flex items-center gap-2 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        <p className="text-xs text-muted-foreground">
          Powered by AI • Saves to Google Drive
        </p>
      </div>
    </div>
  );
}
