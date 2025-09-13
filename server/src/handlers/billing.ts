import { db } from '../db';
import { billingTable, organizationsTable, runsTable, projectsTable } from '../db/schema';
import { type StripeVerificationInput, type Billing, type OrganizationPlan } from '../schema';
import { eq, sum, and, gte } from 'drizzle-orm';

export async function createStripeCheckoutSession(orgId: string, plan: string, successUrl: string): Promise<{
    sessionId: string;
    url: string;
}> {
    try {
        // Validate organization exists
        const org = await db.select()
            .from(organizationsTable)
            .where(eq(organizationsTable.id, orgId))
            .limit(1)
            .execute();

        if (!org.length) {
            throw new Error('Organization not found');
        }

        // Validate plan
        const validPlans = ['free', 'pro', 'enterprise'];
        if (!validPlans.includes(plan)) {
            throw new Error('Invalid plan');
        }

        // In a real implementation, this would create a Stripe checkout session
        // For now, we'll return mock data that follows the expected format
        const sessionId = `cs_test_${Date.now()}_${orgId}`;
        const url = `https://checkout.stripe.com/c/pay/${sessionId}`;

        return {
            sessionId,
            url
        };
    } catch (error) {
        console.error('Stripe checkout session creation failed:', error);
        throw error;
    }
}

export async function verifyStripeSession(input: StripeVerificationInput): Promise<{
    success: boolean;
    orgId?: string;
    plan?: string;
}> {
    try {
        // In a real implementation, this would verify with Stripe API
        // For now, we'll extract info from the session_id pattern
        const sessionParts = input.session_id.split('_');
        
        if (sessionParts.length >= 4 && sessionParts[0] === 'cs' && sessionParts[1] === 'test') {
            // Extract org ID - could be the last part or parts[3]
            const orgId = sessionParts.slice(3).join('_'); // Handle org IDs with underscores
            
            // Validate organization exists
            const org = await db.select()
                .from(organizationsTable)
                .where(eq(organizationsTable.id, orgId))
                .limit(1)
                .execute();

            if (org.length) {
                return {
                    success: true,
                    orgId,
                    plan: 'pro'
                };
            }
        }

        return { success: false };
    } catch (error) {
        console.error('Stripe session verification failed:', error);
        throw error;
    }
}

export async function updateOrganizationPlan(orgId: string, plan: string, stripeCustomerId: string): Promise<Billing> {
    try {
        // Validate organization exists
        const org = await db.select()
            .from(organizationsTable)
            .where(eq(organizationsTable.id, orgId))
            .limit(1)
            .execute();

        if (!org.length) {
            throw new Error('Organization not found');
        }

        // Validate plan
        const validPlans: OrganizationPlan[] = ['free', 'pro', 'enterprise'];
        if (!validPlans.includes(plan as OrganizationPlan)) {
            throw new Error('Invalid plan');
        }

        // Set plan-specific defaults
        let seats = 1;
        let meteredQuota = 1000;
        
        switch (plan) {
            case 'pro':
                seats = 5;
                meteredQuota = 10000;
                break;
            case 'enterprise':
                seats = 20;
                meteredQuota = 100000;
                break;
        }

        const renewsAt = plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        // Upsert billing record
        const result = await db.insert(billingTable)
            .values({
                org_id: orgId,
                stripe_customer_id: stripeCustomerId,
                plan: plan as OrganizationPlan,
                seats,
                metered_quota: meteredQuota,
                renews_at: renewsAt
            })
            .onConflictDoUpdate({
                target: billingTable.org_id,
                set: {
                    stripe_customer_id: stripeCustomerId,
                    plan: plan as OrganizationPlan,
                    seats,
                    metered_quota: meteredQuota,
                    renews_at: renewsAt
                }
            })
            .returning()
            .execute();

        // Update organization plan
        await db.update(organizationsTable)
            .set({ plan: plan as OrganizationPlan })
            .where(eq(organizationsTable.id, orgId))
            .execute();

        return result[0];
    } catch (error) {
        console.error('Organization plan update failed:', error);
        throw error;
    }
}

export async function getBillingByOrgId(orgId: string): Promise<Billing | null> {
    try {
        const result = await db.select()
            .from(billingTable)
            .where(eq(billingTable.org_id, orgId))
            .limit(1)
            .execute();

        return result.length > 0 ? result[0] : null;
    } catch (error) {
        console.error('Billing lookup failed:', error);
        throw error;
    }
}

export async function createStripePortalSession(orgId: string, returnUrl: string): Promise<{
    url: string;
}> {
    try {
        // Validate organization and billing exists
        const billing = await getBillingByOrgId(orgId);
        if (!billing || !billing.stripe_customer_id) {
            throw new Error('No billing information found for organization');
        }

        // In a real implementation, this would create a Stripe portal session
        // For now, return a mock URL
        const url = `https://billing.stripe.com/p/session_${billing.stripe_customer_id}`;

        return { url };
    } catch (error) {
        console.error('Stripe portal session creation failed:', error);
        throw error;
    }
}

export async function checkUsageQuota(orgId: string): Promise<{
    used: number;
    quota: number;
    percentage: number;
    exceeded: boolean;
}> {
    try {
        // Get billing information
        const billing = await getBillingByOrgId(orgId);
        if (!billing) {
            // Default quota for organizations without billing setup
            return {
                used: 0,
                quota: 1000,
                percentage: 0,
                exceeded: false
            };
        }

        // Calculate usage from runs table for current billing period
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const usageResult = await db.select({
            totalTokens: sum(runsTable.tokens_in).mapWith(Number)
        })
            .from(runsTable)
            .innerJoin(projectsTable, eq(runsTable.project_id, projectsTable.id))
            .where(
                and(
                    eq(projectsTable.org_id, orgId),
                    gte(runsTable.created_at, startOfMonth)
                )
            )
            .execute();

        const used = usageResult[0]?.totalTokens || 0;
        const quota = billing.metered_quota;
        const percentage = quota > 0 ? Math.round((used / quota) * 100) : 0;
        const exceeded = used > quota;

        return {
            used,
            quota,
            percentage,
            exceeded
        };
    } catch (error) {
        console.error('Usage quota check failed:', error);
        throw error;
    }
}

export async function handleStripeWebhook(event: any): Promise<void> {
    try {
        // In a real implementation, this would handle various Stripe webhook events
        // such as subscription updates, payment failures, etc.
        
        if (!event || !event.type) {
            throw new Error('Invalid webhook event');
        }

        switch (event.type) {
            case 'invoice.payment_succeeded':
                // Handle successful payment
                console.log('Payment succeeded:', event.data.object.id);
                break;
            case 'invoice.payment_failed':
                // Handle failed payment
                console.log('Payment failed:', event.data.object.id);
                break;
            case 'customer.subscription.updated':
                // Handle subscription updates
                console.log('Subscription updated:', event.data.object.id);
                break;
            case 'customer.subscription.deleted':
                // Handle subscription cancellation
                console.log('Subscription deleted:', event.data.object.id);
                break;
            default:
                console.log('Unhandled webhook event type:', event.type);
        }
    } catch (error) {
        console.error('Stripe webhook handling failed:', error);
        throw error;
    }
}