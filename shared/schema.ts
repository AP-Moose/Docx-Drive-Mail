import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const PROJECT_TYPES = [
  "Bathroom",
  "Kitchen",
  "Flooring",
  "Painting",
  "Deck",
  "General Remodel",
  "Other",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROPOSAL_MODES = ["proposal_only", "proposal_email"] as const;
export type ProposalMode = (typeof PROPOSAL_MODES)[number];

export const PROPOSAL_STATUSES = ["draft", "generated", "saved", "completed"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const proposals = pgTable("proposals", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  jobAddress: text("job_address"),
  projectType: text("project_type").notNull(),
  priceEstimate: text("price_estimate"),
  timeline: text("timeline"),
  scopeNotes: text("scope_notes").notNull(),
  proposalTitle: text("proposal_title"),
  proposalText: text("proposal_text"),
  emailSubject: text("email_subject"),
  emailBody: text("email_body"),
  driveFileId: text("drive_file_id"),
  driveWebLink: text("drive_web_link"),
  gmailMessageId: text("gmail_message_id"),
  mode: text("mode").notNull().default("proposal_email"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertProposalSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().nullable().optional(),
  jobAddress: z.string().nullable().optional(),
  projectType: z.string().min(1),
  priceEstimate: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  scopeNotes: z.string().min(1),
  mode: z.string().optional().default("proposal_email"),
});

export type InsertProposal = z.infer<typeof insertProposalSchema>;
export type Proposal = typeof proposals.$inferSelect;
