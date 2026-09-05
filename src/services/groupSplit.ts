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

    // 3. Check for Custom Percentage, Share, or Exact Amount Splits
    const customPercentages: { name: string; pct: number }[] = [];
    const pctMatches = text.matchAll(/([A-Z][a-z]+)\s*[:=]?\s*(\d+)\s*%/g);
    for (const match of pctMatches) {
      customPercentages.push({ name: match[1], pct: parseFloat(match[2]) });
    }

    const customAmounts: { name: string; amount: number }[] = [];
    const amountMatches = text.matchAll(/(?:^|[\s,;:])([A-Z][a-z]+)\s*(?:owes|pays|[:=]|\s)\s*(\d+)(?!%|\s*shares?|\s*ways?)/gi);
    for (const match of amountMatches) {
      const nameCandidate = match[1];
      const amtCandidate = parseFloat(match[2]);
      if (
        !['Paid', 'Spent', 'Split', 'Total', 'For', 'Lunch', 'Dinner'].includes(nameCandidate) &&
        amtCandidate >= 50
      ) {
        customAmounts.push({ name: nameCandidate, amount: amtCandidate });
      }
    }

    const customShares: { name: string; shares: number }[] = [];
    const shareMatches = text.matchAll(/([A-Z][a-z]+)\s*[:=]?\s*(\d+)\s*shares?/gi);
    for (const match of shareMatches) {
      customShares.push({ name: match[1], shares: parseFloat(match[2]) });
    }

    const participants: { name: string; personId?: string; share: number }[] = [];
    let payerShare = 0;

    if (customPercentages.length > 0) {
      // Percentage Split
      let totalPct = 0;
      for (const cp of customPercentages) {
        if (cp.name.toLowerCase() !== defaultPayer.toLowerCase()) {
          const share = Math.round(totalAmount * (cp.pct / 100));
          const resolved = await PersonResolver.resolvePerson(db, cp.name);
          participants.push({ name: cp.name, personId: resolved.person?._id, share });
          totalPct += cp.pct;
        } else {
          totalPct += cp.pct;
        }
      }
      const participantTotal = participants.reduce((sum, p) => sum + p.share, 0);
      payerShare = totalAmount - participantTotal;
    } else if (customAmounts.length > 0) {
      // Exact Amount Split
      for (const ca of customAmounts) {
        if (ca.name.toLowerCase() !== defaultPayer.toLowerCase()) {
          const resolved = await PersonResolver.resolvePerson(db, ca.name);
          participants.push({ name: ca.name, personId: resolved.person?._id, share: ca.amount });
        }
      }
      const participantTotal = participants.reduce((sum, p) => sum + p.share, 0);
      payerShare = totalAmount - participantTotal;
    } else if (customShares.length > 0) {
      // Share Ratios Split
      const totalShares = customShares.reduce((s, c) => s + c.shares, 0);
      for (const cs of customShares) {
        if (cs.name.toLowerCase() !== defaultPayer.toLowerCase()) {
          const share = Math.round(totalAmount * (cs.shares / (totalShares || 1)));
          const resolved = await PersonResolver.resolvePerson(db, cs.name);
          participants.push({ name: cs.name, personId: resolved.person?._id, share });
        }
      }
      const participantTotal = participants.reduce((sum, p) => sum + p.share, 0);
      payerShare = totalAmount - participantTotal;
    } else {
      // Equal Split
      const names: string[] = [];
      const withMatch = text.match(/(?:with|among|and|between)\s+([A-Za-z0-9,\s]+?)(?:-|\n|$|split|\/)/i);
      if (withMatch) {
        const rawNames = withMatch[1].split(/,|\s+and\s+/);
        for (const raw of rawNames) {
          const words = raw.trim().split(/\s+/);
          for (const word of words) {
            const clean = word.trim();
            if (clean && clean.length > 1 && !['me', 'you', 'the', 'all', 'us', 'our', 'group'].includes(clean.toLowerCase())) {
              const formatted = clean.charAt(0).toUpperCase() + clean.slice(1);
              if (!names.includes(formatted)) {
                names.push(formatted);
              }
            }
          }
        }
      }

      const uniqueParticipants = Array.from(new Set(names));
      const totalPeople = uniqueParticipants.length + 1; // +1 for the payer

      const baseShare = Math.floor(totalAmount / (totalPeople || 1));
      const remainder = totalAmount - baseShare * totalPeople;

      for (let i = 0; i < uniqueParticipants.length; i++) {
        const pName = uniqueParticipants[i];
        const resolved = await PersonResolver.resolvePerson(db, pName);
        const share = baseShare + (i < remainder ? 1 : 0);

        participants.push({
          name: pName,
          personId: resolved.person?._id,
          share
        });
      }
      payerShare = baseShare;
    }

    return {
      title,
      totalAmount,
      perPersonShare: payerShare,
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
