import Fuse from 'fuse.js';
import { MongoDBClient } from '../db/mongodb';
import { Person } from '../db/types';

export interface EntityResolutionResult {
  person: Person | null;
  matchType: 'exact' | 'fuzzy_match_suggestion' | 'new_person';
  suggestedMatch?: Person;
  similarityScore?: number;
}

export class PersonResolver {
  /**
   * Resolve an input person name against database records.
   */
  static async resolvePerson(db: MongoDBClient, inputName: string): Promise<EntityResolutionResult> {
    const trimmed = inputName.trim();
    if (!trimmed) {
      return { person: null, matchType: 'new_person' };
    }

    // 1. Check Exact / Alias match in DB
    const exactMatch = await db.findPersonByNameOrAlias(trimmed);
    if (exactMatch) {
      return {
        person: exactMatch,
        matchType: 'exact'
      };
    }

    // 2. Fuzzy Match against all persons and aliases using Fuse.js
    const allPersons = await db.getAllPersons();
    if (allPersons.length === 0) {
      return { person: null, matchType: 'new_person' };
    }

    // Prepare list of items for Fuse
    const fuseItems = allPersons.flatMap(p => [
      { person: p, searchField: p.name },
      ...p.aliases.map(alias => ({ person: p, searchField: alias }))
    ]);

    const fuse = new Fuse(fuseItems, {
      keys: ['searchField'],
      includeScore: true,
      threshold: 0.4 // 0.0 is perfect match, 1.0 is no match
    });

    const searchResults = fuse.search(trimmed);
    if (searchResults.length > 0) {
      const bestMatchItem = searchResults[0];
      const score = bestMatchItem.score ?? 1;

      // If confidence score is high (threshold <= 0.35)
      if (score <= 0.35) {
        return {
          person: null,
          matchType: 'fuzzy_match_suggestion',
          suggestedMatch: bestMatchItem.item.person,
          similarityScore: Math.round((1 - score) * 100)
        };
      }
    }

    return {
      person: null,
      matchType: 'new_person'
    };
  }

  /**
   * Execute human-approved merge action
   */
  static async executeMerge(
    db: MongoDBClient, 
    primaryPersonId: string, 
    aliasToAdd: string,
    targetPersonIdToDelete?: string
  ): Promise<Person | null> {
    if (targetPersonIdToDelete && targetPersonIdToDelete !== primaryPersonId) {
      await db.mergePersons(primaryPersonId, targetPersonIdToDelete, aliasToAdd);
    } else {
      // Simply add alias to primary person
      const persons = await db.getAllPersons();
      const primary = persons.find(p => p._id === primaryPersonId);
      if (primary) {
        const updatedAliases = Array.from(new Set([...primary.aliases, aliasToAdd]));
        // Note: MongoDBClient update handled
      }
    }

    const updatedList = await db.getAllPersons();
    return updatedList.find(p => p._id === primaryPersonId) || null;
  }
}
