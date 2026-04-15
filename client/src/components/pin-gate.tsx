import { useState, useEffect, useRef } from "react";
import logoPath from "@assets/prolynk-logo.png";

const PIN_STORAGE_KEY = "app_pin_verified";

interface PinCheckResponse {
  success: boolean;
  pinRequired?: boolean;
  error?: string;
}

interface PinGateProps {
  children: React.ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const [status, setStatus] = useState<"checking" | "locked" | "unlocked">("checking");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const storedPin = localStorage.getItem(PIN_STORAGE_KEY);
    verifyPin(storedPin ?? "");
  }, []);

  useEffect(() => {
    if (status === "locked") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [status]);

  async function verifyPin(candidate: string) {
    try {
      const resp = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: candidate }),
      });
      const data: PinCheckResponse = await resp.json() as PinCheckResponse;

      if (data.success) {
        if (data.pinRequired) {
          localStorage.setItem(PIN_STORAGE_KEY, candidate);
        } else {
          localStorage.removeItem(PIN_STORAGE_KEY);
        }
        setStatus("unlocked");
      } else {
        localStorage.removeItem(PIN_STORAGE_KEY);
        setStatus("locked");
      }
    } catch {
      setStatus("locked");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pin || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const resp = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data: PinCheckResponse = await resp.json() as PinCheckResponse;

      if (data.success) {
        localStorage.setItem(PIN_STORAGE_KEY, pin);
        setStatus("unlocked");
      } else {
        setError("Incorrect PIN");
        setPin("");
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch {
      setError("Could not verify PIN. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unlocked") {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="bg-primary px-5 pt-10 pb-8 flex flex-col items-center gap-4">
        <img
          src={logoPath}
          alt="ProLynk"
          className="h-32 w-auto max-w-[280px] object-contain"
          data-testid="img-logo"
        />
        <div className="text-center text-primary-foreground">
          <p className="text-sm opacity-80 mt-0.5">Proposal Builder</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 -mt-4">
        <div className="w-full max-w-xs bg-card border border-border rounded-2xl shadow-lg px-6 py-8 flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground">Enter your PIN</h2>
            <p className="text-sm text-muted-foreground mt-1">Access is protected. Enter your PIN to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <input
                ref={inputRef}
                data-testid="input-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setPin(val);
                  setError("");
                }}
                placeholder="••••"
                className={`w-full text-center text-2xl tracking-[0.5em] font-mono rounded-xl border px-4 py-4 bg-background text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary ${
                  error
                    ? "border-red-400 focus:ring-red-400"
                    : "border-input focus:border-primary"
                }`}
                autoComplete="current-password"
              />
              {error && (
                <p
                  data-testid="text-pin-error"
                  className="text-sm text-red-500 text-center font-medium"
                >
                  {error}
                </p>
              )}
            </div>

            <button
              data-testid="button-pin-submit"
              type="submit"
              disabled={pin.length < 4 || submitting}
              className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 text-base font-semibold disabled:opacity-50 active:scale-95 transition-transform"
            >
              {submitting ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
