import { db } from '../db';
import { projectsTable } from '../db/schema';
import { type CreateProjectInput, type Project, type UpdateProjectInput } from '../schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createProject(input: CreateProjectInput): Promise<Project> {
  try {
    // Insert project record
    const result = await db.insert(projectsTable)
      .values({
        id: randomUUID(),
        org_id: input.org_id,
        name: input.name,
        description: input.description || null,
        tags: input.tags || []
      })
      .returning()
      .execute();

    const project = result[0];
    return {
      ...project,
      tags: project.tags as string[] // Cast jsonb back to string array
    };
  } catch (error) {
    console.error('Project creation failed:', error);
    throw error;
  }
}

export async function getProjectById(id: string): Promise<Project | null> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id))
      .execute();

    if (results.length === 0) {
      return null;
    }

    const project = results[0];
    return {
      ...project,
      tags: project.tags as string[] // Cast jsonb back to string array
    };
  } catch (error) {
    console.error('Project fetch failed:', error);
    throw error;
  }
}

export async function getProjectsByOrgId(orgId: string): Promise<Project[]> {
  try {
    const results = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.org_id, orgId))
      .execute();

    return results.map(project => ({
      ...project,
      tags: project.tags as string[] // Cast jsonb back to string array
    }));
  } catch (error) {
    console.error('Projects fetch failed:', error);
    throw error;
  }
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  try {
    // Build the update values object dynamically
    const updateValues: Partial<typeof projectsTable.$inferInsert> = {
      updated_at: new Date()
    };

    if (input.name !== undefined) {
      updateValues.name = input.name;
    }
    if (input.description !== undefined) {
      updateValues.description = input.description;
    }
    if (input.tags !== undefined) {
      updateValues.tags = input.tags;
    }

    const result = await db.update(projectsTable)
      .set(updateValues)
      .where(eq(projectsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Project not found');
    }

    const project = result[0];
    return {
      ...project,
      tags: project.tags as string[] // Cast jsonb back to string array
    };
  } catch (error) {
    console.error('Project update failed:', error);
    throw error;
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const result = await db.delete(projectsTable)
      .where(eq(projectsTable.id, id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Project not found');
    }
  } catch (error) {
    console.error('Project deletion failed:', error);
    throw error;
  }
}