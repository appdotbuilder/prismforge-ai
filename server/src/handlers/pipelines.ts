import { db } from '../db';
import { pipelinesTable, projectsTable, organizationsTable, apiKeysTable } from '../db/schema';
import { type CreatePipelineInput, type Pipeline, type UpdatePipelineInput } from '../schema';
import { eq, and } from 'drizzle-orm';

export async function createPipeline(input: CreatePipelineInput): Promise<Pipeline> {
  try {
    // Verify project exists
    const projects = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .execute();

    if (projects.length === 0) {
      throw new Error('Project not found');
    }

    // Generate unique ID and create pipeline
    const pipelineId = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const result = await db.insert(pipelinesTable)
      .values({
        id: pipelineId,
        project_id: input.project_id,
        name: input.name,
        graph: input.graph as Record<string, unknown>,
        endpoint_slug: input.endpoint_slug || null,
        status: 'draft'
      })
      .returning()
      .execute();

    return {
      ...result[0],
      graph: result[0].graph as Record<string, unknown>
    };
  } catch (error) {
    console.error('Pipeline creation failed:', error);
    throw error;
  }
}

export async function getPipelineById(id: string): Promise<Pipeline | null> {
  try {
    const results = await db.select()
      .from(pipelinesTable)
      .where(eq(pipelinesTable.id, id))
      .execute();

    return results.length > 0 ? {
      ...results[0],
      graph: results[0].graph as Record<string, unknown>
    } : null;
  } catch (error) {
    console.error('Pipeline fetch failed:', error);
    throw error;
  }
}

export async function getPipelinesByProjectId(projectId: string): Promise<Pipeline[]> {
  try {
    const results = await db.select()
      .from(pipelinesTable)
      .where(eq(pipelinesTable.project_id, projectId))
      .execute();

    return results.map(result => ({
      ...result,
      graph: result.graph as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Pipelines fetch failed:', error);
    throw error;
  }
}

export async function updatePipeline(input: UpdatePipelineInput): Promise<Pipeline> {
  try {
    // Verify pipeline exists
    const existing = await getPipelineById(input.id);
    if (!existing) {
      throw new Error('Pipeline not found');
    }

    // Build update object with only defined fields
    const updateData: any = {
      updated_at: new Date()
    };

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.graph !== undefined) {
      updateData.graph = input.graph as Record<string, unknown>;
    }

    if (input.status !== undefined) {
      updateData.status = input.status;
    }

    if (input.endpoint_slug !== undefined) {
      updateData.endpoint_slug = input.endpoint_slug;
    }

    const result = await db.update(pipelinesTable)
      .set(updateData)
      .where(eq(pipelinesTable.id, input.id))
      .returning()
      .execute();

    return {
      ...result[0],
      graph: result[0].graph as Record<string, unknown>
    };
  } catch (error) {
    console.error('Pipeline update failed:', error);
    throw error;
  }
}

export async function publishPipeline(id: string): Promise<Pipeline> {
  try {
    // Verify pipeline exists and is not already published
    const existing = await getPipelineById(id);
    if (!existing) {
      throw new Error('Pipeline not found');
    }

    // Generate endpoint slug if not already set
    let endpointSlug = existing.endpoint_slug;
    if (!endpointSlug) {
      endpointSlug = `${existing.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    }

    const result = await db.update(pipelinesTable)
      .set({
        status: 'published',
        endpoint_slug: endpointSlug,
        updated_at: new Date()
      })
      .where(eq(pipelinesTable.id, id))
      .returning()
      .execute();

    return {
      ...result[0],
      graph: result[0].graph as Record<string, unknown>
    };
  } catch (error) {
    console.error('Pipeline publish failed:', error);
    throw error;
  }
}

export async function executePipeline(slug: string, input: Record<string, any>, orgApiKey: string): Promise<{
  success: boolean;
  output: any;
  executionTime: number;
  nodeResults: Array<{ nodeId: string; output: any; duration: number }>;
}> {
  try {
    const startTime = Date.now();

    // Verify API key and get organization
    const apiKeyResults = await db.select()
      .from(apiKeysTable)
      .innerJoin(organizationsTable, eq(apiKeysTable.org_id, organizationsTable.id))
      .where(eq(apiKeysTable.token_hash, orgApiKey))
      .execute();

    if (apiKeyResults.length === 0) {
      throw new Error('Invalid API key');
    }

    // Find published pipeline by slug
    const pipelineResults = await db.select()
      .from(pipelinesTable)
      .innerJoin(projectsTable, eq(pipelinesTable.project_id, projectsTable.id))
      .where(
        and(
          eq(pipelinesTable.endpoint_slug, slug),
          eq(pipelinesTable.status, 'published'),
          eq(projectsTable.org_id, apiKeyResults[0].organizations.id)
        )
      )
      .execute();

    if (pipelineResults.length === 0) {
      throw new Error('Pipeline not found or not published');
    }

    const pipeline = pipelineResults[0].pipelines;

    // Simple execution simulation based on graph structure
    const nodeResults: Array<{ nodeId: string; output: any; duration: number }> = [];
    const graph = pipeline.graph as Record<string, any>;
    
    // Process nodes in the graph (simplified execution)
    if (graph && typeof graph === 'object' && graph['nodes']) {
      for (const node of graph['nodes']) {
        const nodeStartTime = Date.now();
        // Simulate node processing
        const nodeOutput = {
          nodeId: node.id,
          type: node.type,
          result: `Processed ${node.type} with input: ${JSON.stringify(input)}`
        };
        const nodeDuration = Date.now() - nodeStartTime + Math.random() * 100; // Simulate processing time
        
        nodeResults.push({
          nodeId: node.id,
          output: nodeOutput,
          duration: Math.round(nodeDuration)
        });
      }
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      output: {
        pipelineId: pipeline.id,
        result: nodeResults.length > 0 ? nodeResults[nodeResults.length - 1].output : { message: 'Pipeline executed successfully' },
        processedNodes: nodeResults.length
      },
      executionTime,
      nodeResults
    };
  } catch (error) {
    console.error('Pipeline execution failed:', error);
    return {
      success: false,
      output: { error: error instanceof Error ? error.message : 'Unknown error' },
      executionTime: 0,
      nodeResults: []
    };
  }
}

export async function validatePipelineGraph(graph: Record<string, any>): Promise<{
  valid: boolean;
  errors: string[];
}> {
  try {
    const errors: string[] = [];

    // Basic validation checks
    if (!graph || typeof graph !== 'object') {
      errors.push('Graph must be a valid object');
      return { valid: false, errors };
    }

    // Check for required graph structure
    if (!graph['nodes'] || !Array.isArray(graph['nodes'])) {
      errors.push('Graph must contain a nodes array');
    }

    if (!graph['edges'] || !Array.isArray(graph['edges'])) {
      errors.push('Graph must contain an edges array');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Validate nodes
    const nodeIds = new Set<string>();
    for (const node of graph['nodes']) {
      if (!node.id || typeof node.id !== 'string') {
        errors.push('Each node must have a string id');
        continue;
      }

      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);

      if (!node.type || typeof node.type !== 'string') {
        errors.push(`Node ${node.id} must have a string type`);
      }
    }

    // Validate edges
    for (const edge of graph['edges']) {
      if (!edge.source || typeof edge.source !== 'string') {
        errors.push('Each edge must have a string source');
        continue;
      }

      if (!edge.target || typeof edge.target !== 'string') {
        errors.push('Each edge must have a string target');
        continue;
      }

      // Check if referenced nodes exist
      if (!nodeIds.has(edge.source)) {
        errors.push(`Edge references non-existent source node: ${edge.source}`);
      }

      if (!nodeIds.has(edge.target)) {
        errors.push(`Edge references non-existent target node: ${edge.target}`);
      }
    }

    // Check for cycles (simple detection)
    if (hasCycle(graph['nodes'], graph['edges'])) {
      errors.push('Pipeline graph contains cycles');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  } catch (error) {
    console.error('Pipeline validation failed:', error);
    return {
      valid: false,
      errors: ['Validation failed due to internal error']
    };
  }
}

// Helper function to detect cycles in the graph
function hasCycle(nodes: any[], edges: any[]): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const adjacencyList = new Map<string, string[]>();

  // Build adjacency list
  for (const node of nodes) {
    adjacencyList.set(node.id, []);
  }

  for (const edge of edges) {
    const targets = adjacencyList.get(edge.source) || [];
    targets.push(edge.target);
    adjacencyList.set(edge.source, targets);
  }

  // DFS cycle detection
  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true; // Back edge found, cycle detected
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return true;
      }
    }
  }

  return false;
}