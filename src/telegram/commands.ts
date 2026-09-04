import { Env } from '../db/types';
import { MongoDBClient } from '../db/mongodb';
import { AccountCommands } from './commands/accountCommands';
import { BudgetCommands } from './commands/budgetCommands';
import { PersonCommands } from './commands/personCommands';
import { UtilityCommands } from './commands/utilityCommands';

export { AccountCommands, BudgetCommands, PersonCommands, UtilityCommands };

/**
 * Unified TelegramCommandHandler Facade.
 */
export class TelegramCommandHandler {
  static async handleStart(env: Env): Promise<string> {
    return UtilityCommands.handleStart(env);
  }

  static async handleSetLimit(db: MongoDBClient, args: string): Promise<string> {
    return BudgetCommands.handleSetLimit(db, args);
  }

  static async handlePaylink(db: MongoDBClient, args: string): Promise<string> {
    return PersonCommands.handlePaylink(db, args);
  }

  static async handleGoals(db: MongoDBClient, args?: string): Promise<string> {
    return BudgetCommands.handleGoals(db, args);
  }

  static async handleUndo(db: MongoDBClient): Promise<string> {
    return UtilityCommands.handleUndo(db);
  }

  static async handleAdvisor(env: Env, db: MongoDBClient): Promise<string> {
    return UtilityCommands.handleAdvisor(env, db);
  }

  static async handleRemind(db: MongoDBClient, args: string, chatId?: string | number): Promise<string> {
    return UtilityCommands.handleRemind(db, args, chatId);
  }

  static async handleSummary(env: Env, db: MongoDBClient): Promise<string> {
    return UtilityCommands.handleSummary(env, db);
  }

  static async handleAccounts(db: MongoDBClient): Promise<string> {
    return AccountCommands.handleAccounts(db);
  }

  static async handleSetBalance(db: MongoDBClient, args: string): Promise<string> {
    return AccountCommands.handleSetBalance(db, args);
  }

  static async handleTransfer(db: MongoDBClient, args: string): Promise<string> {
    return AccountCommands.handleTransfer(db, args);
  }

  static async handleSettle(db: MongoDBClient, args: string): Promise<string> {
    return PersonCommands.handleSettle(db, args);
  }

  static async handleReport(env: Env, db: MongoDBClient): Promise<string> {
    return UtilityCommands.handleReport(env, db);
  }

  static async handlePersons(db: MongoDBClient): Promise<string> {
    return PersonCommands.handlePersons(db);
  }

  static async handleQuery(env: Env, db: MongoDBClient, query: string): Promise<string> {
    return UtilityCommands.handleQuery(env, db, query);
  }
}
