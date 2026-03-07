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
    const [row] = await db.select().from(proposals).where(eq(proposals.id, id));
    return row;
  }

  async getAllProposals(): Promise<Proposal[]> {
    return db.select().from(proposals).orderBy(desc(proposals.createdAt));
  }

  async createProposal(data: InsertProposal): Promise<Proposal> {
    const version = await this.getNextVersion(data.customerName);
    const [row] = await db
      .insert(proposals)
      .values({ ...data, version })
      .returning();
    return row;
  }

  async updateProposal(id: number, data: Partial<Proposal>): Promise<Proposal> {
    const [row] = await db
      .update(proposals)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(proposals.id, id))
      .returning();
    return row;
  }

  async deleteProposal(id: number): Promise<void> {
    await db.delete(proposals).where(eq(proposals.id, id));
  }

  async getNextVersion(customerName: string): Promise<number> {
    const existing = await db
      .select()
      .from(proposals)
      .where(eq(proposals.customerName, customerName))
      .orderBy(desc(proposals.version));
    if (existing.length === 0) return 1;
    return (existing[0].version || 0) + 1;
  }
}

export const storage = new DatabaseStorage();
