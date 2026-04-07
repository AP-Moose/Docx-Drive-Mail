import { db } from "./db";
import { proposals, googleTokens, type Proposal, type InsertProposal, type GoogleToken, type InsertGoogleToken } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  getProposal(id: number): Promise<Proposal | undefined>;
  getAllProposals(): Promise<Proposal[]>;
  createProposal(data: InsertProposal): Promise<Proposal>;
  updateProposal(id: number, data: Partial<Proposal>): Promise<Proposal>;
  deleteProposal(id: number): Promise<void>;
  getNextVersion(customerName: string): Promise<number>;
  getGoogleToken(): Promise<GoogleToken | undefined>;
  upsertGoogleToken(data: InsertGoogleToken): Promise<GoogleToken>;
  updateGoogleTokenAccess(id: number, accessToken: string, tokenExpiry: Date | null): Promise<void>;
  deleteGoogleToken(): Promise<void>;
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

  async getGoogleToken(): Promise<GoogleToken | undefined> {
    const [row] = await db.select().from(googleTokens).orderBy(desc(googleTokens.updatedAt)).limit(1);
    return row;
  }

  async upsertGoogleToken(data: InsertGoogleToken): Promise<GoogleToken> {
    await db.delete(googleTokens);
    const [row] = await db.insert(googleTokens).values(data).returning();
    return row;
  }

  async updateGoogleTokenAccess(id: number, accessToken: string, tokenExpiry: Date | null): Promise<void> {
    await db
      .update(googleTokens)
      .set({ accessToken, tokenExpiry, updatedAt: new Date() })
      .where(eq(googleTokens.id, id));
  }

  async deleteGoogleToken(): Promise<void> {
    await db.delete(googleTokens);
  }
}

export const storage = new DatabaseStorage();
