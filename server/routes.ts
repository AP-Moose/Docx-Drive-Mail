import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { generateProposal, refineProposal } from "./ai";
import { generateDocx } from "./docx-generator";
import { uploadToDrive, setFilePublic, isDriveConnected, testDriveConnection } from "./google-drive";
import { createGmailDraft, isGmailConnected, testGmailConnection } from "./google-mail";
import { z } from "zod";
import { insertProposalSchema } from "@shared/schema";

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
      const [driveOk, gmailOk] = await Promise.all([
        testDriveConnection(),
        testGmailConnection(),
      ]);
      res.json({
        drive: { connected: driveOk },
        gmail: { connected: gmailOk },
      });
    } catch (e) {
      res.json({
        drive: { connected: false },
        gmail: { connected: false },
      });
    }
  });

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
      res.status(500).json({ error: "AI generation failed" });
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
      res.status(500).json({ error: "Refinement failed" });
    }
  });

  // ─── DOCX download (for preview / manual download) ─────────────────────────
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

      // Upload to Google Drive
      const { fileId, webViewLink } = await uploadToDrive(
        buffer,
        filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        proposal.customerName
      );

      // Make it public (anyone with link can view)
      await setFilePublic(fileId);

      // Save Drive info to DB
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

  // ─── Gmail Draft ────────────────────────────────────────────────────────────
  app.post("/api/proposals/:id/gmail-draft", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal not generated yet" });
      }
      if (!proposal.customerEmail) {
        return res.status(400).json({ error: "Customer email is required for email draft" });
      }
      if (!proposal.driveWebLink) {
        return res.status(400).json({ error: "Proposal must be uploaded to Drive first" });
      }

      // Build email body with the Drive link
      const emailBody = (proposal.emailBody || "")
        .replace("[PROPOSAL_LINK]", proposal.driveWebLink);

      const { buffer, filename } = await generateDocx(proposal);

      const { draftId } = await createGmailDraft(
        proposal.customerEmail,
        proposal.emailSubject || "Your Proposal",
        emailBody,
        buffer,
        filename
      );

      const updated = await storage.updateProposal(proposal.id, {
        gmailDraftId: draftId,
        status: "completed",
      });

      res.json({ draftId, proposal: updated });
    } catch (e: any) {
      console.error(e);
      if (e.message === "GMAIL_NOT_CONNECTED") {
        return res.status(503).json({
          error: "Gmail is not connected. Please connect your Google account.",
          code: "GMAIL_NOT_CONNECTED",
        });
      }
      res.status(500).json({ error: "Gmail draft creation failed: " + e.message });
    }
  });

  // ─── Full pipeline ────────────────────────────────────────────────────────
  // Runs: generate docx → upload drive → set public → create gmail draft
  app.post("/api/proposals/:id/finalize", async (req: Request, res: Response) => {
    try {
      const proposal = await storage.getProposal(Number(req.params.id));
      if (!proposal || !proposal.proposalText) {
        return res.status(400).json({ error: "Proposal text is required" });
      }

      const { buffer, filename } = await generateDocx(proposal);

      // Upload to Drive
      const { fileId, webViewLink } = await uploadToDrive(
        buffer,
        filename,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        proposal.customerName
      );
      await setFilePublic(fileId);

      let gmailDraftId: string | undefined;

      if (proposal.mode === "proposal_email" && proposal.customerEmail) {
        let emailBody = (proposal.emailBody || "").replace("[PROPOSAL_LINK]", webViewLink);
        if (!emailBody.includes(webViewLink)) {
          emailBody += `\n\nView your proposal here: ${webViewLink}`;
        }
        const result = await createGmailDraft(
          proposal.customerEmail,
          proposal.emailSubject || "Your Proposal",
          emailBody,
          buffer,
          filename
        );
        gmailDraftId = result.draftId;
      }

      const updated = await storage.updateProposal(proposal.id, {
        driveFileId: fileId,
        driveWebLink: webViewLink,
        gmailDraftId: gmailDraftId,
        status: "completed",
      });

      res.json({ fileId, webViewLink, gmailDraftId, proposal: updated });
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
