import { db } from '../db';
import { runsTable, projectsTable, promptsTable, promptVersionsTable, experimentsTable } from '../db/schema';
import { type CreateRunInput, type Run, type AnalyticsQueryInput } from '../schema';
import { eq, desc, and, gte, lte, sql, SQL } from 'drizzle-orm';

// Generate a unique ID for runs
function generateRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function createRun(input: CreateRunInput): Promise<Run> {
  try {
    // Verify that referenced entities exist
    const project = await db.select().from(projectsTable).where(eq(projectsTable.id, input.project_id)).limit(1).execute();
    if (project.length === 0) {
      throw new Error(`Project with id ${input.project_id} not found`);
    }

    const prompt = await db.select().from(promptsTable).where(eq(promptsTable.id, input.prompt_id)).limit(1).execute();
    if (prompt.length === 0) {
      throw new Error(`Prompt with id ${input.prompt_id} not found`);
    }

    const version = await db.select().from(promptVersionsTable).where(eq(promptVersionsTable.id, input.version_id)).limit(1).execute();
    if (version.length === 0) {
      throw new Error(`Prompt version with id ${input.version_id} not found`);
    }

    // Verify experiment exists if provided
    if (input.experiment_id) {
      const experiment = await db.select().from(experimentsTable).where(eq(experimentsTable.id, input.experiment_id)).limit(1).execute();
      if (experiment.length === 0) {
        throw new Error(`Experiment with id ${input.experiment_id} not found`);
      }
    }

    // Insert run record
    const result = await db.insert(runsTable)
      .values({
        id: generateRunId(),
        project_id: input.project_id,
        prompt_id: input.prompt_id,
        version_id: input.version_id,
        experiment_id: input.experiment_id || null,
        model: input.model,
        input: input.input,
        output: input.output,
        tokens_in: input.tokens_in,
        tokens_out: input.tokens_out,
        cost_usd: input.cost_usd.toString(), // Convert number to string for numeric column
        latency_ms: input.latency_ms,
        success: input.success,
        flags: input.flags || {}
      })
      .returning()
      .execute();

    // Convert numeric fields back to numbers before returning
    const run = result[0];
    return {
      ...run,
      cost_usd: parseFloat(run.cost_usd), // Convert string back to number
      input: run.input as Record<string, unknown>,
      output: run.output as Record<string, unknown>,
      flags: run.flags as Record<string, unknown>
    };
  } catch (error) {
    console.error('Run creation failed:', error);
    throw error;
  }
}

export async function getRunById(id: string): Promise<Run | null> {
  try {
    const results = await db.select()
      .from(runsTable)
      .where(eq(runsTable.id, id))
      .limit(1)
      .execute();

    if (results.length === 0) {
      return null;
    }

    const run = results[0];
    return {
      ...run,
      cost_usd: parseFloat(run.cost_usd), // Convert string back to number
      input: run.input as Record<string, unknown>,
      output: run.output as Record<string, unknown>,
      flags: run.flags as Record<string, unknown>
    };
  } catch (error) {
    console.error('Failed to fetch run:', error);
    throw error;
  }
}

export async function getRunsByProjectId(projectId: string, limit: number = 50): Promise<Run[]> {
  try {
    const results = await db.select()
      .from(runsTable)
      .where(eq(runsTable.project_id, projectId))
      .orderBy(desc(runsTable.created_at))
      .limit(limit)
      .execute();

    return results.map(run => ({
      ...run,
      cost_usd: parseFloat(run.cost_usd), // Convert string back to number
      input: run.input as Record<string, unknown>,
      output: run.output as Record<string, unknown>,
      flags: run.flags as Record<string, unknown>
    }));
  } catch (error) {
    console.error('Failed to fetch runs by project:', error);
    throw error;
  }
}

export async function getAnalytics(input: AnalyticsQueryInput): Promise<{
  totalRuns: number;
  totalTokens: number;
  totalCost: number;
  avgLatency: number;
  successRate: number;
  runsByModel: Record<string, number>;
  costByDay: Array<{ date: string; cost: number }>;
}> {
  try {
    // Build the base query with conditions
    let query = db.select().from(runsTable);

    const conditions: SQL<unknown>[] = [];

    // Add organization filter by joining with projects
    conditions.push(eq(runsTable.project_id, projectsTable.id));
    conditions.push(eq(projectsTable.org_id, input.org_id));

    if (input.project_id) {
      conditions.push(eq(runsTable.project_id, input.project_id));
    }

    if (input.start_date) {
      conditions.push(gte(runsTable.created_at, input.start_date));
    }

    if (input.end_date) {
      conditions.push(lte(runsTable.created_at, input.end_date));
    }

    if (input.model) {
      conditions.push(eq(runsTable.model, input.model));
    }

    // Apply conditions with join
    const baseQuery = query
      .innerJoin(projectsTable, eq(runsTable.project_id, projectsTable.id))
      .where(and(...conditions));

    const runs = await baseQuery.execute();

    // Calculate analytics from the data
    const totalRuns = runs.length;
    const totalTokens = runs.reduce((sum, run) => sum + run.runs.tokens_in + run.runs.tokens_out, 0);
    const totalCost = runs.reduce((sum, run) => sum + parseFloat(run.runs.cost_usd), 0);
    const avgLatency = runs.length > 0 ? runs.reduce((sum, run) => sum + run.runs.latency_ms, 0) / runs.length : 0;
    const successfulRuns = runs.filter(run => run.runs.success).length;
    const successRate = runs.length > 0 ? (successfulRuns / runs.length) * 100 : 0;

    // Group runs by model
    const runsByModel: Record<string, number> = {};
    runs.forEach(run => {
      const model = run.runs.model;
      runsByModel[model] = (runsByModel[model] || 0) + 1;
    });

    // Group cost by day
    const costByDayMap: Record<string, number> = {};
    runs.forEach(run => {
      const date = run.runs.created_at.toISOString().split('T')[0];
      const cost = parseFloat(run.runs.cost_usd);
      costByDayMap[date] = (costByDayMap[date] || 0) + cost;
    });

    const costByDay = Object.entries(costByDayMap)
      .map(([date, cost]) => ({ date, cost }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalRuns,
      totalTokens,
      totalCost,
      avgLatency: Math.round(avgLatency),
      successRate: Math.round(successRate * 100) / 100,
      runsByModel,
      costByDay
    };
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    throw error;
  }
}

export async function exportRunsData(input: AnalyticsQueryInput, format: 'csv' | 'json'): Promise<string> {
  try {
    // Build the base query with conditions
    let query = db.select().from(runsTable);

    const conditions: SQL<unknown>[] = [];

    // Add organization filter by joining with projects
    conditions.push(eq(runsTable.project_id, projectsTable.id));
    conditions.push(eq(projectsTable.org_id, input.org_id));

    if (input.project_id) {
      conditions.push(eq(runsTable.project_id, input.project_id));
    }

    if (input.start_date) {
      conditions.push(gte(runsTable.created_at, input.start_date));
    }

    if (input.end_date) {
      conditions.push(lte(runsTable.created_at, input.end_date));
    }

    if (input.model) {
      conditions.push(eq(runsTable.model, input.model));
    }

    // Apply conditions with join and order by date
    const results = await query
      .innerJoin(projectsTable, eq(runsTable.project_id, projectsTable.id))
      .where(and(...conditions))
      .orderBy(desc(runsTable.created_at))
      .execute();

    if (format === 'csv') {
      const headers = 'id,project_id,prompt_id,version_id,experiment_id,model,tokens_in,tokens_out,cost_usd,latency_ms,success,created_at';
      const rows = results.map(result => {
        const run = result.runs;
        return [
          run.id,
          run.project_id,
          run.prompt_id,
          run.version_id,
          run.experiment_id || '',
          run.model,
          run.tokens_in,
          run.tokens_out,
          run.cost_usd,
          run.latency_ms,
          run.success,
          run.created_at.toISOString()
        ].join(',');
      });

      return [headers, ...rows].join('\n');
    } else {
      // JSON format
      const jsonData = results.map(result => ({
        ...result.runs,
        cost_usd: parseFloat(result.runs.cost_usd), // Convert string back to number
        input: result.runs.input as Record<string, unknown>,
        output: result.runs.output as Record<string, unknown>,
        flags: result.runs.flags as Record<string, unknown>
      }));
      return JSON.stringify(jsonData, null, 2);
    }
  } catch (error) {
    console.error('Failed to export runs data:', error);
    throw error;
  }
}