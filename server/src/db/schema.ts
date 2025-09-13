import { text, timestamp, boolean, integer, numeric, jsonb, pgTable, pgEnum, primaryKey } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'editor', 'viewer']);
export const organizationPlanEnum = pgEnum('organization_plan', ['free', 'pro', 'enterprise']);
export const providerTypeEnum = pgEnum('provider_type', ['openai', 'anthropic', 'gemini', 'local']);
export const experimentStatusEnum = pgEnum('experiment_status', ['draft', 'running', 'completed', 'cancelled']);
export const pipelineStatusEnum = pgEnum('pipeline_status', ['draft', 'published']);

// Users table
export const usersTable = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatar_url: text('avatar_url'), // Nullable by default
  created_at: timestamp('created_at').defaultNow().notNull(),
  last_login_at: timestamp('last_login_at'),
});

// Organizations table
export const organizationsTable = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  owner_user_id: text('owner_user_id').notNull().references(() => usersTable.id),
  plan: organizationPlanEnum('plan').notNull().default('free'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Memberships table
export const membershipsTable = pgTable('memberships', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  role: membershipRoleEnum('role').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Projects table
export const projectsTable = pgTable('projects', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  tags: jsonb('tags').notNull().default('[]'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Provider keys table
export const providerKeysTable = pgTable('provider_keys', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  provider: providerTypeEnum('provider').notNull(),
  label: text('label').notNull(),
  encrypted_api_key: text('encrypted_api_key').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Prompts table
export const promptsTable = pgTable('prompts', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  current_version_id: text('current_version_id'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Prompt versions table
export const promptVersionsTable = pgTable('prompt_versions', {
  id: text('id').primaryKey(),
  prompt_id: text('prompt_id').notNull().references(() => promptsTable.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  content: text('content').notNull(),
  variables: jsonb('variables').notNull().default('{}'),
  test_inputs: jsonb('test_inputs').notNull().default('{}'),
  commit_message: text('commit_message'),
  created_by: text('created_by').notNull().references(() => usersTable.id),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Experiments table
export const experimentsTable = pgTable('experiments', {
  id: text('id').primaryKey(),
  prompt_id: text('prompt_id').notNull().references(() => promptsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  status: experimentStatusEnum('status').notNull().default('draft'),
  variants: jsonb('variants').notNull().default('{}'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Runs table
export const runsTable = pgTable('runs', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  prompt_id: text('prompt_id').notNull().references(() => promptsTable.id),
  version_id: text('version_id').notNull().references(() => promptVersionsTable.id),
  experiment_id: text('experiment_id').references(() => experimentsTable.id),
  model: text('model').notNull(),
  input: jsonb('input').notNull().default('{}'),
  output: jsonb('output').notNull().default('{}'),
  tokens_in: integer('tokens_in').notNull(),
  tokens_out: integer('tokens_out').notNull(),
  cost_usd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  latency_ms: integer('latency_ms').notNull(),
  success: boolean('success').notNull(),
  flags: jsonb('flags').notNull().default('{}'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Pipelines table
export const pipelinesTable = pgTable('pipelines', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  graph: jsonb('graph').notNull().default('{}'),
  status: pipelineStatusEnum('status').notNull().default('draft'),
  endpoint_slug: text('endpoint_slug'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Chat sessions table
export const chatSessionsTable = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  project_id: text('project_id').notNull().references(() => projectsTable.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => usersTable.id),
  title: text('title'),
  model: text('model').notNull(),
  messages: jsonb('messages').notNull().default('[]'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Templates table
export const templatesTable = pgTable('templates', {
  id: text('id').primaryKey(),
  org_id: text('org_id').references(() => organizationsTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  category: text('category').notNull(),
  content: jsonb('content').notNull().default('{}'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Billing table
export const billingTable = pgTable('billing', {
  org_id: text('org_id').primaryKey().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  stripe_customer_id: text('stripe_customer_id'),
  plan: organizationPlanEnum('plan').notNull().default('free'),
  seats: integer('seats').notNull().default(1),
  metered_quota: integer('metered_quota').notNull().default(1000),
  renews_at: timestamp('renews_at'),
});

// Audit logs table
export const auditLogsTable = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  actor_user_id: text('actor_user_id').notNull().references(() => usersTable.id),
  action: text('action').notNull(),
  target_type: text('target_type').notNull(),
  target_id: text('target_id').notNull(),
  metadata: jsonb('metadata').notNull().default('{}'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// API keys table
export const apiKeysTable = pgTable('api_keys', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  token_hash: text('token_hash').notNull(),
  scopes: jsonb('scopes').notNull().default('[]'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  last_used_at: timestamp('last_used_at'),
});

// Webhooks table
export const webhooksTable = pgTable('webhooks', {
  id: text('id').primaryKey(),
  org_id: text('org_id').notNull().references(() => organizationsTable.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: jsonb('events').notNull().default('[]'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(usersTable, ({ many, one }) => ({
  ownedOrganizations: many(organizationsTable),
  memberships: many(membershipsTable),
  chatSessions: many(chatSessionsTable),
  createdPromptVersions: many(promptVersionsTable),
  auditLogs: many(auditLogsTable),
}));

export const organizationsRelations = relations(organizationsTable, ({ one, many }) => ({
  owner: one(usersTable, {
    fields: [organizationsTable.owner_user_id],
    references: [usersTable.id],
  }),
  memberships: many(membershipsTable),
  projects: many(projectsTable),
  providerKeys: many(providerKeysTable),
  templates: many(templatesTable),
  billing: one(billingTable),
  auditLogs: many(auditLogsTable),
  apiKeys: many(apiKeysTable),
  webhooks: many(webhooksTable),
}));

export const membershipsRelations = relations(membershipsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [membershipsTable.org_id],
    references: [organizationsTable.id],
  }),
  user: one(usersTable, {
    fields: [membershipsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const projectsRelations = relations(projectsTable, ({ one, many }) => ({
  organization: one(organizationsTable, {
    fields: [projectsTable.org_id],
    references: [organizationsTable.id],
  }),
  prompts: many(promptsTable),
  runs: many(runsTable),
  pipelines: many(pipelinesTable),
  chatSessions: many(chatSessionsTable),
}));

export const promptsRelations = relations(promptsTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [promptsTable.project_id],
    references: [projectsTable.id],
  }),
  currentVersion: one(promptVersionsTable, {
    fields: [promptsTable.current_version_id],
    references: [promptVersionsTable.id],
  }),
  versions: many(promptVersionsTable),
  experiments: many(experimentsTable),
  runs: many(runsTable),
}));

export const promptVersionsRelations = relations(promptVersionsTable, ({ one, many }) => ({
  prompt: one(promptsTable, {
    fields: [promptVersionsTable.prompt_id],
    references: [promptsTable.id],
  }),
  createdBy: one(usersTable, {
    fields: [promptVersionsTable.created_by],
    references: [usersTable.id],
  }),
  runs: many(runsTable),
  currentForPrompts: many(promptsTable),
}));

export const experimentsRelations = relations(experimentsTable, ({ one, many }) => ({
  prompt: one(promptsTable, {
    fields: [experimentsTable.prompt_id],
    references: [promptsTable.id],
  }),
  runs: many(runsTable),
}));

export const runsRelations = relations(runsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [runsTable.project_id],
    references: [projectsTable.id],
  }),
  prompt: one(promptsTable, {
    fields: [runsTable.prompt_id],
    references: [promptsTable.id],
  }),
  version: one(promptVersionsTable, {
    fields: [runsTable.version_id],
    references: [promptVersionsTable.id],
  }),
  experiment: one(experimentsTable, {
    fields: [runsTable.experiment_id],
    references: [experimentsTable.id],
  }),
}));

export const pipelinesRelations = relations(pipelinesTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [pipelinesTable.project_id],
    references: [projectsTable.id],
  }),
}));

export const chatSessionsRelations = relations(chatSessionsTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [chatSessionsTable.project_id],
    references: [projectsTable.id],
  }),
  user: one(usersTable, {
    fields: [chatSessionsTable.user_id],
    references: [usersTable.id],
  }),
}));

export const providerKeysRelations = relations(providerKeysTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [providerKeysTable.org_id],
    references: [organizationsTable.id],
  }),
}));

export const templatesRelations = relations(templatesTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [templatesTable.org_id],
    references: [organizationsTable.id],
  }),
}));

export const billingRelations = relations(billingTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [billingTable.org_id],
    references: [organizationsTable.id],
  }),
}));

export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [auditLogsTable.org_id],
    references: [organizationsTable.id],
  }),
  actor: one(usersTable, {
    fields: [auditLogsTable.actor_user_id],
    references: [usersTable.id],
  }),
}));

export const apiKeysRelations = relations(apiKeysTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [apiKeysTable.org_id],
    references: [organizationsTable.id],
  }),
}));

export const webhooksRelations = relations(webhooksTable, ({ one }) => ({
  organization: one(organizationsTable, {
    fields: [webhooksTable.org_id],
    references: [organizationsTable.id],
  }),
}));

// Export all tables for query building
export const tables = {
  users: usersTable,
  organizations: organizationsTable,
  memberships: membershipsTable,
  projects: projectsTable,
  providerKeys: providerKeysTable,
  prompts: promptsTable,
  promptVersions: promptVersionsTable,
  experiments: experimentsTable,
  runs: runsTable,
  pipelines: pipelinesTable,
  chatSessions: chatSessionsTable,
  templates: templatesTable,
  billing: billingTable,
  auditLogs: auditLogsTable,
  apiKeys: apiKeysTable,
  webhooks: webhooksTable,
};