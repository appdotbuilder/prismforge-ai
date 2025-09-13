import { db } from '../db';
import { templatesTable, promptsTable, promptVersionsTable } from '../db/schema';
import { type Template } from '../schema';
import { eq, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function getPublicTemplates(): Promise<Template[]> {
  try {
    const results = await db.select()
      .from(templatesTable)
      .where(isNull(templatesTable.org_id))
      .execute();

    return results.map(template => ({
      ...template,
      content: template.content as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to fetch public templates:', error);
    throw error;
  }
}

export async function getTemplatesByCategory(category: string): Promise<Template[]> {
  try {
    const results = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.category, category))
      .execute();

    return results.map(template => ({
      ...template,
      content: template.content as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to fetch templates by category:', error);
    throw error;
  }
}

export async function getTemplateById(id: string): Promise<Template | null> {
  try {
    const results = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.id, id))
      .execute();

    if (!results[0]) {
      return null;
    }

    return {
      ...results[0],
      content: results[0].content as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to fetch template by ID:', error);
    throw error;
  }
}

export async function createOrganizationTemplate(
  orgId: string, 
  name: string, 
  category: string, 
  content: Record<string, any>
): Promise<Template> {
  try {
    const templateId = nanoid();
    
    const result = await db.insert(templatesTable)
      .values({
        id: templateId,
        org_id: orgId,
        name,
        category,
        content
      })
      .returning()
      .execute();

    return {
      ...result[0],
      content: result[0].content as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to create organization template:', error);
    throw error;
  }
}

export async function getOrganizationTemplates(orgId: string): Promise<Template[]> {
  try {
    const results = await db.select()
      .from(templatesTable)
      .where(eq(templatesTable.org_id, orgId))
      .execute();

    return results.map(template => ({
      ...template,
      content: template.content as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to fetch organization templates:', error);
    throw error;
  }
}

export async function installTemplate(
  templateId: string, 
  projectId: string,
  createdBy: string = 'system'
): Promise<{
  promptId: string;
  versionId: string;
}> {
  try {
    // First, fetch the template
    const template = await getTemplateById(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Generate IDs for the new prompt and version
    const promptId = nanoid();
    const versionId = nanoid();

    // Extract template content for prompt creation
    const templateContent = template.content as any;
    const promptName = templateContent.name || template.name;
    const promptDescription = templateContent.description || `Installed from ${template.name} template`;
    const promptContent = templateContent.content || '';
    const variables = templateContent.variables || {};
    const testInputs = templateContent.test_inputs || {};

    // Create the prompt
    await db.insert(promptsTable)
      .values({
        id: promptId,
        project_id: projectId,
        name: promptName,
        description: promptDescription,
        current_version_id: versionId
      })
      .execute();

    // Create the prompt version
    await db.insert(promptVersionsTable)
      .values({
        id: versionId,
        prompt_id: promptId,
        version: '1.0.0',
        content: promptContent,
        variables,
        test_inputs: testInputs,
        commit_message: `Installed from template: ${template.name}`,
        created_by: createdBy
      })
      .execute();

    return {
      promptId,
      versionId
    };
  } catch (error) {
    console.error('Failed to install template:', error);
    throw error;
  }
}