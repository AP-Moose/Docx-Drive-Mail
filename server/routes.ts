import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { parse as parseCookies } from "cookie";
import { storage } from "./storage";
import { generateProposal, refineProposal } from "./ai";
import { generateDocx } from "./docx-generator";
import { uploadToDrive, setFilePublic, isDriveConnected, testDriveConnection, getDriveUserEmail } from "./google-drive";
import { sendGmailMessage, isGmailConnected, testGmailConnection, getGmailUserEmail } from "./google-mail";
import { transcribeAudio } from "./transcribe";
import { insertProposalSchema, type Proposal } from "@shared/schema";
import {
  appConfig,
  hasDatabaseConfig,
  hasGoogleOAuthConfig,
  hasOpenAIConfig,
} from "./config";
import { getGoogleProviderMode } from "./google-auth";

interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  sub?: string;
}

function buildFinalizeResponse(proposal: Proposal) {
  const emailSent = proposal.mode === "proposal_email" ? Boolean(proposal.gmailMessageId) : false;
  const fileSaved = Boolean(proposal.driveFileId && proposal.driveWebLink);

  return {
    proposal,
    completion: {
      proposalReady: Boolean(proposal.proposalText),
      fileSaved,
      emailSent,
      nextStepComplete: proposal.mode === "proposal_email" ? fileSaved && emailSent : fileSaved,
    },
    links: {
      driveWebLink: proposal.driveWebLink ?? undefined,
      gmailSentUrl: emailSent ? "https://mail.google.com/mail/#sent" : undefined,
    },
  };
}

function getRedirectBase(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  return `${proto}://${req.get("host")}`;
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ─── Google OAuth Routes ──────────────────────────────────────────────────
  app.get("/auth/google", (req: Request, res: Response) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return res.redirect("/settings?error=oauth_not_configured");
    }
    const state = randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
      secure: req.headers["x-forwarded-proto"] === "https",
    });
    const redirectUri = `${getRedirectBase(req)}/auth/google/callback`;
    const scopes = [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/gmail.send",
    ];
    const url =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      }).toString();
    res.redirect(url);
  });

  app.get("/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const oauthError = req.query.error as string | undefined;
    const returnedState = req.query.state as string | undefined;
    const cookies = parseCookies(req.headers.cookie ?? "");
    const expectedState = cookies.oauth_state;

    res.clearCookie("oauth_state");

    if (oauthError || !code) {
      return res.redirect(`/settings?error=${oauthError ?? "oauth_cancelled"}`);
    }

    if (!returnedState || !expectedState || returnedState !== expectedState) {
      console.warn("OAuth state mismatch — possible CSRF attempt");
      return res.redirect("/settings?error=oauth_state_mismatch");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.redirect("/settings?error=oauth_not_configured");
    }

    try {
      const redirectUri = `${getRedirectBase(req)}/auth/google/callback`;

      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens: OAuthTokenResponse = await tokenResp.json() as OAuthTokenResponse;
      if (!tokens.access_token) {
        console.error("Token exchange failed:", tokens);
        return res.redirect("/settings?error=token_exchange_failed");
      }

      let email: string | null = null;
      try {
        const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const user: GoogleUserInfo = await userResp.json() as GoogleUserInfo;
        email = user.email ?? null;
      } catch {
        // Non-fatal — email is cosmetic
      }

      const tokenExpiry = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await storage.upsertGoogleToken({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        tokenExpiry,
        email,
        scope: tokens.scope ?? null,
      });

      res.redirect("/settings?connected=true");
    } catch (e) {
      console.error("OAuth callback error:", e);
      res.redirect("/settings?error=oauth_failed");
    }
  });

  app.post("/auth/google/disconnect", async (_req: Request, res: Response) => {
    try {
      await storage.deleteGoogleToken();
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  // ─── PIN Auth ─────────────────────────────────────────────────────────────
  app.post("/api/auth/pin", (req: Request, res: Response) => {
    const appPin = process.env.APP_PIN;
    if (!appPin) {
      return res.json({ success: true, pinRequired: false });
    }
    const { pin } = req.body as { pin?: string };
    if (!pin) {
      return res.status(400).json({ success: false, error: "PIN required" });
    }
    if (pin === appPin) {
      return res.json({ success: true, pinRequired: true });
    }
    return res.json({ success: false, pinRequired: true, error: "Incorrect PIN" });
  });

  // ─── Status ────────────────────────────────────────────────────────────────
  app.get("/api/status", async (_req: Request, res: Response) => {
    const [drive, gmail] = await Promise.all([isDriveConnected(), isGmailConnected()]);
    res.json({ drive, gmail });
  });

  app.get("/api/settings/status", async (_req: Request, res: Response) => {
    try {
      const [driveOk, gmailOk, driveEmail, gmailEmail] = await Promise.all([
        testDriveConnection(),
        testGmailConnection(),
        getDriveUserEmail(),
        getGmailUserEmail(),
      ]);
      res.json({
        drive: { connected: driveOk, email: driveEmail ?? undefined },
        gmail: { connected: gmailOk, email: gmailEmail ?? undefined },
      });
    } catch {
      res.json({
        drive: { connected: false },
        gmail: { connected: false },
      });
    }
  });

  app.get("/api/settings/runtime", (_req: Request, res: Response) => {
    const providerMode = getGoogleProviderMode();

    res.json({
      openai: {
        configured: hasOpenAIConfig(),
        model: appConfig.openaiChatModel,
        transcriptionModel: appConfig.openaiTranscriptionModel,
      },
      database: {
        configured: hasDatabaseConfig(),
        connected: hasDatabaseConfig(),
      },
      google: {
        providerMode,
        oauthConfigured: hasGoogleOAuthConfig(),
        usingReplitConnectors: providerMode === "replit",
      },
    });
  });

  // ─── Transcribe ────────────────────────────────────────────────────────────
  app.post(
    "/api/transcribe",
    express.raw({ type: "*/*", limit: "50mb" }),
    async (req: Request, res: Response) => {
      try {
        if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
          return res.status(400).json({ error: "No audio data received" });
        }
        const transcript = await transcribeAudio(req.body);
        res.json({ transcript });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transcription failed";
        res.status(500).json({ error: msg });
      }
    }
  );

  // ─── Proposals CRUD ─────────────────────────────────────────────────────────
  app.get("/api/proposals", async (_req: Request, res: Response) => {
    try {
      const list = await storage.getAllProposals();
      res.json(list);
    } catch {
      res.status(500).json({ error: "Failed to load proposals" });
    }
  });

  app.get("/api/proposals/:id", async (req: Request, res: Response) => {
    try {
      const p = await storage.getProposal(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "Not found" });
      res.json(p);
    } catch {
      res.status(500).json({ error: "Failed to load proposal" });
    }
  });

  app.post("/api/proposals", async (req: Request, res: Response) => {
    try {
      const parsed = insertProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      const proposal = await storage.createProposal(parsed.data);
      res.status(201).json(proposal);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Failed to create proposal" });
    }
  });

  app.patch("/api/proposals/:id", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.updateProposal(Number(req.params.id), req.body);
      res.json(proposal);
    } catch (e) {
      if ((e as Error).message === "NOT_FOUND") {
        return res.status(404).json({ error: "Not found" });
      }
      res.status(500).json({ error: "Failed to update proposal" });
    }
  });

  app.delete("/api/proposals/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteProposal(Number(req.params.id));
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete proposal" });
    }
  });

  // ─── AI Generation ──────────────────────────────────────────────────────────
  app.post("/api/proposals/:id/generate", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal) return res.status(404).json({ error: "Not found" });

      const generated = await generateProposal(
        proposal.customerName,
        proposal.customerEmail,
        proposal.jobAddress,
        proposal.scopeNotes,
        proposal.mode
      );

      const updated = await storage.updateProposal(proposal.id, {
        proposalTitle: generated.title,
        proposalText: generated.body,
        emailSubject: generated.emailSubject,
        emailBody: generated.emailBody,
        projectType: generated.projectType,
        status: "generated",
      });

      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: (e as Error).message || "AI generation failed" });
    }
  });

  app.post("/api/proposals/:id/refine", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal) return res.status(404).json({ error: "Not found" });

      const { instruction } = req.body as { instruction: string };
      const result = await refineProposal(
        proposal.proposalText || "",
        instruction,
        proposal
      );

      const updated = await storage.updateProposal(proposal.id, {
        proposalText: result.body,
      });

      res.json(updated);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: (e as Error).message || "Refinement failed" });
    }
  });

  // ─── DOCX download ─────────────────────────────────────────────────────────
  app.get("/api/proposals/:id/docx", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal not generated yet" });
      }

      const { buffer, filename } = await generateDocx(proposal);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "DOCX generation failed" });
    }
  });

  // ─── Drive Upload ───────────────────────────────────────────────────────────
  app.post("/api/proposals/:id/drive-upload", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal not generated yet" });
      }

      const { buffer, filename } = await generateDocx(proposal);

      const { fileId, webViewLink } = await uploadToDrive(
        buffer,
        filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        proposal.customerName
      );

      await setFilePublic(fileId);

      const updated = await storage.updateProposal(proposal.id, {
        driveFileId: fileId,
        driveWebLink: webViewLink,
        status: "saved",
      });

      res.json({ fileId, webViewLink, proposal: updated });
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof Error && e.message === "GOOGLE_DRIVE_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Google Drive is not connected. Please connect your Google account.",
          code: "DRIVE_NOT_CONNECTED",
        });
      }
      const msg = e instanceof Error ? e.message : "Drive upload failed";
      res.status(500).json({ error: `Drive upload failed: ${msg}` });
    }
  });

  // ─── Gmail Send ─────────────────────────────────────────────────────────────
  app.post("/api/proposals/:id/send-email", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal not generated yet" });
      }
      if (!proposal.customerEmail) {
        return res.status(400).json({ error: "Customer email is required for sending" });
      }
      if (!proposal.driveWebLink) {
        return res.status(400).json({ error: "Proposal must be uploaded to Drive first" });
      }

      const emailBody = (proposal.emailBody || "")
        .replace("[PROPOSAL_LINK]", proposal.driveWebLink);

      const { messageId } = await sendGmailMessage(
        proposal.customerEmail,
        proposal.emailSubject || "Your Proposal",
        emailBody
      );

      const updated = await storage.updateProposal(proposal.id, {
        gmailMessageId: messageId,
        status: "completed",
      });

      res.json(buildFinalizeResponse(updated));
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof Error && e.message === "GMAIL_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Gmail is not connected. Please connect your Google account.",
          code: "GMAIL_NOT_CONNECTED",
        });
      }
      const msg = e instanceof Error ? e.message : "Gmail send failed";
      res.status(500).json({ error: `Gmail send failed: ${msg}` });
    }
  });

  // ─── Full pipeline ────────────────────────────────────────────────────────
  app.post("/api/proposals/:id/finalize", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal text is required" });
      }

      const { buffer, filename } = await generateDocx(proposal);

      const { fileId, webViewLink } = await uploadToDrive(
        buffer,
        filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        proposal.customerName
      );
      await setFilePublic(fileId);

      let gmailMessageId: string | undefined;

      if (proposal.mode === "proposal_email" && proposal.customerEmail) {
        let emailBody = (proposal.emailBody || "").replace("[PROPOSAL_LINK]", webViewLink);
        if (!emailBody.includes(webViewLink)) {
          emailBody += `\n\nView your proposal here: ${webViewLink}`;
        }
        const result = await sendGmailMessage(
          proposal.customerEmail,
          proposal.emailSubject || "Your Proposal",
          emailBody
        );
        gmailMessageId = result.messageId;
      }

      const updated = await storage.updateProposal(proposal.id, {
        driveFileId: fileId,
        driveWebLink: webViewLink,
        gmailMessageId,
        status: "completed",
      });

      res.json(buildFinalizeResponse(updated));
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof Error && e.message === "GOOGLE_DRIVE_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Google Drive is not connected.",
          code: "DRIVE_NOT_CONNECTED",
        });
      }
      if (e instanceof Error && e.message === "GMAIL_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Gmail is not connected.",
          code: "GMAIL_NOT_CONNECTED",
        });
      }
      const msg = e instanceof Error ? e.message : "Finalize failed";
      res.status(500).json({ error: `Finalize failed: ${msg}` });
    }
  });

  return httpServer;
}
