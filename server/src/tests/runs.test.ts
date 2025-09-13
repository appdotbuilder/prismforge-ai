import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, organizationsTable, projectsTable, promptsTable, promptVersionsTable, experimentsTable, runsTable } from '../db/schema';
import { type CreateRunInput, type AnalyticsQueryInput } from '../schema';
import { createRun, getRunById, getRunsByProjectId, getAnalytics, exportRunsData } from '../handlers/runs';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  id: 'user_1',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null,
  created_at: new Date(),
  last_login_at: null,
};

const testOrg = {
  id: 'org_1',
  name: 'Test Org',
  slug: 'test-org',
  owner_user_id: 'user_1',
  plan: 'free' as const,
  created_at: new Date(),
};

const testProject = {
  id: 'project_1',
  org_id: 'org_1',
  name: 'Test Project',
  description: 'A test project',
  tags: ['test'],
  created_at: new Date(),
  updated_at: new Date(),
};

const testPrompt = {
  id: 'prompt_1',
  project_id: 'project_1',
  name: 'Test Prompt',
  description: 'A test prompt',
  current_version_id: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const testVersion = {
  id: 'version_1',
  prompt_id: 'prompt_1',
  version: '1.0',
  content: 'Test prompt content',
  variables: { var1: 'string' },
  test_inputs: { var1: 'test' },
  commit_message: 'Initial version',
  created_by: 'user_1',
  created_at: new Date(),
};

const testExperiment = {
  id: 'experiment_1',
  prompt_id: 'prompt_1',
  name: 'Test Experiment',
  status: 'running' as const,
  variants: { control: {}, variant_a: {} },
  created_at: new Date(),
};

// Test input for creating a run
const testRunInput: CreateRunInput = {
  project_id: 'project_1',
  prompt_id: 'prompt_1',
  version_id: 'version_1',
  experiment_id: 'experiment_1',
  model: 'gpt-4',
  input: { prompt: 'Hello world' },
  output: { response: 'Hello there!' },
  tokens_in: 10,
  tokens_out: 15,
  cost_usd: 0.001,
  latency_ms: 250,
  success: true,
  flags: { test: true }
};

const testAnalyticsInput: AnalyticsQueryInput = {
  org_id: 'org_1',
  project_id: 'project_1',
};

describe('runs handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create prerequisite data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
    await db.insert(promptsTable).values(testPrompt).execute();
    await db.insert(promptVersionsTable).values(testVersion).execute();
    await db.insert(experimentsTable).values(testExperiment).execute();
  });

  afterEach(resetDB);

  describe('createRun', () => {
    it('should create a run successfully', async () => {
      const result = await createRun(testRunInput);

      expect(result.project_id).toEqual('project_1');
      expect(result.prompt_id).toEqual('prompt_1');
      expect(result.version_id).toEqual('version_1');
      expect(result.experiment_id).toEqual('experiment_1');
      expect(result.model).toEqual('gpt-4');
      expect(result.input).toEqual({ prompt: 'Hello world' });
      expect(result.output).toEqual({ response: 'Hello there!' });
      expect(result.tokens_in).toEqual(10);
      expect(result.tokens_out).toEqual(15);
      expect(result.cost_usd).toEqual(0.001);
      expect(typeof result.cost_usd).toEqual('number');
      expect(result.latency_ms).toEqual(250);
      expect(result.success).toEqual(true);
      expect(result.flags).toEqual({ test: true });
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should save run to database', async () => {
      const result = await createRun(testRunInput);

      const runs = await db.select()
        .from(runsTable)
        .where(eq(runsTable.id, result.id))
        .execute();

      expect(runs).toHaveLength(1);
      expect(runs[0].model).toEqual('gpt-4');
      expect(runs[0].tokens_in).toEqual(10);
      expect(parseFloat(runs[0].cost_usd)).toEqual(0.001);
      expect(runs[0].success).toEqual(true);
    });

    it('should create run without experiment_id', async () => {
      const inputWithoutExperiment = { ...testRunInput, experiment_id: undefined };
      const result = await createRun(inputWithoutExperiment);

      expect(result.experiment_id).toBeNull();
      expect(result.project_id).toEqual('project_1');
    });

    it('should throw error for non-existent project', async () => {
      const invalidInput = { ...testRunInput, project_id: 'invalid_project' };
      
      await expect(createRun(invalidInput)).rejects.toThrow(/project with id invalid_project not found/i);
    });

    it('should throw error for non-existent prompt', async () => {
      const invalidInput = { ...testRunInput, prompt_id: 'invalid_prompt' };
      
      await expect(createRun(invalidInput)).rejects.toThrow(/prompt with id invalid_prompt not found/i);
    });

    it('should throw error for non-existent version', async () => {
      const invalidInput = { ...testRunInput, version_id: 'invalid_version' };
      
      await expect(createRun(invalidInput)).rejects.toThrow(/prompt version with id invalid_version not found/i);
    });

    it('should throw error for non-existent experiment', async () => {
      const invalidInput = { ...testRunInput, experiment_id: 'invalid_experiment' };
      
      await expect(createRun(invalidInput)).rejects.toThrow(/experiment with id invalid_experiment not found/i);
    });
  });

  describe('getRunById', () => {
    it('should return run by id', async () => {
      const createdRun = await createRun(testRunInput);
      const result = await getRunById(createdRun.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdRun.id);
      expect(result!.model).toEqual('gpt-4');
      expect(result!.cost_usd).toEqual(0.001);
      expect(typeof result!.cost_usd).toEqual('number');
    });

    it('should return null for non-existent run', async () => {
      const result = await getRunById('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getRunsByProjectId', () => {
    it('should return runs for a project', async () => {
      await createRun(testRunInput);
      await createRun({ ...testRunInput, model: 'gpt-3.5-turbo' });

      const results = await getRunsByProjectId('project_1');

      expect(results).toHaveLength(2);
      expect(results[0].project_id).toEqual('project_1');
      expect(results[1].project_id).toEqual('project_1');
      
      // Should be ordered by created_at desc (most recent first)
      expect(results[0].created_at >= results[1].created_at).toBe(true);
    });

    it('should respect limit parameter', async () => {
      await createRun(testRunInput);
      await createRun({ ...testRunInput, model: 'gpt-3.5-turbo' });
      await createRun({ ...testRunInput, model: 'claude-3' });

      const results = await getRunsByProjectId('project_1', 2);

      expect(results).toHaveLength(2);
    });

    it('should return empty array for project with no runs', async () => {
      const results = await getRunsByProjectId('project_1');
      expect(results).toHaveLength(0);
    });

    it('should convert numeric fields correctly', async () => {
      await createRun(testRunInput);
      const results = await getRunsByProjectId('project_1');

      expect(results).toHaveLength(1);
      expect(typeof results[0].cost_usd).toEqual('number');
      expect(results[0].cost_usd).toEqual(0.001);
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics for organization', async () => {
      // Create multiple runs with different characteristics
      await createRun(testRunInput);
      await createRun({ ...testRunInput, model: 'gpt-3.5-turbo', cost_usd: 0.002, success: false, tokens_in: 20, tokens_out: 25, latency_ms: 150 });
      await createRun({ ...testRunInput, model: 'gpt-4', cost_usd: 0.003, tokens_in: 15, tokens_out: 20, latency_ms: 300 });

      const result = await getAnalytics(testAnalyticsInput);

      expect(result.totalRuns).toEqual(3);
      expect(result.totalTokens).toEqual(10+15+20+25+15+20); // Sum of all tokens_in and tokens_out
      expect(result.totalCost).toEqual(0.006); // Sum of all costs
      expect(result.avgLatency).toEqual(233); // Average of 250, 150, 300
      expect(result.successRate).toEqual(66.67); // 2 out of 3 successful
      expect(result.runsByModel).toEqual({
        'gpt-4': 2,
        'gpt-3.5-turbo': 1
      });
      expect(result.costByDay).toHaveLength(1); // All runs on same day
    });

    it('should filter by project_id', async () => {
      // Create another project and run
      const project2 = {
        id: 'project_2',
        org_id: 'org_1',
        name: 'Test Project 2',
        description: 'Another test project',
        tags: ['test2'],
        created_at: new Date(),
        updated_at: new Date(),
      };
      await db.insert(projectsTable).values(project2).execute();

      const prompt2 = {
        id: 'prompt_2',
        project_id: 'project_2',
        name: 'Test Prompt 2',
        description: null,
        current_version_id: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      await db.insert(promptsTable).values(prompt2).execute();

      const version2 = {
        id: 'version_2',
        prompt_id: 'prompt_2',
        version: '1.0',
        content: 'Test prompt 2 content',
        variables: {},
        test_inputs: {},
        commit_message: null,
        created_by: 'user_1',
        created_at: new Date(),
      };
      await db.insert(promptVersionsTable).values(version2).execute();

      // Create runs in both projects
      await createRun(testRunInput); // project_1
      await createRun({ ...testRunInput, project_id: 'project_2', prompt_id: 'prompt_2', version_id: 'version_2', experiment_id: null }); // project_2

      // Should only return analytics for project_1
      const result = await getAnalytics({ org_id: 'org_1', project_id: 'project_1' });
      expect(result.totalRuns).toEqual(1);

      // Should return analytics for entire org if no project_id specified
      const orgResult = await getAnalytics({ org_id: 'org_1' });
      expect(orgResult.totalRuns).toEqual(2);
    });

    it('should filter by date range', async () => {
      await createRun(testRunInput);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Should return run within date range
      const result = await getAnalytics({
        org_id: 'org_1',
        start_date: yesterday,
        end_date: tomorrow
      });
      expect(result.totalRuns).toEqual(1);

      // Should return no runs outside date range
      const emptyResult = await getAnalytics({
        org_id: 'org_1',
        start_date: tomorrow,
        end_date: tomorrow
      });
      expect(emptyResult.totalRuns).toEqual(0);
    });

    it('should filter by model', async () => {
      await createRun(testRunInput); // gpt-4
      await createRun({ ...testRunInput, model: 'gpt-3.5-turbo' });

      const result = await getAnalytics({
        org_id: 'org_1',
        model: 'gpt-4'
      });

      expect(result.totalRuns).toEqual(1);
      expect(result.runsByModel).toEqual({ 'gpt-4': 1 });
    });
  });

  describe('exportRunsData', () => {
    beforeEach(async () => {
      // Create test runs for export
      await createRun(testRunInput);
      await createRun({ ...testRunInput, model: 'gpt-3.5-turbo', cost_usd: 0.002 });
    });

    it('should export runs data in CSV format', async () => {
      const result = await exportRunsData(testAnalyticsInput, 'csv');

      expect(typeof result).toEqual('string');
      expect(result).toMatch(/^id,project_id,prompt_id/); // CSV headers
      expect(result.split('\n')).toHaveLength(3); // Header + 2 runs
      expect(result).toContain('gpt-4');
      expect(result).toContain('gpt-3.5-turbo');
    });

    it('should export runs data in JSON format', async () => {
      const result = await exportRunsData(testAnalyticsInput, 'json');

      expect(typeof result).toEqual('string');
      const parsed = JSON.parse(result);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].model).toBeDefined();
      expect(typeof parsed[0].cost_usd).toEqual('number'); // Should be converted from string
    });

    it('should respect filters in export', async () => {
      const result = await exportRunsData({
        org_id: 'org_1',
        model: 'gpt-4'
      }, 'json');

      const parsed = JSON.parse(result);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].model).toEqual('gpt-4');
    });

    it('should return empty results for no matching runs', async () => {
      const result = await exportRunsData({
        org_id: 'org_1',
        model: 'non-existent-model'
      }, 'csv');

      expect(result.split('\n')).toHaveLength(1); // Only header
    });
  });
});