import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { projectsTable, organizationsTable, usersTable } from '../db/schema';
import { type CreateProjectInput, type UpdateProjectInput } from '../schema';
import { 
  createProject, 
  getProjectById, 
  getProjectsByOrgId, 
  updateProject, 
  deleteProject 
} from '../handlers/projects';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  id: 'user_1',
  email: 'test@example.com',
  name: 'Test User'
};

const testOrganization = {
  id: 'org_1',
  name: 'Test Organization',
  slug: 'test-org',
  owner_user_id: 'user_1'
};

const testProjectInput: CreateProjectInput = {
  org_id: 'org_1',
  name: 'Test Project',
  description: 'A project for testing',
  tags: ['test', 'project']
};

describe('Project Handlers', () => {
  beforeEach(async () => {
    await createDB();
    // Create prerequisite data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrganization).execute();
  });

  afterEach(resetDB);

  describe('createProject', () => {
    it('should create a project with all fields', async () => {
      const result = await createProject(testProjectInput);

      // Verify returned project structure
      expect(result.org_id).toEqual('org_1');
      expect(result.name).toEqual('Test Project');
      expect(result.description).toEqual('A project for testing');
      expect(result.tags).toEqual(['test', 'project']);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create a project with minimal fields', async () => {
      const minimalInput: CreateProjectInput = {
        org_id: 'org_1',
        name: 'Minimal Project'
      };

      const result = await createProject(minimalInput);

      expect(result.org_id).toEqual('org_1');
      expect(result.name).toEqual('Minimal Project');
      expect(result.description).toBeNull();
      expect(result.tags).toEqual([]);
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should save project to database', async () => {
      const result = await createProject(testProjectInput);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, result.id))
        .execute();

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toEqual('Test Project');
      expect(projects[0].description).toEqual('A project for testing');
      expect(projects[0].tags).toEqual(['test', 'project']);
      expect(projects[0].org_id).toEqual('org_1');
    });

    it('should throw error for invalid org_id', async () => {
      const invalidInput: CreateProjectInput = {
        ...testProjectInput,
        org_id: 'invalid_org'
      };

      await expect(createProject(invalidInput)).rejects.toThrow(/violates foreign key constraint/i);
    });
  });

  describe('getProjectById', () => {
    it('should return project when it exists', async () => {
      const created = await createProject(testProjectInput);
      const result = await getProjectById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Project');
      expect(result!.description).toEqual('A project for testing');
      expect(result!.tags).toEqual(['test', 'project']);
      expect(result!.org_id).toEqual('org_1');
      expect(result!.created_at).toBeInstanceOf(Date);
      expect(result!.updated_at).toBeInstanceOf(Date);
    });

    it('should return null when project does not exist', async () => {
      const result = await getProjectById('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('getProjectsByOrgId', () => {
    it('should return all projects for an organization', async () => {
      const project1 = await createProject({
        org_id: 'org_1',
        name: 'Project 1',
        description: 'First project'
      });

      const project2 = await createProject({
        org_id: 'org_1',
        name: 'Project 2',
        tags: ['test']
      });

      const results = await getProjectsByOrgId('org_1');

      expect(results).toHaveLength(2);
      
      const projectIds = results.map(p => p.id);
      expect(projectIds).toContain(project1.id);
      expect(projectIds).toContain(project2.id);

      const project1Result = results.find(p => p.id === project1.id);
      expect(project1Result!.name).toEqual('Project 1');
      expect(project1Result!.description).toEqual('First project');

      const project2Result = results.find(p => p.id === project2.id);
      expect(project2Result!.name).toEqual('Project 2');
      expect(project2Result!.tags).toEqual(['test']);
    });

    it('should return empty array when no projects exist for organization', async () => {
      const results = await getProjectsByOrgId('org_1');
      expect(results).toEqual([]);
    });

    it('should return empty array for non-existent organization', async () => {
      const results = await getProjectsByOrgId('non_existent_org');
      expect(results).toEqual([]);
    });
  });

  describe('updateProject', () => {
    it('should update all fields', async () => {
      const created = await createProject(testProjectInput);

      const updateInput: UpdateProjectInput = {
        id: created.id,
        name: 'Updated Project',
        description: 'Updated description',
        tags: ['updated', 'tags']
      };

      const result = await updateProject(updateInput);

      expect(result.id).toEqual(created.id);
      expect(result.name).toEqual('Updated Project');
      expect(result.description).toEqual('Updated description');
      expect(result.tags).toEqual(['updated', 'tags']);
      expect(result.updated_at > created.updated_at).toBe(true);
    });

    it('should update only name', async () => {
      const created = await createProject(testProjectInput);

      const updateInput: UpdateProjectInput = {
        id: created.id,
        name: 'New Name Only'
      };

      const result = await updateProject(updateInput);

      expect(result.name).toEqual('New Name Only');
      expect(result.description).toEqual(created.description);
      expect(result.tags).toEqual(created.tags);
    });

    it('should update description to null', async () => {
      const created = await createProject(testProjectInput);

      const updateInput: UpdateProjectInput = {
        id: created.id,
        description: null
      };

      const result = await updateProject(updateInput);

      expect(result.description).toBeNull();
      expect(result.name).toEqual(created.name);
      expect(result.tags).toEqual(created.tags);
    });

    it('should save updates to database', async () => {
      const created = await createProject(testProjectInput);

      const updateInput: UpdateProjectInput = {
        id: created.id,
        name: 'Updated in DB',
        tags: ['db', 'test']
      };

      await updateProject(updateInput);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, created.id))
        .execute();

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toEqual('Updated in DB');
      expect(projects[0].tags).toEqual(['db', 'test']);
    });

    it('should throw error for non-existent project', async () => {
      const updateInput: UpdateProjectInput = {
        id: 'non_existent_id',
        name: 'Should Fail'
      };

      await expect(updateProject(updateInput)).rejects.toThrow(/Project not found/i);
    });
  });

  describe('deleteProject', () => {
    it('should delete existing project', async () => {
      const created = await createProject(testProjectInput);

      await deleteProject(created.id);

      const projects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.id, created.id))
        .execute();

      expect(projects).toHaveLength(0);
    });

    it('should throw error for non-existent project', async () => {
      await expect(deleteProject('non_existent_id')).rejects.toThrow(/Project not found/i);
    });

    it('should verify project is removed from database', async () => {
      const created1 = await createProject({
        org_id: 'org_1',
        name: 'Project 1'
      });

      const created2 = await createProject({
        org_id: 'org_1',
        name: 'Project 2'
      });

      await deleteProject(created1.id);

      const remainingProjects = await db.select()
        .from(projectsTable)
        .where(eq(projectsTable.org_id, 'org_1'))
        .execute();

      expect(remainingProjects).toHaveLength(1);
      expect(remainingProjects[0].id).toEqual(created2.id);
      expect(remainingProjects[0].name).toEqual('Project 2');
    });
  });
});