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
   * Detect if a message is requesting a group expense split
   */
  static isGroupSplitMessage(text: string): boolean {
    const lower = text.toLowerCase();
    return (
      lower.includes('split') ||
      lower.includes('divided among') ||
      lower.includes('divide between') ||
      lower.includes('shared expense') ||
      (lower.includes('paid') && lower.includes('for') && (lower.includes('with') || lower.includes('among')))
    );
  }

  /**
   * Process group split details from natural text
   */
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
    const withMatch = text.match(/(?:with|among|and|between)\s+([A-Za-z0-9,\s]+?)(?:-|\n|$|split|\/)/i);
    if (withMatch) {
      // Split by commas, 'and', or multiple spaces
      const rawNames = withMatch[1].split(/,|\s+and\s+/);
      for (const raw of rawNames) {
        const words = raw.trim().split(/\s+/);
        for (const word of words) {
          const clean = word.trim();
          if (clean && clean.length > 1 && !['me', 'you', 'the', 'all', 'us', 'our', 'group'].includes(clean.toLowerCase())) {
            // Capitalize first letter
            const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
            if (!names.includes(formatted)) {
              names.push(formatted);
            }
          }
        }
      }
    }

    // Payer + Participants
    const uniqueParticipants = Array.from(new Set(names));
    const totalPeople = uniqueParticipants.length + 1; // +1 for the payer

    // Share math with exact remainder handling
    const baseShare = Math.floor(totalAmount / (totalPeople || 1));
    const remainder = totalAmount - baseShare * totalPeople;

    // Resolve each participant person ID in DB
    const participants = [];
    for (let i = 0; i < uniqueParticipants.length; i++) {
      const pName = uniqueParticipants[i];
      const resolved = await PersonResolver.resolvePerson(db, pName);
      // Give remainder 1 PKR to first participants if any
      const share = baseShare + (i < remainder ? 1 : 0);

      participants.push({
        name: pName,
        personId: resolved.person?._id,
        share
      });
    }

    return {
      title,
      totalAmount,
      perPersonShare: baseShare,
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

    // Record the overall group split expense transaction
    await db.createTransaction({
      type: 'group_split',
      amount: split.totalAmount,
      currency: 'PKR',
      category: 'Friends & Debt',
      account: accountUsed,
      note: `Split: ${split.title} (${split.participants.length + 1} people)`,
      rawText: `Group split ${split.title}: ${split.totalAmount} PKR`,
      status: 'confirmed',
      timestamp: new Date().toISOString()
    });

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
