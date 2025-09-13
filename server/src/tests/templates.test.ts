import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  templatesTable, 
  organizationsTable, 
  usersTable, 
  projectsTable,
  promptsTable,
  promptVersionsTable 
} from '../db/schema';
import { 
  getPublicTemplates,
  getTemplatesByCategory,
  getTemplateById,
  createOrganizationTemplate,
  getOrganizationTemplates,
  installTemplate
} from '../handlers/templates';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe('templates', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Test data
  const testUser = {
    id: 'user_1',
    email: 'test@example.com',
    name: 'Test User'
  };

  const testOrg = {
    id: 'org_1',
    name: 'Test Org',
    slug: 'test-org',
    owner_user_id: 'user_1'
  };

  const testProject = {
    id: 'project_1',
    org_id: 'org_1',
    name: 'Test Project',
    description: 'A test project',
    tags: ['test']
  };

  const publicTemplate = {
    id: 'template_public',
    org_id: null,
    name: 'Public Template',
    category: 'marketing',
    content: {
      name: 'Marketing Email',
      description: 'A template for marketing emails',
      content: 'Hello {{name}}, check out our {{product}}!',
      variables: { name: 'string', product: 'string' },
      test_inputs: { name: 'John', product: 'awesome product' }
    }
  };

  const orgTemplate = {
    id: 'template_org',
    org_id: 'org_1',
    name: 'Org Template',
    category: 'internal',
    content: {
      name: 'Internal Report',
      description: 'Template for internal reports',
      content: 'Report for {{department}} on {{date}}',
      variables: { department: 'string', date: 'string' },
      test_inputs: { department: 'Engineering', date: '2024-01-01' }
    }
  };

  const setupTestData = async () => {
    // Create user
    await db.insert(usersTable)
      .values(testUser)
      .execute();

    // Create organization
    await db.insert(organizationsTable)
      .values(testOrg)
      .execute();

    // Create project
    await db.insert(projectsTable)
      .values(testProject)
      .execute();

    // Create templates
    await db.insert(templatesTable)
      .values([publicTemplate, orgTemplate])
      .execute();
  };

  describe('getPublicTemplates', () => {
    it('should fetch all public templates', async () => {
      await setupTestData();

      const result = await getPublicTemplates();

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual('template_public');
      expect(result[0].name).toEqual('Public Template');
      expect(result[0].org_id).toBeNull();
      expect(result[0].category).toEqual('marketing');
    });

    it('should return empty array when no public templates exist', async () => {
      await setupTestData();
      
      // Delete the public template
      await db.delete(templatesTable)
        .where(eq(templatesTable.id, 'template_public'))
        .execute();

      const result = await getPublicTemplates();

      expect(result).toHaveLength(0);
    });
  });

  describe('getTemplatesByCategory', () => {
    it('should fetch templates by category', async () => {
      await setupTestData();

      const result = await getTemplatesByCategory('marketing');

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual('template_public');
      expect(result[0].category).toEqual('marketing');
    });

    it('should include both public and org templates for category', async () => {
      await setupTestData();

      // Add another marketing template for the org
      const marketingOrgTemplate = {
        id: 'template_org_marketing',
        org_id: 'org_1',
        name: 'Org Marketing Template',
        category: 'marketing',
        content: { content: 'Org marketing content' }
      };

      await db.insert(templatesTable)
        .values(marketingOrgTemplate)
        .execute();

      const result = await getTemplatesByCategory('marketing');

      expect(result).toHaveLength(2);
      const templateIds = result.map(t => t.id);
      expect(templateIds).toContain('template_public');
      expect(templateIds).toContain('template_org_marketing');
    });

    it('should return empty array for non-existent category', async () => {
      await setupTestData();

      const result = await getTemplatesByCategory('non-existent');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTemplateById', () => {
    it('should fetch template by ID', async () => {
      await setupTestData();

      const result = await getTemplateById('template_public');

      expect(result).not.toBeNull();
      expect(result!.id).toEqual('template_public');
      expect(result!.name).toEqual('Public Template');
      expect(result!.content).toEqual(publicTemplate.content);
    });

    it('should return null for non-existent template', async () => {
      await setupTestData();

      const result = await getTemplateById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createOrganizationTemplate', () => {
    it('should create organization template', async () => {
      await setupTestData();

      const content = {
        name: 'New Org Template',
        description: 'A new template for the org',
        content: 'Template content with {{variable}}',
        variables: { variable: 'string' }
      };

      const result = await createOrganizationTemplate(
        'org_1',
        'New Template',
        'custom',
        content
      );

      expect(result.name).toEqual('New Template');
      expect(result.org_id).toEqual('org_1');
      expect(result.category).toEqual('custom');
      expect(result.content).toEqual(content);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);

      // Verify it was saved to database
      const saved = await db.select()
        .from(templatesTable)
        .where(eq(templatesTable.id, result.id))
        .execute();

      expect(saved).toHaveLength(1);
      expect(saved[0].name).toEqual('New Template');
    });
  });

  describe('getOrganizationTemplates', () => {
    it('should fetch templates for organization', async () => {
      await setupTestData();

      const result = await getOrganizationTemplates('org_1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toEqual('template_org');
      expect(result[0].org_id).toEqual('org_1');
      expect(result[0].name).toEqual('Org Template');
    });

    it('should return empty array for organization with no templates', async () => {
      await setupTestData();

      // Create another org
      const anotherOrg = {
        id: 'org_2',
        name: 'Another Org',
        slug: 'another-org',
        owner_user_id: 'user_1'
      };

      await db.insert(organizationsTable)
        .values(anotherOrg)
        .execute();

      const result = await getOrganizationTemplates('org_2');

      expect(result).toHaveLength(0);
    });
  });

  describe('installTemplate', () => {
    it('should install template as prompt and version', async () => {
      await setupTestData();

      const result = await installTemplate(
        'template_public',
        'project_1',
        'user_1'
      );

      expect(result.promptId).toBeDefined();
      expect(result.versionId).toBeDefined();

      // Verify prompt was created
      const prompts = await db.select()
        .from(promptsTable)
        .where(eq(promptsTable.id, result.promptId))
        .execute();

      expect(prompts).toHaveLength(1);
      const prompt = prompts[0];
      expect(prompt.name).toEqual('Marketing Email');
      expect(prompt.description).toEqual('A template for marketing emails');
      expect(prompt.project_id).toEqual('project_1');
      expect(prompt.current_version_id).toEqual(result.versionId);

      // Verify prompt version was created
      const versions = await db.select()
        .from(promptVersionsTable)
        .where(eq(promptVersionsTable.id, result.versionId))
        .execute();

      expect(versions).toHaveLength(1);
      const version = versions[0];
      expect(version.prompt_id).toEqual(result.promptId);
      expect(version.version).toEqual('1.0.0');
      expect(version.content).toEqual('Hello {{name}}, check out our {{product}}!');
      expect(version.variables).toEqual({ name: 'string', product: 'string' });
      expect(version.test_inputs).toEqual({ name: 'John', product: 'awesome product' });
      expect(version.commit_message).toEqual('Installed from template: Public Template');
      expect(version.created_by).toEqual('user_1');
    });

    it('should handle template with minimal content structure', async () => {
      await setupTestData();

      // Create a minimal template
      const minimalTemplate = {
        id: 'template_minimal',
        org_id: null,
        name: 'Minimal Template',
        category: 'basic',
        content: {
          content: 'Simple template content'
        }
      };

      await db.insert(templatesTable)
        .values(minimalTemplate)
        .execute();

      const result = await installTemplate(
        'template_minimal',
        'project_1',
        'user_1'
      );

      // Verify prompt was created with defaults
      const prompts = await db.select()
        .from(promptsTable)
        .where(eq(promptsTable.id, result.promptId))
        .execute();

      expect(prompts).toHaveLength(1);
      const prompt = prompts[0];
      expect(prompt.name).toEqual('Minimal Template');
      expect(prompt.description).toEqual('Installed from Minimal Template template');

      // Verify version has defaults
      const versions = await db.select()
        .from(promptVersionsTable)
        .where(eq(promptVersionsTable.id, result.versionId))
        .execute();

      expect(versions).toHaveLength(1);
      const version = versions[0];
      expect(version.content).toEqual('Simple template content');
      expect(version.variables).toEqual({});
      expect(version.test_inputs).toEqual({});
    });

    it('should throw error for non-existent template', async () => {
      await setupTestData();

      await expect(
        installTemplate('non-existent', 'project_1', 'user_1')
      ).rejects.toThrow(/template not found/i);
    });

    it('should work with organization template', async () => {
      await setupTestData();

      const result = await installTemplate(
        'template_org',
        'project_1',
        'user_1'
      );

      expect(result.promptId).toBeDefined();
      expect(result.versionId).toBeDefined();

      // Verify prompt was created from org template
      const prompts = await db.select()
        .from(promptsTable)
        .where(eq(promptsTable.id, result.promptId))
        .execute();

      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toEqual('Internal Report');
    });
  });
});