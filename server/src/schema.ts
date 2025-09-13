import { z } from 'zod';

// Enums
export const membershipRoleSchema = z.enum(['owner', 'admin', 'editor', 'viewer']);
export type MembershipRole = z.infer<typeof membershipRoleSchema>;

export const organizationPlanSchema = z.enum(['free', 'pro', 'enterprise']);
export type OrganizationPlan = z.infer<typeof organizationPlanSchema>;

export const providerTypeSchema = z.enum(['openai', 'anthropic', 'gemini', 'local']);
export type ProviderType = z.infer<typeof providerTypeSchema>;

export const experimentStatusSchema = z.enum(['draft', 'running', 'completed', 'cancelled']);
export type ExperimentStatus = z.infer<typeof experimentStatusSchema>;

export const pipelineStatusSchema = z.enum(['draft', 'published']);
export type PipelineStatus = z.infer<typeof pipelineStatusSchema>;

// User schema
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  created_at: z.coerce.date(),
  last_login_at: z.coerce.date().nullable(),
});
export type User = z.infer<typeof userSchema>;

// Organization schema
export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  owner_user_id: z.string(),
  plan: organizationPlanSchema,
  created_at: z.coerce.date(),
});
export type Organization = z.infer<typeof organizationSchema>;

// Membership schema
export const membershipSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  user_id: z.string(),
  role: membershipRoleSchema,
  created_at: z.coerce.date(),
});
export type Membership = z.infer<typeof membershipSchema>;

// Project schema
export const projectSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Project = z.infer<typeof projectSchema>;

// ProviderKey schema
export const providerKeySchema = z.object({
  id: z.string(),
  org_id: z.string(),
  provider: providerTypeSchema,
  label: z.string(),
  encrypted_api_key: z.string(),
  created_at: z.coerce.date(),
});
export type ProviderKey = z.infer<typeof providerKeySchema>;

// Prompt schema
export const promptSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  current_version_id: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Prompt = z.infer<typeof promptSchema>;

// PromptVersion schema
export const promptVersionSchema = z.object({
  id: z.string(),
  prompt_id: z.string(),
  version: z.string(),
  content: z.string(),
  variables: z.record(z.unknown()),
  test_inputs: z.record(z.unknown()),
  commit_message: z.string().nullable(),
  created_by: z.string(),
  created_at: z.coerce.date(),
});
export type PromptVersion = z.infer<typeof promptVersionSchema>;

// Experiment schema
export const experimentSchema = z.object({
  id: z.string(),
  prompt_id: z.string(),
  name: z.string(),
  status: experimentStatusSchema,
  variants: z.record(z.unknown()),
  created_at: z.coerce.date(),
});
export type Experiment = z.infer<typeof experimentSchema>;

// Run schema
export const runSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  prompt_id: z.string(),
  version_id: z.string(),
  experiment_id: z.string().nullable(),
  model: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number(),
  latency_ms: z.number().int(),
  success: z.boolean(),
  flags: z.record(z.unknown()),
  created_at: z.coerce.date(),
});
export type Run = z.infer<typeof runSchema>;

// Pipeline schema
export const pipelineSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  name: z.string(),
  graph: z.record(z.unknown()),
  status: pipelineStatusSchema,
  endpoint_slug: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type Pipeline = z.infer<typeof pipelineSchema>;

// ChatSession schema
export const chatSessionSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  user_id: z.string(),
  title: z.string().nullable(),
  model: z.string(),
  messages: z.array(z.record(z.unknown())),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

// Template schema
export const templateSchema = z.object({
  id: z.string(),
  org_id: z.string().nullable(),
  name: z.string(),
  category: z.string(),
  content: z.record(z.unknown()),
  created_at: z.coerce.date(),
});
export type Template = z.infer<typeof templateSchema>;

// Billing schema
export const billingSchema = z.object({
  org_id: z.string(),
  stripe_customer_id: z.string().nullable(),
  plan: organizationPlanSchema,
  seats: z.number().int(),
  metered_quota: z.number().int(),
  renews_at: z.coerce.date().nullable(),
});
export type Billing = z.infer<typeof billingSchema>;

// AuditLog schema
export const auditLogSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  actor_user_id: z.string(),
  action: z.string(),
  target_type: z.string(),
  target_id: z.string(),
  metadata: z.record(z.unknown()),
  created_at: z.coerce.date(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;

// ApiKey schema
export const apiKeySchema = z.object({
  id: z.string(),
  org_id: z.string(),
  label: z.string(),
  token_hash: z.string(),
  scopes: z.array(z.string()),
  created_at: z.coerce.date(),
  last_used_at: z.coerce.date().nullable(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

// Webhook schema
export const webhookSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  url: z.string().url(),
  secret: z.string(),
  events: z.array(z.string()),
  created_at: z.coerce.date(),
});
export type Webhook = z.infer<typeof webhookSchema>;

// Input schemas for creating/updating entities

// User input schemas
export const createUserInputSchema = z.object({
  email: z.string().email(),
  name: z.string(),
  avatar_url: z.string().url().nullable().optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  avatar_url: z.string().url().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Organization input schemas
export const createOrganizationInputSchema = z.object({
  name: z.string(),
  slug: z.string(),
  owner_user_id: z.string(),
  plan: organizationPlanSchema.optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;

export const updateOrganizationInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  slug: z.string().optional(),
  plan: organizationPlanSchema.optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationInputSchema>;

// Project input schemas
export const createProjectInputSchema = z.object({
  org_id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

// Prompt input schemas
export const createPromptInputSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
});
export type CreatePromptInput = z.infer<typeof createPromptInputSchema>;

export const updatePromptInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});
export type UpdatePromptInput = z.infer<typeof updatePromptInputSchema>;

// PromptVersion input schemas
export const createPromptVersionInputSchema = z.object({
  prompt_id: z.string(),
  version: z.string(),
  content: z.string(),
  variables: z.record(z.unknown()).optional(),
  test_inputs: z.record(z.unknown()).optional(),
  commit_message: z.string().nullable().optional(),
  created_by: z.string(),
});
export type CreatePromptVersionInput = z.infer<typeof createPromptVersionInputSchema>;

// Chat input schemas
export const createChatSessionInputSchema = z.object({
  project_id: z.string(),
  user_id: z.string(),
  title: z.string().nullable().optional(),
  model: z.string(),
});
export type CreateChatSessionInput = z.infer<typeof createChatSessionInputSchema>;

export const chatMessageInputSchema = z.object({
  session_id: z.string(),
  content: z.string(),
  model: z.string(),
});
export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;

// Run input schemas
export const createRunInputSchema = z.object({
  project_id: z.string(),
  prompt_id: z.string(),
  version_id: z.string(),
  experiment_id: z.string().nullable().optional(),
  model: z.string(),
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  cost_usd: z.number(),
  latency_ms: z.number().int(),
  success: z.boolean(),
  flags: z.record(z.unknown()).optional(),
});
export type CreateRunInput = z.infer<typeof createRunInputSchema>;

// Pipeline input schemas
export const createPipelineInputSchema = z.object({
  project_id: z.string(),
  name: z.string(),
  graph: z.record(z.unknown()),
  endpoint_slug: z.string().nullable().optional(),
});
export type CreatePipelineInput = z.infer<typeof createPipelineInputSchema>;

export const updatePipelineInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  graph: z.record(z.unknown()).optional(),
  status: pipelineStatusSchema.optional(),
  endpoint_slug: z.string().nullable().optional(),
});
export type UpdatePipelineInput = z.infer<typeof updatePipelineInputSchema>;

// Membership input schemas
export const createMembershipInputSchema = z.object({
  org_id: z.string(),
  user_id: z.string(),
  role: membershipRoleSchema,
});
export type CreateMembershipInput = z.infer<typeof createMembershipInputSchema>;

export const updateMembershipInputSchema = z.object({
  id: z.string(),
  role: membershipRoleSchema,
});
export type UpdateMembershipInput = z.infer<typeof updateMembershipInputSchema>;

// Provider key input schemas
export const createProviderKeyInputSchema = z.object({
  org_id: z.string(),
  provider: providerTypeSchema,
  label: z.string(),
  api_key: z.string(), // Raw key before encryption
});
export type CreateProviderKeyInput = z.infer<typeof createProviderKeyInputSchema>;

// Analytics input schemas
export const analyticsQueryInputSchema = z.object({
  org_id: z.string(),
  project_id: z.string().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  model: z.string().optional(),
});
export type AnalyticsQueryInput = z.infer<typeof analyticsQueryInputSchema>;

// Stripe verification input
export const stripeVerificationInputSchema = z.object({
  session_id: z.string(),
});
export type StripeVerificationInput = z.infer<typeof stripeVerificationInputSchema>;