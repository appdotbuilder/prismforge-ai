import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  experimentsTable, 
  promptsTable, 
  projectsTable, 
  organizationsTable, 
  usersTable 
} from '../db/schema';
import {
  createExperiment,
  getExperimentById,
  getExperimentsByPromptId,
  startExperiment,
  stopExperiment,
  runExperimentComparison
} from '../handlers/experiments';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

describe('experiments', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  let testUserId: string;
  let testOrgId: string;
  let testProjectId: string;
  let testPromptId: string;

  beforeEach(async () => {
    // Create prerequisite data
    testUserId = randomUUID();
    testOrgId = randomUUID();
    testProjectId = randomUUID();
    testPromptId = randomUUID();

    // Create user
    await db.insert(usersTable).values({
      id: testUserId,
      email: 'test@example.com',
      name: 'Test User'
    });

    // Create organization
    await db.insert(organizationsTable).values({
      id: testOrgId,
      name: 'Test Org',
      slug: 'test-org',
      owner_user_id: testUserId,
      plan: 'free'
    });

    // Create project
    await db.insert(projectsTable).values({
      id: testProjectId,
      org_id: testOrgId,
      name: 'Test Project',
      tags: []
    });

    // Create prompt
    await db.insert(promptsTable).values({
      id: testPromptId,
      project_id: testProjectId,
      name: 'Test Prompt'
    });
  });

  describe('createExperiment', () => {
    it('should create an experiment successfully', async () => {
      const variants = {
        variantA: { model: 'gpt-4', temperature: 0.7 },
        variantB: { model: 'gpt-3.5-turbo', temperature: 0.9 }
      };

      const result = await createExperiment(testPromptId, 'A/B Test Experiment', variants);

      expect(result.id).toBeDefined();
      expect(result.prompt_id).toEqual(testPromptId);
      expect(result.name).toEqual('A/B Test Experiment');
      expect(result.status).toEqual('draft');
      expect(result.variants).toEqual(variants);
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save experiment to database', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const result = await createExperiment(testPromptId, 'Test Experiment', variants);

      const experiments = await db.select()
        .from(experimentsTable)
        .where(eq(experimentsTable.id, result.id))
        .execute();

      expect(experiments).toHaveLength(1);
      expect(experiments[0].name).toEqual('Test Experiment');
      expect(experiments[0].prompt_id).toEqual(testPromptId);
      expect(experiments[0].status).toEqual('draft');
    });

    it('should throw error for non-existent prompt', async () => {
      const nonExistentPromptId = randomUUID();
      const variants = { variantA: {}, variantB: {} };

      await expect(
        createExperiment(nonExistentPromptId, 'Test', variants)
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('getExperimentById', () => {
    it('should return experiment by ID', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);

      const result = await getExperimentById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Experiment');
      expect(result!.prompt_id).toEqual(testPromptId);
    });

    it('should return null for non-existent experiment', async () => {
      const nonExistentId = randomUUID();

      const result = await getExperimentById(nonExistentId);

      expect(result).toBeNull();
    });
  });

  describe('getExperimentsByPromptId', () => {
    it('should return all experiments for a prompt', async () => {
      const variants1 = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const variants2 = { variantA: { temperature: 0.7 }, variantB: { temperature: 0.9 } };

      await createExperiment(testPromptId, 'Experiment 1', variants1);
      await createExperiment(testPromptId, 'Experiment 2', variants2);

      const results = await getExperimentsByPromptId(testPromptId);

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name)).toContain('Experiment 1');
      expect(results.map(r => r.name)).toContain('Experiment 2');
      expect(results.every(r => r.prompt_id === testPromptId)).toBe(true);
    });

    it('should return empty array for prompt with no experiments', async () => {
      const results = await getExperimentsByPromptId(testPromptId);

      expect(results).toHaveLength(0);
    });
  });

  describe('startExperiment', () => {
    it('should start an experiment', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);

      const result = await startExperiment(created.id);

      expect(result.id).toEqual(created.id);
      expect(result.status).toEqual('running');
      expect(result.name).toEqual('Test Experiment');
    });

    it('should update status in database', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);

      await startExperiment(created.id);

      const updated = await db.select()
        .from(experimentsTable)
        .where(eq(experimentsTable.id, created.id))
        .execute();

      expect(updated[0].status).toEqual('running');
    });

    it('should throw error for non-existent experiment', async () => {
      const nonExistentId = randomUUID();

      await expect(startExperiment(nonExistentId)).rejects.toThrow(/not found/i);
    });
  });

  describe('stopExperiment', () => {
    it('should stop a running experiment', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);
      await startExperiment(created.id);

      const result = await stopExperiment(created.id);

      expect(result.id).toEqual(created.id);
      expect(result.status).toEqual('completed');
    });

    it('should update status in database', async () => {
      const variants = { variantA: { model: 'gpt-4' }, variantB: { model: 'claude-3' } };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);
      await startExperiment(created.id);

      await stopExperiment(created.id);

      const updated = await db.select()
        .from(experimentsTable)
        .where(eq(experimentsTable.id, created.id))
        .execute();

      expect(updated[0].status).toEqual('completed');
    });

    it('should throw error for non-existent experiment', async () => {
      const nonExistentId = randomUUID();

      await expect(stopExperiment(nonExistentId)).rejects.toThrow(/not found/i);
    });
  });

  describe('runExperimentComparison', () => {
    it('should run comparison for running experiment', async () => {
      const variants = {
        modelA: { model: 'gpt-4', temperature: 0.7 },
        modelB: { model: 'claude-3', temperature: 0.9 }
      };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);
      await startExperiment(created.id);

      const input = { prompt: 'Hello, world!' };
      const result = await runExperimentComparison(created.id, input);

      expect(result.variantA).toBeDefined();
      expect(result.variantB).toBeDefined();
      expect(result.variantA.content).toContain('modelA');
      expect(result.variantB.content).toContain('modelB');
      expect(typeof result.variantA.tokens).toBe('number');
      expect(typeof result.variantA.latency).toBe('number');
      expect(typeof result.variantB.tokens).toBe('number');
      expect(typeof result.variantB.latency).toBe('number');
      expect(result.variantA.variant_config).toEqual(variants.modelA);
      expect(result.variantB.variant_config).toEqual(variants.modelB);
    });

    it('should throw error for non-existent experiment', async () => {
      const nonExistentId = randomUUID();
      const input = { prompt: 'Test' };

      await expect(
        runExperimentComparison(nonExistentId, input)
      ).rejects.toThrow(/not found/i);
    });

    it('should throw error for non-running experiment', async () => {
      const variants = { variantA: {}, variantB: {} };
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);
      const input = { prompt: 'Test' };

      await expect(
        runExperimentComparison(created.id, input)
      ).rejects.toThrow(/not running/i);
    });

    it('should throw error for experiment with insufficient variants', async () => {
      const variants = { variantA: { model: 'gpt-4' } }; // Only one variant
      const created = await createExperiment(testPromptId, 'Test Experiment', variants);
      await startExperiment(created.id);
      const input = { prompt: 'Test' };

      await expect(
        runExperimentComparison(created.id, input)
      ).rejects.toThrow(/at least 2 variants/i);
    });
  });
});