import { db } from '../db';
import { experimentsTable, promptsTable } from '../db/schema';
import { type Experiment } from '../schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export const createExperiment = async (promptId: string, name: string, variants: Record<string, any>): Promise<Experiment> => {
  try {
    // Verify prompt exists
    const prompt = await db.select()
      .from(promptsTable)
      .where(eq(promptsTable.id, promptId))
      .execute();

    if (!prompt || prompt.length === 0) {
      throw new Error(`Prompt with ID ${promptId} not found`);
    }

    // Create experiment record
    const result = await db.insert(experimentsTable)
      .values({
        id: randomUUID(),
        prompt_id: promptId,
        name: name,
        status: 'draft',
        variants: variants
      })
      .returning()
      .execute();

    const experiment = result[0];
    return {
      ...experiment,
      variants: experiment.variants as Record<string, unknown>
    };
  } catch (error) {
    console.error('Experiment creation failed:', error);
    throw error;
  }
};

export const getExperimentById = async (id: string): Promise<Experiment | null> => {
  try {
    const result = await db.select()
      .from(experimentsTable)
      .where(eq(experimentsTable.id, id))
      .execute();

    if (result.length === 0) {
      return null;
    }

    const experiment = result[0];
    return {
      ...experiment,
      variants: experiment.variants as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to fetch experiment by ID:', error);
    throw error;
  }
};

export const getExperimentsByPromptId = async (promptId: string): Promise<Experiment[]> => {
  try {
    const result = await db.select()
      .from(experimentsTable)
      .where(eq(experimentsTable.prompt_id, promptId))
      .execute();

    return result.map(experiment => ({
      ...experiment,
      variants: experiment.variants as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to fetch experiments by prompt ID:', error);
    throw error;
  }
};

export const startExperiment = async (experimentId: string): Promise<Experiment> => {
  try {
    const result = await db.update(experimentsTable)
      .set({ status: 'running' })
      .where(eq(experimentsTable.id, experimentId))
      .returning()
      .execute();

    if (!result || result.length === 0) {
      throw new Error(`Experiment with ID ${experimentId} not found`);
    }

    const experiment = result[0];
    return {
      ...experiment,
      variants: experiment.variants as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to start experiment:', error);
    throw error;
  }
};

export const stopExperiment = async (experimentId: string): Promise<Experiment> => {
  try {
    const result = await db.update(experimentsTable)
      .set({ status: 'completed' })
      .where(eq(experimentsTable.id, experimentId))
      .returning()
      .execute();

    if (!result || result.length === 0) {
      throw new Error(`Experiment with ID ${experimentId} not found`);
    }

    const experiment = result[0];
    return {
      ...experiment,
      variants: experiment.variants as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to stop experiment:', error);
    throw error;
  }
};

export const runExperimentComparison = async (experimentId: string, input: Record<string, any>): Promise<{ variantA: any; variantB: any }> => {
  try {
    // Fetch the experiment to get variants
    const experiment = await getExperimentById(experimentId);
    
    if (!experiment) {
      throw new Error(`Experiment with ID ${experimentId} not found`);
    }

    if (experiment.status !== 'running') {
      throw new Error(`Experiment ${experimentId} is not running`);
    }

    // Extract variants from the experiment
    const variants = experiment.variants as Record<string, any>;
    const variantKeys = Object.keys(variants);

    if (variantKeys.length < 2) {
      throw new Error('Experiment must have at least 2 variants for comparison');
    }

    // For this implementation, we'll simulate responses
    // In a real scenario, this would call the actual models/prompts
    const variantA = {
      content: `Response from ${variantKeys[0]} with input: ${JSON.stringify(input)}`,
      tokens: Math.floor(Math.random() * 100) + 50,
      latency: Math.floor(Math.random() * 200) + 300,
      variant_config: variants[variantKeys[0]]
    };

    const variantB = {
      content: `Response from ${variantKeys[1]} with input: ${JSON.stringify(input)}`,
      tokens: Math.floor(Math.random() * 100) + 50,
      latency: Math.floor(Math.random() * 200) + 300,
      variant_config: variants[variantKeys[1]]
    };

    return { variantA, variantB };
  } catch (error) {
    console.error('Failed to run experiment comparison:', error);
    throw error;
  }
};