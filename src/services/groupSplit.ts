import { MongoDBClient } from '../db/mongodb';
import { PersonResolver } from './personResolver';

export interface GroupSplitResult {
  title: string;
  totalAmount: number;
  perPersonShare: number;
  payerName: string;
  payerPersonId?: string;
  participants: {
    name: string;
    personId?: string;
    share: number;
  }[];
}

export class GroupSplitService {
  /**
   * Detect and process group expense splitting syntax
   * Example: "Paid 6000 for dinner with Ali, Usman, Bilal - split 4 ways"
   */
  static isGroupSplitMessage(text: string): boolean {
    const lower = text.toLowerCase();
    return lower.includes('split') || lower.includes('divided among') || lower.includes('with ali') || lower.includes('with usman') || lower.includes('shared');
  }

  static async processGroupSplit(db: MongoDBClient, text: string, defaultPayer = 'You'): Promise<GroupSplitResult> {
    // 1. Extract total amount
    const amountMatch = text.match(/(\d+(?:,\d+)*(?:\.\d+)?)/);
    const totalAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

    // 2. Extract title/note
    let title = 'Group Expense';
    if (text.toLowerCase().includes('for')) {
      const titleMatch = text.match(/for\s+([^-\n,]+)/i);
      if (titleMatch) title = titleMatch[1].trim();
    }

    // 3. Extract names mentioned
    const names: string[] = [];
    const withMatch = text.match(/(?:with|among|and)\s+([A-Za-z0-9,\s]+?)(?:-|\n|$|split)/i);
    if (withMatch) {
      const rawNames = withMatch[1].split(/,|\s+and\s+/);
      for (const name of rawNames) {
        const clean = name.trim();
        if (clean && clean.toLowerCase() !== 'me' && clean.toLowerCase() !== 'you') {
          names.push(clean);
        }
      }
    }

    // Include Payer + Participants
    const uniqueParticipants = Array.from(new Set(names));
    const totalPeople = uniqueParticipants.length + 1; // +1 for the payer
    const perPersonShare = Math.round(totalAmount / (totalPeople || 1));

    // Resolve each participant person ID in DB
    const participants = [];
    for (const pName of uniqueParticipants) {
      const resolved = await PersonResolver.resolvePerson(db, pName);
      participants.push({
        name: pName,
        personId: resolved.person?._id,
        share: perPersonShare
      });
    }

    return {
      title,
      totalAmount,
      perPersonShare,
      payerName: defaultPayer,
      participants
    };
  }

  /**
   * Apply confirmed group split balances to database counterparties
   */
  static async applyGroupSplit(db: MongoDBClient, split: GroupSplitResult, accountUsed = 'JazzCash'): Promise<void> {
    // Payer paid totalAmount from their account
    await db.updateAccountBalance(accountUsed, -split.totalAmount);

    // Each participant owes payer their share
    for (const p of split.participants) {
      if (p.personId) {
        await db.updatePersonBalance(p.personId, p.share);
      } else {
        const newPerson = await db.createPerson(p.name, accountUsed);
        if (newPerson._id) {
          await db.updatePersonBalance(newPerson._id, p.share);
        }
      }
    }
  }
}
