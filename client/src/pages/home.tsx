import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Clock, HardHat } from "lucide-react";

export default function Home() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="bg-primary px-6 pt-12 pb-10 text-primary-foreground">
        <div className="flex items-center gap-3 mb-2">
          <HardHat className="w-8 h-8" />
          <h1 className="text-2xl font-bold tracking-tight">Proposal Builder</h1>
        </div>
        <p className="text-primary-foreground/80 text-sm">
          Create professional proposals in minutes
        </p>
      </div>

      {/* Main actions */}
      <div className="flex-1 px-5 py-8 space-y-4">
        <button
          data-testid="button-new-proposal"
          onClick={() => navigate("/new?mode=proposal_email")}
          className="w-full bg-primary text-primary-foreground rounded-xl p-5 flex items-center gap-4 text-left shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="bg-primary-foreground/20 rounded-full p-3">
            <Plus className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">New Proposal</div>
            <div className="text-primary-foreground/75 text-sm mt-0.5">
              Generate proposal + Gmail draft with Drive link
            </div>
          </div>
        </button>

        <button
          data-testid="button-proposal-only"
          onClick={() => navigate("/new?mode=proposal_only")}
          className="w-full bg-card border border-card-border text-card-foreground rounded-xl p-5 flex items-center gap-4 text-left shadow-sm active:scale-[0.98] transition-transform"
        >
          <div className="bg-muted rounded-full p-3">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-lg">Proposal Only</div>
            <div className="text-muted-foreground text-sm mt-0.5">
              Save to Google Drive — no email draft
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
      </div>

      <div className="px-5 pb-8 text-center">
        <p className="text-xs text-muted-foreground">
          Powered by AI • Saves to Google Drive
        </p>
      </div>
    </div>
  );
}
