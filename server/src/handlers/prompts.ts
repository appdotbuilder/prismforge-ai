import { db } from '../db';
import { promptsTable, promptVersionsTable, projectsTable, usersTable } from '../db/schema';
import { type CreatePromptInput, type Prompt, type UpdatePromptInput, type CreatePromptVersionInput, type PromptVersion } from '../schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createPrompt(input: CreatePromptInput): Promise<Prompt> {
  try {
    // Verify project exists
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .execute();

    if (project.length === 0) {
      throw new Error('Project not found');
    }

    // Create prompt
    const result = await db.insert(promptsTable)
      .values({
        id: randomUUID(),
        project_id: input.project_id,
        name: input.name,
        description: input.description ?? null,
        current_version_id: null
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Prompt creation failed:', error);
    throw error;
  }
}

export async function getPromptById(id: string): Promise<Prompt | null> {
  try {
    const results = await db.select()
      .from(promptsTable)
      .where(eq(promptsTable.id, id))
      .execute();

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Failed to get prompt by ID:', error);
    throw error;
  }
}

export async function getPromptsByProjectId(projectId: string): Promise<Prompt[]> {
  try {
    const results = await db.select()
      .from(promptsTable)
      .where(eq(promptsTable.project_id, projectId))
      .execute();

    return results;
  } catch (error) {
    console.error('Failed to get prompts by project ID:', error);
    throw error;
  }
}

export async function updatePrompt(input: UpdatePromptInput): Promise<Prompt> {
  try {
    // Verify prompt exists
    const existingPrompt = await getPromptById(input.id);
    if (!existingPrompt) {
      throw new Error('Prompt not found');
    }

    // Build update values
    const updateValues: Partial<typeof promptsTable.$inferInsert> = {};
    if (input.name !== undefined) {
      updateValues.name = input.name;
    }
    if (input.description !== undefined) {
      updateValues.description = input.description;
    }
    updateValues.updated_at = new Date();

    const result = await db.update(promptsTable)
      .set(updateValues)
      .where(eq(promptsTable.id, input.id))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Prompt update failed:', error);
    throw error;
  }
}

export async function createPromptVersion(input: CreatePromptVersionInput): Promise<PromptVersion> {
  try {
    // Verify prompt exists
    const prompt = await getPromptById(input.prompt_id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.created_by))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Create prompt version
    const result = await db.insert(promptVersionsTable)
      .values({
        id: randomUUID(),
        prompt_id: input.prompt_id,
        version: input.version,
        content: input.content,
        variables: input.variables ?? {},
        test_inputs: input.test_inputs ?? {},
        commit_message: input.commit_message ?? null,
        created_by: input.created_by
      })
      .returning()
      .execute();

    const version = result[0];
    return {
      ...version,
      variables: version.variables as Record<string, unknown>,
      test_inputs: version.test_inputs as Record<string, unknown>
    };
  } catch (error) {
    console.error('Prompt version creation failed:', error);
    throw error;
  }
}

export async function getPromptVersionById(id: string): Promise<PromptVersion | null> {
  try {
    const results = await db.select()
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const version = results[0];
    return {
      ...version,
      variables: version.variables as Record<string, unknown>,
      test_inputs: version.test_inputs as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to get prompt version by ID:', error);
    throw error;
  }
}

export async function getPromptVersionsByPromptId(promptId: string): Promise<PromptVersion[]> {
  try {
    const results = await db.select()
      .from(promptVersionsTable)
      .where(eq(promptVersionsTable.prompt_id, promptId))
      .execute();

    return results.map(version => ({
      ...version,
      variables: version.variables as Record<string, unknown>,
      test_inputs: version.test_inputs as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to get prompt versions by prompt ID:', error);
    throw error;
  }
}

export async function promotePromptVersion(versionId: string, promptId: string): Promise<Prompt> {
  try {
    // Verify prompt exists
    const prompt = await getPromptById(promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    // Verify version exists and belongs to the prompt
    const version = await db.select()
      .from(promptVersionsTable)
      .where(and(
        eq(promptVersionsTable.id, versionId),
        eq(promptVersionsTable.prompt_id, promptId)
      ))
      .execute();

    if (version.length === 0) {
      throw new Error('Version not found or does not belong to prompt');
    }

    // Update prompt to set current version
    const result = await db.update(promptsTable)
      .set({
        current_version_id: versionId,
        updated_at: new Date()
      })
      .where(eq(promptsTable.id, promptId))
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Prompt version promotion failed:', error);
    throw error;
  }
}

export async function comparePromptVersions(versionId1: string, versionId2: string): Promise<{ version1: PromptVersion; version2: PromptVersion }> {
  try {
    // Get both versions
    const [version1Result, version2Result] = await Promise.all([
      getPromptVersionById(versionId1),
      getPromptVersionById(versionId2)
    ]);

    if (!version1Result) {
      throw new Error('Version 1 not found');
    }

    if (!version2Result) {
      throw new Error('Version 2 not found');
    }

    // Verify both versions belong to the same prompt
    if (version1Result.prompt_id !== version2Result.prompt_id) {
      throw new Error('Versions must belong to the same prompt');
    }

    return {
      version1: version1Result,
      version2: version2Result
    };
  } catch (error) {
    console.error('Prompt version comparison failed:', error);
    throw error;
  }
}