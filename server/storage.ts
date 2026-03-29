import { db } from "./db";
import { proposals, type Proposal, type InsertProposal } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getProposal(id: number): Promise<Proposal | undefined>;
  getAllProposals(): Promise<Proposal[]>;
  createProposal(data: InsertProposal): Promise<Proposal>;
  updateProposal(id: number, data: Partial<Proposal>): Promise<Proposal>;
  deleteProposal(id: number): Promise<void>;
  getNextVersion(customerName: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getProposal(id: number): Promise<Proposal | undefined> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
    return row;
  }

  async getAllProposals(): Promise<Proposal[]> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    return db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    const version = await this.getNextVersion(data.customerName);
    const [row] = await db
      .insert(proposals)
      .values({ ...data, version })
      .returning();
    return row;
  }

  async updateProposal(id: number, data: Partial<Proposal>): Promise<Proposal> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    const [row] = await db
      .update(proposals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    return row;
  }

  async deleteProposal(id: number): Promise<void> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    await db.delete(proposals).where(eq(proposals.id, id));
  }

  async getNextVersion(customerName: string): Promise<number> {
    if (!db) throw new Error("DATABASE_NOT_CONFIGURED");
    const existing = await db
      .select()
      .from(proposals)
      .where(eq(proposals.customerName, customerName))
      .orderBy(desc(proposals.version));
    if (existing.length === 0) return 1;
    return (existing[0].version || 0) + 1;
  }
}

export class MemoryStorage implements IStorage {
  private proposals: Proposal[] = [];
  private nextId = 1;

  async getProposal(id: number): Promise<Proposal | undefined> {
    return this.proposals.find((proposal) => proposal.id === id);
  }

  async getAllProposals(): Promise<Proposal[]> {
    return [...this.proposals].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    const now = new Date();
    const proposal: Proposal = {
      id: this.nextId++,
      customerName: data.customerName,
      customerEmail: data.customerEmail ?? null,
      jobAddress: data.jobAddress ?? null,
      projectType: data.projectType,
      priceEstimate: data.priceEstimate ?? null,
      timeline: data.timeline ?? null,
      scopeNotes: data.scopeNotes,
      proposalTitle: null,
      proposalText: null,
      emailSubject: null,
      emailBody: null,
      driveFileId: null,
      driveWebLink: null,
      gmailMessageId: null,
      mode: data.mode ?? "proposal_email",
      status: "draft",
      version: await this.getNextVersion(data.customerName),
      createdAt: now,
      updatedAt: now,
    };
    this.proposals.push(proposal);
    return proposal;
  }

  async updateProposal(id: number, data: Partial<Proposal>): Promise<Proposal> {
    const proposal = await this.getProposal(id);
    if (!proposal) throw new Error("NOT_FOUND");

    const updated = {
      ...proposal,
      ...data,
      id: proposal.id,
      updatedAt: new Date(),
    };
    const index = this.proposals.findIndex((item) => item.id === id);
    this.proposals[index] = updated;
    return updated;
  }

  async deleteProposal(id: number): Promise<void> {
    this.proposals = this.proposals.filter((proposal) => proposal.id !== id);
  }

  async getNextVersion(customerName: string): Promise<number> {
    const matching = this.proposals
      .filter((proposal) => proposal.customerName === customerName)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
    if (!matching.length) return 1;
    return (matching[0].version ?? 0) + 1;
  }
}

export const storage = db ? new DatabaseStorage() : new MemoryStorage();
