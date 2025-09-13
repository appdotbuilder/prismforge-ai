import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { 
  pipelinesTable, 
  projectsTable, 
  organizationsTable, 
  usersTable,
  apiKeysTable 
} from '../db/schema';
import { 
  createPipeline,
  getPipelineById,
  getPipelinesByProjectId,
  updatePipeline,
  publishPipeline,
  executePipeline,
  validatePipelineGraph
} from '../handlers/pipelines';
import { 
  type CreatePipelineInput, 
  type UpdatePipelineInput 
} from '../schema';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  id: 'user_123',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null
};

const testOrg = {
  id: 'org_123',
  name: 'Test Organization',
  slug: 'test-org',
  owner_user_id: testUser.id,
  plan: 'free' as const
};

const testProject = {
  id: 'project_123',
  org_id: testOrg.id,
  name: 'Test Project',
  description: 'A test project',
  tags: ['test']
};

const testApiKey = {
  id: 'key_123',
  org_id: testOrg.id,
  label: 'Test API Key',
  token_hash: 'test_token_hash',
  scopes: ['pipeline:execute']
};

const validGraph = {
  nodes: [
    { id: 'input', type: 'input', position: { x: 0, y: 0 } },
    { id: 'process', type: 'transform', position: { x: 200, y: 0 } },
    { id: 'output', type: 'output', position: { x: 400, y: 0 } }
  ],
  edges: [
    { source: 'input', target: 'process' },
    { source: 'process', target: 'output' }
  ]
};

const createPipelineInput: CreatePipelineInput = {
  project_id: testProject.id,
  name: 'Test Pipeline',
  graph: validGraph,
  endpoint_slug: 'test-pipeline'
};

describe('Pipeline Handlers', () => {
  beforeEach(async () => {
    await createDB();
    
    // Create prerequisite data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
    await db.insert(apiKeysTable).values(testApiKey).execute();
  });

  afterEach(resetDB);

  describe('createPipeline', () => {
    it('should create a pipeline with all fields', async () => {
      const result = await createPipeline(createPipelineInput);

      expect(result.name).toEqual('Test Pipeline');
      expect(result.project_id).toEqual(testProject.id);
      expect(result.graph).toEqual(validGraph);
      expect(result.status).toEqual('draft');
      expect(result.endpoint_slug).toEqual('test-pipeline');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should create pipeline without endpoint_slug', async () => {
      const input = {
        ...createPipelineInput,
        endpoint_slug: undefined
      };

      const result = await createPipeline(input);

      expect(result.endpoint_slug).toBeNull();
      expect(result.name).toEqual('Test Pipeline');
    });

    it('should save pipeline to database', async () => {
      const result = await createPipeline(createPipelineInput);

      const pipelines = await db.select()
        .from(pipelinesTable)
        .where(eq(pipelinesTable.id, result.id))
        .execute();

      expect(pipelines).toHaveLength(1);
      expect(pipelines[0].name).toEqual('Test Pipeline');
      expect(pipelines[0].project_id).toEqual(testProject.id);
    });

    it('should throw error for non-existent project', async () => {
      const input = {
        ...createPipelineInput,
        project_id: 'non-existent'
      };

      await expect(createPipeline(input)).rejects.toThrow(/project not found/i);
    });
  });

  describe('getPipelineById', () => {
    it('should return pipeline when found', async () => {
      const created = await createPipeline(createPipelineInput);
      const result = await getPipelineById(created.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(created.id);
      expect(result!.name).toEqual('Test Pipeline');
      expect(result!.project_id).toEqual(testProject.id);
    });

    it('should return null when pipeline not found', async () => {
      const result = await getPipelineById('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getPipelinesByProjectId', () => {
    it('should return pipelines for project', async () => {
      const pipeline1 = await createPipeline(createPipelineInput);
      const pipeline2 = await createPipeline({
        ...createPipelineInput,
        name: 'Second Pipeline'
      });

      const results = await getPipelinesByProjectId(testProject.id);

      expect(results).toHaveLength(2);
      expect(results.map(p => p.id)).toContain(pipeline1.id);
      expect(results.map(p => p.id)).toContain(pipeline2.id);
    });

    it('should return empty array for project with no pipelines', async () => {
      const results = await getPipelinesByProjectId(testProject.id);
      expect(results).toHaveLength(0);
    });

    it('should return empty array for non-existent project', async () => {
      const results = await getPipelinesByProjectId('non-existent');
      expect(results).toHaveLength(0);
    });
  });

  describe('updatePipeline', () => {
    it('should update pipeline name', async () => {
      const created = await createPipeline(createPipelineInput);
      
      const updateInput: UpdatePipelineInput = {
        id: created.id,
        name: 'Updated Pipeline Name'
      };

      const result = await updatePipeline(updateInput);

      expect(result.name).toEqual('Updated Pipeline Name');
      expect(result.id).toEqual(created.id);
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should update pipeline graph', async () => {
      const created = await createPipeline(createPipelineInput);
      
      const newGraph = {
        nodes: [{ id: 'single', type: 'process' }],
        edges: []
      };

      const updateInput: UpdatePipelineInput = {
        id: created.id,
        graph: newGraph
      };

      const result = await updatePipeline(updateInput);

      expect(result.graph).toEqual(newGraph);
      expect(result.name).toEqual(created.name); // Unchanged
    });

    it('should update pipeline status', async () => {
      const created = await createPipeline(createPipelineInput);
      
      const updateInput: UpdatePipelineInput = {
        id: created.id,
        status: 'published'
      };

      const result = await updatePipeline(updateInput);

      expect(result.status).toEqual('published');
    });

    it('should update endpoint_slug to null', async () => {
      const created = await createPipeline(createPipelineInput);
      
      const updateInput: UpdatePipelineInput = {
        id: created.id,
        endpoint_slug: null
      };

      const result = await updatePipeline(updateInput);

      expect(result.endpoint_slug).toBeNull();
    });

    it('should throw error for non-existent pipeline', async () => {
      const updateInput: UpdatePipelineInput = {
        id: 'non-existent',
        name: 'New Name'
      };

      await expect(updatePipeline(updateInput)).rejects.toThrow(/pipeline not found/i);
    });
  });

  describe('publishPipeline', () => {
    it('should publish pipeline with existing endpoint_slug', async () => {
      const created = await createPipeline(createPipelineInput);
      const result = await publishPipeline(created.id);

      expect(result.status).toEqual('published');
      expect(result.endpoint_slug).toEqual('test-pipeline');
      expect(result.updated_at.getTime()).toBeGreaterThan(created.updated_at.getTime());
    });

    it('should publish pipeline and generate endpoint_slug', async () => {
      const input = {
        ...createPipelineInput,
        endpoint_slug: undefined
      };
      const created = await createPipeline(input);
      const result = await publishPipeline(created.id);

      expect(result.status).toEqual('published');
      expect(result.endpoint_slug).toBeDefined();
      expect(result.endpoint_slug).toMatch(/test-pipeline-\d+/);
    });

    it('should throw error for non-existent pipeline', async () => {
      await expect(publishPipeline('non-existent')).rejects.toThrow(/pipeline not found/i);
    });
  });

  describe('executePipeline', () => {
    it('should execute published pipeline successfully', async () => {
      const created = await createPipeline(createPipelineInput);
      const published = await publishPipeline(created.id);

      const result = await executePipeline(
        published.endpoint_slug!,
        { input: 'test data' },
        testApiKey.token_hash
      );

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.nodeResults).toHaveLength(3); // 3 nodes in validGraph
      expect(result.nodeResults[0].nodeId).toEqual('input');
    });

    it('should fail with invalid API key', async () => {
      const created = await createPipeline(createPipelineInput);
      const published = await publishPipeline(created.id);

      const result = await executePipeline(
        published.endpoint_slug!,
        { input: 'test data' },
        'invalid-key'
      );

      expect(result.success).toBe(false);
      expect(result.output.error).toMatch(/invalid api key/i);
    });

    it('should fail for non-existent pipeline slug', async () => {
      const result = await executePipeline(
        'non-existent-slug',
        { input: 'test data' },
        testApiKey.token_hash
      );

      expect(result.success).toBe(false);
      expect(result.output.error).toMatch(/pipeline not found/i);
    });

    it('should fail for draft pipeline', async () => {
      const created = await createPipeline({
        ...createPipelineInput,
        endpoint_slug: 'draft-pipeline'
      });

      const result = await executePipeline(
        'draft-pipeline',
        { input: 'test data' },
        testApiKey.token_hash
      );

      expect(result.success).toBe(false);
      expect(result.output.error).toMatch(/pipeline not found/i);
    });
  });

  describe('validatePipelineGraph', () => {
    it('should validate correct graph', async () => {
      const result = await validatePipelineGraph(validGraph);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid graph object', async () => {
      const result = await validatePipelineGraph(null as any);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Graph must be a valid object');
    });

    it('should reject graph without nodes array', async () => {
      const invalidGraph = { edges: [] };
      const result = await validatePipelineGraph(invalidGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Graph must contain a nodes array');
    });

    it('should reject graph without edges array', async () => {
      const invalidGraph = { nodes: [] };
      const result = await validatePipelineGraph(invalidGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Graph must contain an edges array');
    });

    it('should reject nodes without id', async () => {
      const invalidGraph = {
        nodes: [{ type: 'input' }],
        edges: []
      };
      const result = await validatePipelineGraph(invalidGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Each node must have a string id');
    });

    it('should reject duplicate node ids', async () => {
      const invalidGraph = {
        nodes: [
          { id: 'node1', type: 'input' },
          { id: 'node1', type: 'output' }
        ],
        edges: []
      };
      const result = await validatePipelineGraph(invalidGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate node id: node1');
    });

    it('should reject edges with non-existent nodes', async () => {
      const invalidGraph = {
        nodes: [{ id: 'node1', type: 'input' }],
        edges: [{ source: 'node1', target: 'nonexistent' }]
      };
      const result = await validatePipelineGraph(invalidGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Edge references non-existent target node: nonexistent');
    });

    it('should detect cycles in graph', async () => {
      const cyclicGraph = {
        nodes: [
          { id: 'a', type: 'process' },
          { id: 'b', type: 'process' },
          { id: 'c', type: 'process' }
        ],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'c' },
          { source: 'c', target: 'a' } // Creates cycle
        ]
      };
      const result = await validatePipelineGraph(cyclicGraph);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Pipeline graph contains cycles');
    });

    it('should allow complex valid graph', async () => {
      const complexGraph = {
        nodes: [
          { id: 'input1', type: 'input' },
          { id: 'input2', type: 'input' },
          { id: 'merge', type: 'merge' },
          { id: 'process', type: 'transform' },
          { id: 'output', type: 'output' }
        ],
        edges: [
          { source: 'input1', target: 'merge' },
          { source: 'input2', target: 'merge' },
          { source: 'merge', target: 'process' },
          { source: 'process', target: 'output' }
        ]
      };
      const result = await validatePipelineGraph(complexGraph);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});