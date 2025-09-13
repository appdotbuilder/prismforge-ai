import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, organizationsTable, projectsTable, promptsTable, promptVersionsTable } from '../db/schema';
import { type CreatePromptInput, type UpdatePromptInput, type CreatePromptVersionInput } from '../schema';
import {
  createPrompt,
  getPromptById,
  getPromptsByProjectId,
  updatePrompt,
  createPromptVersion,
  getPromptVersionById,
  getPromptVersionsByPromptId,
  promotePromptVersion,
  comparePromptVersions
} from '../handlers/prompts';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  id: 'user_test_1',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null,
};

const testOrganization = {
  id: 'org_test_1',
  name: 'Test Organization',
  slug: 'test-org',
  owner_user_id: 'user_test_1',
  plan: 'free' as const,
};

const testProject = {
  id: 'project_test_1',
  org_id: 'org_test_1',
  name: 'Test Project',
  description: 'A test project',
  tags: ['test'],
};

const createPromptInput: CreatePromptInput = {
  project_id: 'project_test_1',
  name: 'Test Prompt',
  description: 'A test prompt',
};

const createPromptVersionInput: CreatePromptVersionInput = {
  prompt_id: '', // Will be set dynamically
  version: 'v1.0.0',
  content: 'You are a helpful assistant. {{user_input}}',
  variables: { user_input: 'string' },
  test_inputs: { user_input: 'Hello world' },
  commit_message: 'Initial version',
  created_by: 'user_test_1',
};

describe('Prompt Handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create test user
    await db.insert(usersTable).values(testUser).execute();
    
    // Create test organization
    await db.insert(organizationsTable).values(testOrganization).execute();
    
    // Create test project
    await db.insert(projectsTable).values(testProject).execute();
  });
  
  afterEach(resetDB);

  describe('createPrompt', () => {
    it('should create a prompt successfully', async () => {
      const result = await createPrompt(createPromptInput);

      expect(result.project_id).toEqual('project_test_1');
      expect(result.name).toEqual('Test Prompt');
      expect(result.description).toEqual('A test prompt');
      expect(result.current_version_id).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save prompt to database', async () => {
      const result = await createPrompt(createPromptInput);

      const prompts = await db.select()
        .from(promptsTable)
        .where(eq(promptsTable.id, result.id))
        .execute();

      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toEqual('Test Prompt');
      expect(prompts[0].project_id).toEqual('project_test_1');
    });

    it('should create prompt with optional description', async () => {
      const inputWithoutDescription = {
        project_id: 'project_test_1',
        name: 'Test Prompt No Description',
      };

      const result = await createPrompt(inputWithoutDescription);

      expect(result.name).toEqual('Test Prompt No Description');
      expect(result.description).toBeNull();
    });

    it('should throw error for non-existent project', async () => {
      const invalidInput = {
        ...createPromptInput,
        project_id: 'non_existent_project',
      };

      expect(createPrompt(invalidInput)).rejects.toThrow(/project not found/i);
    });
  });

  describe('getPromptById', () => {
    it('should return prompt when it exists', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const result = await getPromptById(createdPrompt.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdPrompt.id);
      expect(result!.name).toEqual('Test Prompt');
    });

    it('should return null for non-existent prompt', async () => {
      const result = await getPromptById('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getPromptsByProjectId', () => {
    it('should return all prompts for a project', async () => {
      const prompt1 = await createPrompt(createPromptInput);
      const prompt2 = await createPrompt({
        ...createPromptInput,
        name: 'Second Prompt',
      });

      const results = await getPromptsByProjectId('project_test_1');

      expect(results).toHaveLength(2);
      expect(results.map(p => p.id)).toContain(prompt1.id);
      expect(results.map(p => p.id)).toContain(prompt2.id);
    });

    it('should return empty array for project with no prompts', async () => {
      const results = await getPromptsByProjectId('project_test_1');
      expect(results).toHaveLength(0);
    });
  });

  describe('updatePrompt', () => {
    it('should update prompt name and description', async () => {
      const createdPrompt = await createPrompt(createPromptInput);

      const updateInput: UpdatePromptInput = {
        id: createdPrompt.id,
        name: 'Updated Prompt Name',
        description: 'Updated description',
      };

      const result = await updatePrompt(updateInput);

      expect(result.name).toEqual('Updated Prompt Name');
      expect(result.description).toEqual('Updated description');
      expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
    });

    it('should update only name when description not provided', async () => {
      const createdPrompt = await createPrompt(createPromptInput);

      const updateInput: UpdatePromptInput = {
        id: createdPrompt.id,
        name: 'Only Name Updated',
      };

      const result = await updatePrompt(updateInput);

      expect(result.name).toEqual('Only Name Updated');
      expect(result.description).toEqual('A test prompt'); // Original description
    });

    it('should set description to null when explicitly provided', async () => {
      const createdPrompt = await createPrompt(createPromptInput);

      const updateInput: UpdatePromptInput = {
        id: createdPrompt.id,
        description: null,
      };

      const result = await updatePrompt(updateInput);

      expect(result.description).toBeNull();
      expect(result.name).toEqual('Test Prompt'); // Original name
    });

    it('should throw error for non-existent prompt', async () => {
      const updateInput: UpdatePromptInput = {
        id: 'non_existent_id',
        name: 'Updated Name',
      };

      expect(updatePrompt(updateInput)).rejects.toThrow(/prompt not found/i);
    });
  });

  describe('createPromptVersion', () => {
    it('should create prompt version successfully', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const versionInput = {
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
      };

      const result = await createPromptVersion(versionInput);

      expect(result.prompt_id).toEqual(createdPrompt.id);
      expect(result.version).toEqual('v1.0.0');
      expect(result.content).toEqual('You are a helpful assistant. {{user_input}}');
      expect(result.variables).toEqual({ user_input: 'string' });
      expect(result.test_inputs).toEqual({ user_input: 'Hello world' });
      expect(result.commit_message).toEqual('Initial version');
      expect(result.created_by).toEqual('user_test_1');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should create version with minimal data', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const minimalInput: CreatePromptVersionInput = {
        prompt_id: createdPrompt.id,
        version: 'v1.0.0',
        content: 'Simple content',
        created_by: 'user_test_1',
      };

      const result = await createPromptVersion(minimalInput);

      expect(result.variables).toEqual({});
      expect(result.test_inputs).toEqual({});
      expect(result.commit_message).toBeNull();
    });

    it('should throw error for non-existent prompt', async () => {
      const invalidInput = {
        ...createPromptVersionInput,
        prompt_id: 'non_existent_prompt',
      };

      expect(createPromptVersion(invalidInput)).rejects.toThrow(/prompt not found/i);
    });

    it('should throw error for non-existent user', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const invalidInput = {
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
        created_by: 'non_existent_user',
      };

      expect(createPromptVersion(invalidInput)).rejects.toThrow(/user not found/i);
    });
  });

  describe('getPromptVersionById', () => {
    it('should return version when it exists', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const createdVersion = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
      });

      const result = await getPromptVersionById(createdVersion.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdVersion.id);
      expect(result!.version).toEqual('v1.0.0');
    });

    it('should return null for non-existent version', async () => {
      const result = await getPromptVersionById('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getPromptVersionsByPromptId', () => {
    it('should return all versions for a prompt', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      
      const version1 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
        version: 'v1.0.0',
      });
      
      const version2 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
        version: 'v2.0.0',
      });

      const results = await getPromptVersionsByPromptId(createdPrompt.id);

      expect(results).toHaveLength(2);
      expect(results.map(v => v.id)).toContain(version1.id);
      expect(results.map(v => v.id)).toContain(version2.id);
    });

    it('should return empty array for prompt with no versions', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const results = await getPromptVersionsByPromptId(createdPrompt.id);
      expect(results).toHaveLength(0);
    });
  });

  describe('promotePromptVersion', () => {
    it('should promote version to current', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const createdVersion = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
      });

      const result = await promotePromptVersion(createdVersion.id, createdPrompt.id);

      expect(result.current_version_id).toEqual(createdVersion.id);
      expect(result.updated_at.getTime()).toBeGreaterThan(result.created_at.getTime());
    });

    it('should throw error for non-existent prompt', async () => {
      expect(promotePromptVersion('version_id', 'non_existent_prompt')).rejects.toThrow(/prompt not found/i);
    });

    it('should throw error for non-existent version', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      
      expect(promotePromptVersion('non_existent_version', createdPrompt.id)).rejects.toThrow(/version not found/i);
    });

    it('should throw error when version does not belong to prompt', async () => {
      const prompt1 = await createPrompt(createPromptInput);
      const prompt2 = await createPrompt({
        ...createPromptInput,
        name: 'Second Prompt',
      });
      
      const version = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: prompt1.id,
      });

      expect(promotePromptVersion(version.id, prompt2.id)).rejects.toThrow(/does not belong to prompt/i);
    });
  });

  describe('comparePromptVersions', () => {
    it('should return both versions for comparison', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      
      const version1 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
        version: 'v1.0.0',
        content: 'Version 1 content',
      });
      
      const version2 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
        version: 'v2.0.0',
        content: 'Version 2 content',
      });

      const result = await comparePromptVersions(version1.id, version2.id);

      expect(result.version1.id).toEqual(version1.id);
      expect(result.version1.content).toEqual('Version 1 content');
      expect(result.version2.id).toEqual(version2.id);
      expect(result.version2.content).toEqual('Version 2 content');
    });

    it('should throw error for non-existent version 1', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const version2 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
      });

      expect(comparePromptVersions('non_existent_id', version2.id)).rejects.toThrow(/version 1 not found/i);
    });

    it('should throw error for non-existent version 2', async () => {
      const createdPrompt = await createPrompt(createPromptInput);
      const version1 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: createdPrompt.id,
      });

      expect(comparePromptVersions(version1.id, 'non_existent_id')).rejects.toThrow(/version 2 not found/i);
    });

    it('should throw error when versions belong to different prompts', async () => {
      const prompt1 = await createPrompt(createPromptInput);
      const prompt2 = await createPrompt({
        ...createPromptInput,
        name: 'Second Prompt',
      });
      
      const version1 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: prompt1.id,
      });
      
      const version2 = await createPromptVersion({
        ...createPromptVersionInput,
        prompt_id: prompt2.id,
      });

      expect(comparePromptVersions(version1.id, version2.id)).rejects.toThrow(/same prompt/i);
    });
  });
});