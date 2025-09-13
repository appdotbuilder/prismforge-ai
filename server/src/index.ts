import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  createUserInputSchema,
  updateUserInputSchema,
  createOrganizationInputSchema,
  updateOrganizationInputSchema,
  createMembershipInputSchema,
  updateMembershipInputSchema,
  createProjectInputSchema,
  updateProjectInputSchema,
  createPromptInputSchema,
  updatePromptInputSchema,
  createPromptVersionInputSchema,
  createChatSessionInputSchema,
  chatMessageInputSchema,
  createRunInputSchema,
  createPipelineInputSchema,
  updatePipelineInputSchema,
  createProviderKeyInputSchema,
  analyticsQueryInputSchema,
  stripeVerificationInputSchema
} from './schema';

// Import handlers
import {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  updateLastLogin
} from './handlers/auth';

import {
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  getOrganizationsByUserId,
  createMembership,
  updateMembership,
  getMembershipsByOrgId,
  getUserMembership,
  deleteMembership
} from './handlers/organizations';

import {
  createProject,
  getProjectById,
  getProjectsByOrgId,
  updateProject,
  deleteProject
} from './handlers/projects';

import {
  createPrompt,
  getPromptById,
  getPromptsByProjectId,
  updatePrompt,
  createPromptVersion,
  getPromptVersionById,
  getPromptVersionsByPromptId,
  promotePromptVersion,
  comparePromptVersions
} from './handlers/prompts';

import {
  createChatSession,
  getChatSessionById,
  getChatSessionsByProjectId,
  getChatSessionsByUserId,
  sendChatMessage,
  updateChatSession,
  deleteChatSession
} from './handlers/chat';

import {
  createExperiment,
  getExperimentById,
  getExperimentsByPromptId,
  startExperiment,
  stopExperiment,
  runExperimentComparison
} from './handlers/experiments';

import {
  createRun,
  getRunById,
  getRunsByProjectId,
  getAnalytics,
  exportRunsData
} from './handlers/runs';

import {
  createPipeline,
  getPipelineById,
  getPipelinesByProjectId,
  updatePipeline,
  publishPipeline,
  executePipeline,
  validatePipelineGraph
} from './handlers/pipelines';

import {
  createStripeCheckoutSession,
  verifyStripeSession,
  updateOrganizationPlan,
  getBillingByOrgId,
  createStripePortalSession,
  checkUsageQuota,
  handleStripeWebhook
} from './handlers/billing';

import {
  createProviderKey,
  getProviderKeysByOrgId,
  getProviderKey,
  deleteProviderKey,
  testProviderKey
} from './handlers/provider_keys';

import {
  getPublicTemplates,
  getTemplatesByCategory,
  getTemplateById,
  createOrganizationTemplate,
  getOrganizationTemplates,
  installTemplate
} from './handlers/templates';

import {
  logAuditEvent,
  getAuditLogsByOrgId,
  getAuditLogsByUser,
  getAuditLogsByTarget
} from './handlers/audit';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Auth routes
  auth: router({
    createUser: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    getUserById: publicProcedure
      .input(z.string())
      .query(({ input }) => getUserById(input)),
    getUserByEmail: publicProcedure
      .input(z.string().email())
      .query(({ input }) => getUserByEmail(input)),
    updateUser: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    updateLastLogin: publicProcedure
      .input(z.string())
      .mutation(({ input }) => updateLastLogin(input)),
  }),

  // Organization routes
  organizations: router({
    create: publicProcedure
      .input(createOrganizationInputSchema)
      .mutation(({ input }) => createOrganization(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getOrganizationById(input)),
    getBySlug: publicProcedure
      .input(z.string())
      .query(({ input }) => getOrganizationBySlug(input)),
    update: publicProcedure
      .input(updateOrganizationInputSchema)
      .mutation(({ input }) => updateOrganization(input)),
    getByUserId: publicProcedure
      .input(z.string())
      .query(({ input }) => getOrganizationsByUserId(input)),
    
    // Membership management
    addMember: publicProcedure
      .input(createMembershipInputSchema)
      .mutation(({ input }) => createMembership(input)),
    updateMember: publicProcedure
      .input(updateMembershipInputSchema)
      .mutation(({ input }) => updateMembership(input)),
    getMembers: publicProcedure
      .input(z.string())
      .query(({ input }) => getMembershipsByOrgId(input)),
    getUserMembership: publicProcedure
      .input(z.object({ userId: z.string(), orgId: z.string() }))
      .query(({ input }) => getUserMembership(input.userId, input.orgId)),
    removeMember: publicProcedure
      .input(z.string())
      .mutation(({ input }) => deleteMembership(input)),
  }),

  // Project routes
  projects: router({
    create: publicProcedure
      .input(createProjectInputSchema)
      .mutation(({ input }) => createProject(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getProjectById(input)),
    getByOrgId: publicProcedure
      .input(z.string())
      .query(({ input }) => getProjectsByOrgId(input)),
    update: publicProcedure
      .input(updateProjectInputSchema)
      .mutation(({ input }) => updateProject(input)),
    delete: publicProcedure
      .input(z.string())
      .mutation(({ input }) => deleteProject(input)),
  }),

  // Prompt routes
  prompts: router({
    create: publicProcedure
      .input(createPromptInputSchema)
      .mutation(({ input }) => createPrompt(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getPromptById(input)),
    getByProjectId: publicProcedure
      .input(z.string())
      .query(({ input }) => getPromptsByProjectId(input)),
    update: publicProcedure
      .input(updatePromptInputSchema)
      .mutation(({ input }) => updatePrompt(input)),
    
    // Version management (CI/CD)
    createVersion: publicProcedure
      .input(createPromptVersionInputSchema)
      .mutation(({ input }) => createPromptVersion(input)),
    getVersionById: publicProcedure
      .input(z.string())
      .query(({ input }) => getPromptVersionById(input)),
    getVersionsByPromptId: publicProcedure
      .input(z.string())
      .query(({ input }) => getPromptVersionsByPromptId(input)),
    promoteVersion: publicProcedure
      .input(z.object({ versionId: z.string(), promptId: z.string() }))
      .mutation(({ input }) => promotePromptVersion(input.versionId, input.promptId)),
    compareVersions: publicProcedure
      .input(z.object({ versionId1: z.string(), versionId2: z.string() }))
      .query(({ input }) => comparePromptVersions(input.versionId1, input.versionId2)),
  }),

  // Chat routes
  chat: router({
    createSession: publicProcedure
      .input(createChatSessionInputSchema)
      .mutation(({ input }) => createChatSession(input)),
    getSessionById: publicProcedure
      .input(z.string())
      .query(({ input }) => getChatSessionById(input)),
    getSessionsByProjectId: publicProcedure
      .input(z.string())
      .query(({ input }) => getChatSessionsByProjectId(input)),
    getSessionsByUserId: publicProcedure
      .input(z.string())
      .query(({ input }) => getChatSessionsByUserId(input)),
    sendMessage: publicProcedure
      .input(chatMessageInputSchema)
      .mutation(({ input }) => sendChatMessage(input)),
    updateSession: publicProcedure
      .input(z.object({ sessionId: z.string(), messages: z.array(z.any()) }))
      .mutation(({ input }) => updateChatSession(input.sessionId, input.messages)),
    deleteSession: publicProcedure
      .input(z.string())
      .mutation(({ input }) => deleteChatSession(input)),
  }),

  // Experiment routes (A/B testing)
  experiments: router({
    create: publicProcedure
      .input(z.object({ promptId: z.string(), name: z.string(), variants: z.record(z.any()) }))
      .mutation(({ input }) => createExperiment(input.promptId, input.name, input.variants)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getExperimentById(input)),
    getByPromptId: publicProcedure
      .input(z.string())
      .query(({ input }) => getExperimentsByPromptId(input)),
    start: publicProcedure
      .input(z.string())
      .mutation(({ input }) => startExperiment(input)),
    stop: publicProcedure
      .input(z.string())
      .mutation(({ input }) => stopExperiment(input)),
    runComparison: publicProcedure
      .input(z.object({ experimentId: z.string(), input: z.record(z.any()) }))
      .mutation(({ input }) => runExperimentComparison(input.experimentId, input.input)),
  }),

  // Run and Analytics routes
  runs: router({
    create: publicProcedure
      .input(createRunInputSchema)
      .mutation(({ input }) => createRun(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getRunById(input)),
    getByProjectId: publicProcedure
      .input(z.object({ projectId: z.string(), limit: z.number().optional() }))
      .query(({ input }) => getRunsByProjectId(input.projectId, input.limit)),
    getAnalytics: publicProcedure
      .input(analyticsQueryInputSchema)
      .query(({ input }) => getAnalytics(input)),
    exportData: publicProcedure
      .input(z.object({ query: analyticsQueryInputSchema, format: z.enum(['csv', 'json']) }))
      .query(({ input }) => exportRunsData(input.query, input.format)),
  }),

  // Pipeline routes
  pipelines: router({
    create: publicProcedure
      .input(createPipelineInputSchema)
      .mutation(({ input }) => createPipeline(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getPipelineById(input)),
    getByProjectId: publicProcedure
      .input(z.string())
      .query(({ input }) => getPipelinesByProjectId(input)),
    update: publicProcedure
      .input(updatePipelineInputSchema)
      .mutation(({ input }) => updatePipeline(input)),
    publish: publicProcedure
      .input(z.string())
      .mutation(({ input }) => publishPipeline(input)),
    execute: publicProcedure
      .input(z.object({ slug: z.string(), input: z.record(z.any()), apiKey: z.string() }))
      .mutation(({ input }) => executePipeline(input.slug, input.input, input.apiKey)),
    validateGraph: publicProcedure
      .input(z.record(z.any()))
      .query(({ input }) => validatePipelineGraph(input)),
  }),

  // Billing routes
  billing: router({
    createCheckoutSession: publicProcedure
      .input(z.object({ orgId: z.string(), plan: z.string(), successUrl: z.string() }))
      .mutation(({ input }) => createStripeCheckoutSession(input.orgId, input.plan, input.successUrl)),
    verifySession: publicProcedure
      .input(stripeVerificationInputSchema)
      .mutation(({ input }) => verifyStripeSession(input)),
    updatePlan: publicProcedure
      .input(z.object({ orgId: z.string(), plan: z.string(), stripeCustomerId: z.string() }))
      .mutation(({ input }) => updateOrganizationPlan(input.orgId, input.plan, input.stripeCustomerId)),
    getByOrgId: publicProcedure
      .input(z.string())
      .query(({ input }) => getBillingByOrgId(input)),
    createPortalSession: publicProcedure
      .input(z.object({ orgId: z.string(), returnUrl: z.string() }))
      .mutation(({ input }) => createStripePortalSession(input.orgId, input.returnUrl)),
    checkQuota: publicProcedure
      .input(z.string())
      .query(({ input }) => checkUsageQuota(input)),
    webhook: publicProcedure
      .input(z.any())
      .mutation(({ input }) => handleStripeWebhook(input)),
  }),

  // Provider keys routes
  providerKeys: router({
    create: publicProcedure
      .input(createProviderKeyInputSchema)
      .mutation(({ input }) => createProviderKey(input)),
    getByOrgId: publicProcedure
      .input(z.string())
      .query(({ input }) => getProviderKeysByOrgId(input)),
    getByProvider: publicProcedure
      .input(z.object({ orgId: z.string(), provider: z.string() }))
      .query(({ input }) => getProviderKey(input.orgId, input.provider)),
    delete: publicProcedure
      .input(z.string())
      .mutation(({ input }) => deleteProviderKey(input)),
    test: publicProcedure
      .input(z.object({ provider: z.string(), apiKey: z.string() }))
      .mutation(({ input }) => testProviderKey(input.provider, input.apiKey)),
  }),

  // Templates routes
  templates: router({
    getPublic: publicProcedure
      .query(() => getPublicTemplates()),
    getByCategory: publicProcedure
      .input(z.string())
      .query(({ input }) => getTemplatesByCategory(input)),
    getById: publicProcedure
      .input(z.string())
      .query(({ input }) => getTemplateById(input)),
    createOrganizationTemplate: publicProcedure
      .input(z.object({ orgId: z.string(), name: z.string(), category: z.string(), content: z.record(z.any()) }))
      .mutation(({ input }) => createOrganizationTemplate(input.orgId, input.name, input.category, input.content)),
    getByOrgId: publicProcedure
      .input(z.string())
      .query(({ input }) => getOrganizationTemplates(input)),
    install: publicProcedure
      .input(z.object({ templateId: z.string(), projectId: z.string() }))
      .mutation(({ input }) => installTemplate(input.templateId, input.projectId)),
  }),

  // Audit routes
  audit: router({
    log: publicProcedure
      .input(z.object({
        orgId: z.string(),
        actorUserId: z.string(),
        action: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        metadata: z.record(z.any()).optional()
      }))
      .mutation(({ input }) => logAuditEvent(input.orgId, input.actorUserId, input.action, input.targetType, input.targetId, input.metadata)),
    getByOrgId: publicProcedure
      .input(z.object({ orgId: z.string(), limit: z.number().optional(), offset: z.number().optional() }))
      .query(({ input }) => getAuditLogsByOrgId(input.orgId, input.limit, input.offset)),
    getByUser: publicProcedure
      .input(z.object({ userId: z.string(), limit: z.number().optional() }))
      .query(({ input }) => getAuditLogsByUser(input.userId, input.limit)),
    getByTarget: publicProcedure
      .input(z.object({ targetType: z.string(), targetId: z.string() }))
      .query(({ input }) => getAuditLogsByTarget(input.targetType, input.targetId)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`PrismForge AI Studio TRPC server listening at port: ${port}`);
}

start();