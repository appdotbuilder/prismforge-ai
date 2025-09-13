import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { billingTable, organizationsTable, usersTable, projectsTable, runsTable, promptsTable, promptVersionsTable } from '../db/schema';
import { type StripeVerificationInput } from '../schema';
import {
    createStripeCheckoutSession,
    verifyStripeSession,
    updateOrganizationPlan,
    getBillingByOrgId,
    createStripePortalSession,
    checkUsageQuota,
    handleStripeWebhook
} from '../handlers/billing';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
    id: 'user_1',
    email: 'test@example.com',
    name: 'Test User'
};

const testOrg = {
    id: 'org_1',
    name: 'Test Organization',
    slug: 'test-org',
    owner_user_id: 'user_1',
    plan: 'free' as const
};

const testProject = {
    id: 'project_1',
    org_id: 'org_1',
    name: 'Test Project',
    description: 'A test project',
    tags: ['test']
};

const testPrompt = {
    id: 'prompt_1',
    project_id: 'project_1',
    name: 'Test Prompt',
    description: 'A test prompt'
};

const testPromptVersion = {
    id: 'version_1',
    prompt_id: 'prompt_1',
    version: '1.0.0',
    content: 'Test content',
    variables: {},
    test_inputs: {},
    created_by: 'user_1'
};

const testRun = {
    id: 'run_1',
    project_id: 'project_1',
    prompt_id: 'prompt_1',
    version_id: 'version_1',
    model: 'gpt-4',
    input: {},
    output: {},
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: '0.01',
    latency_ms: 1000,
    success: true,
    flags: {}
};

describe('Billing Handlers', () => {
    beforeEach(async () => {
        await createDB();
        
        // Create test user
        await db.insert(usersTable).values(testUser).execute();
        
        // Create test organization
        await db.insert(organizationsTable).values(testOrg).execute();
        
        // Create test project
        await db.insert(projectsTable).values(testProject).execute();
        
        // Create test prompt
        await db.insert(promptsTable).values(testPrompt).execute();
        
        // Create test prompt version
        await db.insert(promptVersionsTable).values(testPromptVersion).execute();
    });
    
    afterEach(resetDB);

    describe('createStripeCheckoutSession', () => {
        it('should create a checkout session for valid organization and plan', async () => {
            const result = await createStripeCheckoutSession('org_1', 'pro', 'https://app.example.com/success');

            expect(result.sessionId).toContain('cs_test_');
            expect(result.sessionId).toContain('org_1');
            expect(result.url).toContain('https://checkout.stripe.com/c/pay/');
            expect(result.url).toContain(result.sessionId);
        });

        it('should throw error for non-existent organization', async () => {
            await expect(createStripeCheckoutSession('nonexistent', 'pro', 'https://app.example.com/success'))
                .rejects.toThrow(/organization not found/i);
        });

        it('should throw error for invalid plan', async () => {
            await expect(createStripeCheckoutSession('org_1', 'invalid', 'https://app.example.com/success'))
                .rejects.toThrow(/invalid plan/i);
        });
    });

    describe('verifyStripeSession', () => {
        it('should verify valid session with correct format', async () => {
            const input: StripeVerificationInput = {
                session_id: 'cs_test_123456_org_1'
            };

            const result = await verifyStripeSession(input);

            expect(result.success).toBe(true);
            expect(result.orgId).toBe('org_1');
            expect(result.plan).toBe('pro');
        });

        it('should fail verification for invalid session format', async () => {
            const input: StripeVerificationInput = {
                session_id: 'invalid_session_format'
            };

            const result = await verifyStripeSession(input);

            expect(result.success).toBe(false);
            expect(result.orgId).toBeUndefined();
            expect(result.plan).toBeUndefined();
        });

        it('should fail verification for non-existent organization', async () => {
            const input: StripeVerificationInput = {
                session_id: 'cs_test_123_nonexistent'
            };

            const result = await verifyStripeSession(input);

            expect(result.success).toBe(false);
        });
    });

    describe('updateOrganizationPlan', () => {
        it('should update organization plan to pro', async () => {
            const result = await updateOrganizationPlan('org_1', 'pro', 'cus_stripe123');

            expect(result.org_id).toBe('org_1');
            expect(result.stripe_customer_id).toBe('cus_stripe123');
            expect(result.plan).toBe('pro');
            expect(result.seats).toBe(5);
            expect(result.metered_quota).toBe(10000);
            expect(result.renews_at).toBeInstanceOf(Date);

            // Verify organization plan was updated
            const org = await db.select()
                .from(organizationsTable)
                .where(eq(organizationsTable.id, 'org_1'))
                .execute();
            
            expect(org[0].plan).toBe('pro');
        });

        it('should update organization plan to enterprise', async () => {
            const result = await updateOrganizationPlan('org_1', 'enterprise', 'cus_stripe456');

            expect(result.plan).toBe('enterprise');
            expect(result.seats).toBe(20);
            expect(result.metered_quota).toBe(100000);
        });

        it('should update organization plan to free', async () => {
            const result = await updateOrganizationPlan('org_1', 'free', 'cus_stripe789');

            expect(result.plan).toBe('free');
            expect(result.seats).toBe(1);
            expect(result.metered_quota).toBe(1000);
            expect(result.renews_at).toBeNull();
        });

        it('should handle upsert correctly for existing billing record', async () => {
            // Create initial billing record
            await updateOrganizationPlan('org_1', 'pro', 'cus_initial');

            // Update to enterprise
            const result = await updateOrganizationPlan('org_1', 'enterprise', 'cus_updated');

            expect(result.stripe_customer_id).toBe('cus_updated');
            expect(result.plan).toBe('enterprise');

            // Verify only one record exists
            const billingRecords = await db.select()
                .from(billingTable)
                .where(eq(billingTable.org_id, 'org_1'))
                .execute();
            
            expect(billingRecords).toHaveLength(1);
        });

        it('should throw error for non-existent organization', async () => {
            await expect(updateOrganizationPlan('nonexistent', 'pro', 'cus_test'))
                .rejects.toThrow(/organization not found/i);
        });

        it('should throw error for invalid plan', async () => {
            await expect(updateOrganizationPlan('org_1', 'invalid', 'cus_test'))
                .rejects.toThrow(/invalid plan/i);
        });
    });

    describe('getBillingByOrgId', () => {
        it('should return billing information for organization', async () => {
            // Create billing record
            await updateOrganizationPlan('org_1', 'pro', 'cus_test');

            const result = await getBillingByOrgId('org_1');

            expect(result).not.toBeNull();
            expect(result!.org_id).toBe('org_1');
            expect(result!.plan).toBe('pro');
            expect(result!.stripe_customer_id).toBe('cus_test');
        });

        it('should return null for organization without billing', async () => {
            const result = await getBillingByOrgId('org_1');

            expect(result).toBeNull();
        });

        it('should return null for non-existent organization', async () => {
            const result = await getBillingByOrgId('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('createStripePortalSession', () => {
        it('should create portal session for organization with billing', async () => {
            // Setup billing
            await updateOrganizationPlan('org_1', 'pro', 'cus_test');

            const result = await createStripePortalSession('org_1', 'https://app.example.com/billing');

            expect(result.url).toContain('https://billing.stripe.com/p/session_cus_test');
        });

        it('should throw error for organization without billing', async () => {
            await expect(createStripePortalSession('org_1', 'https://app.example.com/billing'))
                .rejects.toThrow(/no billing information found/i);
        });

        it('should throw error for organization without Stripe customer ID', async () => {
            // Create billing record without Stripe customer ID
            await db.insert(billingTable).values({
                org_id: 'org_1',
                stripe_customer_id: null,
                plan: 'free',
                seats: 1,
                metered_quota: 1000,
                renews_at: null
            }).execute();

            await expect(createStripePortalSession('org_1', 'https://app.example.com/billing'))
                .rejects.toThrow(/no billing information found/i);
        });
    });

    describe('checkUsageQuota', () => {
        it('should return default quota for organization without billing', async () => {
            const result = await checkUsageQuota('org_1');

            expect(result.used).toBe(0);
            expect(result.quota).toBe(1000);
            expect(result.percentage).toBe(0);
            expect(result.exceeded).toBe(false);
        });

        it('should calculate usage correctly with billing setup', async () => {
            // Setup billing
            await updateOrganizationPlan('org_1', 'pro', 'cus_test');

            // Create runs for usage calculation
            await db.insert(runsTable).values([
                { ...testRun, id: 'run_1', tokens_in: 100, cost_usd: '0.01' },
                { ...testRun, id: 'run_2', tokens_in: 200, cost_usd: '0.02' },
                { ...testRun, id: 'run_3', tokens_in: 300, cost_usd: '0.03' }
            ]).execute();

            const result = await checkUsageQuota('org_1');

            expect(result.used).toBe(600);
            expect(result.quota).toBe(10000);
            expect(result.percentage).toBe(6);
            expect(result.exceeded).toBe(false);
        });

        it('should detect quota exceeded', async () => {
            // Setup billing with low quota
            await db.insert(billingTable).values({
                org_id: 'org_1',
                stripe_customer_id: 'cus_test',
                plan: 'free',
                seats: 1,
                metered_quota: 100,
                renews_at: null
            }).execute();

            // Create runs that exceed quota
            await db.insert(runsTable).values([
                { ...testRun, id: 'run_1', tokens_in: 150, cost_usd: '0.01' }
            ]).execute();

            const result = await checkUsageQuota('org_1');

            expect(result.used).toBe(150);
            expect(result.quota).toBe(100);
            expect(result.percentage).toBe(150);
            expect(result.exceeded).toBe(true);
        });

        it('should only count usage from current billing period', async () => {
            // Setup billing
            await updateOrganizationPlan('org_1', 'pro', 'cus_test');

            // Create runs with different dates
            const oldDate = new Date();
            oldDate.setMonth(oldDate.getMonth() - 2);

            await db.insert(runsTable).values([
                { ...testRun, id: 'run_old', tokens_in: 1000, cost_usd: '0.10', created_at: oldDate },
                { ...testRun, id: 'run_current', tokens_in: 100, cost_usd: '0.01' }
            ]).execute();

            const result = await checkUsageQuota('org_1');

            // Should only count current month's usage
            expect(result.used).toBe(100);
        });
    });

    describe('handleStripeWebhook', () => {
        it('should handle payment succeeded event', async () => {
            const event = {
                type: 'invoice.payment_succeeded',
                data: {
                    object: {
                        id: 'in_test123'
                    }
                }
            };

            // Should not throw
            await expect(handleStripeWebhook(event)).resolves.toBeUndefined();
        });

        it('should handle payment failed event', async () => {
            const event = {
                type: 'invoice.payment_failed',
                data: {
                    object: {
                        id: 'in_test456'
                    }
                }
            };

            // Should not throw
            await expect(handleStripeWebhook(event)).resolves.toBeUndefined();
        });

        it('should handle subscription events', async () => {
            const events = [
                {
                    type: 'customer.subscription.updated',
                    data: { object: { id: 'sub_test1' } }
                },
                {
                    type: 'customer.subscription.deleted',
                    data: { object: { id: 'sub_test2' } }
                }
            ];

            for (const event of events) {
                await expect(handleStripeWebhook(event)).resolves.toBeUndefined();
            }
        });

        it('should handle unknown event types gracefully', async () => {
            const event = {
                type: 'unknown.event.type',
                data: { object: { id: 'test' } }
            };

            // Should not throw
            await expect(handleStripeWebhook(event)).resolves.toBeUndefined();
        });

        it('should throw error for invalid event', async () => {
            await expect(handleStripeWebhook(null))
                .rejects.toThrow(/invalid webhook event/i);

            await expect(handleStripeWebhook({}))
                .rejects.toThrow(/invalid webhook event/i);
        });
    });
});