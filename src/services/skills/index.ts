// src/services/skills/index.ts

import { SkillDatabaseService } from '../database/skill-database-service';
import { databaseService } from '../database-service';
import { SkillService } from './skill-service';

// Re-export types
export type {
  CreateSkillRequest,
  DocumentationItem,
  DocumentationType,
  MarketplaceSkill,
  Skill,
  SkillCategory,
  SkillContent,
  SkillFilter,
  SkillSortOption,
  SkillStats,
  SkillTag,
  TaskSkill,
  UpdateSkillRequest,
} from '@/types/skill';

// Re-export service class
export { SkillService } from './skill-service';

/**
 * Get the SkillService singleton instance
 */
let skillServiceInstance: SkillService | null = null;

export async function getSkillService(): Promise<SkillService> {
  if (!skillServiceInstance) {
    // Ensure database is initialized
    const db = await databaseService.getDb();

    // Create database service
    const dbService = new SkillDatabaseService(db);

    // Create skill service
    skillServiceInstance = new SkillService(dbService);
  }

  return skillServiceInstance;
}

/**
 * Convenience function to get a skill by ID
 */
export async function getSkill(id: string) {
  const service = await getSkillService();
  return service.getSkill(id);
}

/**
 * Convenience function to list skills
 */
export async function listSkills(filter?: any, sort?: any) {
  const service = await getSkillService();
  return service.listSkills(filter, sort);
}

/**
 * Convenience function to get task skills
 */
export async function getTaskSkills(taskId: string) {
  const service = await getSkillService();
  return service.getTaskSkills(taskId);
}

/**
 * Convenience function to get active skills for a task
 */
export async function getActiveSkillsForTask(taskId: string) {
  const service = await getSkillService();
  return service.getActiveSkillsForTask(taskId);
}

// Deprecated aliases for backward compatibility
/** @deprecated Use getTaskSkills instead */
export async function getConversationSkills(taskId: string) {
  return getTaskSkills(taskId);
}

/** @deprecated Use getActiveSkillsForTask instead */
export async function getActiveSkillsForConversation(taskId: string) {
  return getActiveSkillsForTask(taskId);
}
