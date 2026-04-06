import express from "express";
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateProposal, refineProposal } from "./ai";
import { generateDocx } from "./docx-generator";
import { uploadToDrive, setFilePublic, isDriveConnected, testDriveConnection, getDriveUserEmail } from "./google-drive";
import { sendGmailMessage, isGmailConnected, testGmailConnection, getGmailUserEmail } from "./google-mail";
import { transcribeAudio } from "./transcribe";
import { z } from "zod";
import { insertProposalSchema, type Proposal } from "@shared/schema";
import {
  appConfig,
  hasDatabaseConfig,
  hasGoogleOAuthConfig,
  hasOpenAIConfig,
} from "./config";
import { getGoogleProviderMode } from "./google-auth";

const hasDatabase = true;

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
      driveWebLink: proposal.driveWebLink || undefined,
      gmailSentUrl: emailSent ? "https://mail.google.com/mail/#sent" : undefined,
    },
  };
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ─── Status ────────────────────────────────────────────────────────────────
  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      drive: isDriveConnected(),
      gmail: isGmailConnected(),
    });
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
        drive: { connected: driveOk, email: driveEmail || undefined },
        gmail: { connected: gmailOk, email: gmailEmail || undefined },
      });
    } catch (e) {
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
        connected: hasDatabase,
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
      } catch (e: any) {
        res.status(500).json({ error: e.message || "Transcription failed" });
      }
    }
  );

  // ─── Proposals CRUD ─────────────────────────────────────────────────────────
  app.get("/api/proposals", async (_req: Request, res: Response) => {
    try {
      const list = await storage.getAllProposals();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: "Failed to load proposals" });
    }
  });

  app.get("/api/proposals/:id", async (req: Request, res: Response) => {
    try {
      const p = await storage.getProposal(Number(req.params.id));
      if (!p) return res.status(404).json({ error: "Not found" });
      res.json(p);
    } catch (e) {
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
    } catch (e) {
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
    } catch (e: any) {
      console.error(e);
      if (e.message === "GOOGLE_DRIVE_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Google Drive is not connected. Please connect your Google account.",
          code: "DRIVE_NOT_CONNECTED",
        });
      }
      res.status(500).json({ error: "Drive upload failed: " + e.message });
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
    } catch (e: any) {
      console.error(e);
      if (e.message === "GMAIL_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Gmail is not connected. Please connect your Google account.",
          code: "GMAIL_NOT_CONNECTED",
        });
      }
      res.status(500).json({ error: "Gmail send failed: " + e.message });
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
    } catch (e: any) {
      console.error(e);
      if (e.message === "GOOGLE_DRIVE_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Google Drive is not connected.",
          code: "DRIVE_NOT_CONNECTED",
        });
      }
      if (e.message === "GMAIL_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Gmail is not connected.",
          code: "GMAIL_NOT_CONNECTED",
        });
      }
      res.status(500).json({ error: "Finalize failed: " + e.message });
    }
  });

  return httpServer;
}
