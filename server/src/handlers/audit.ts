import { db } from '../db';
import { auditLogsTable } from '../db/schema';
import { type AuditLog } from '../schema';
import { eq, desc, and, type SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function logAuditEvent(
    orgId: string,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata?: Record<string, any>
): Promise<AuditLog> {
    try {
        const result = await db.insert(auditLogsTable)
            .values({
                id: nanoid(),
                org_id: orgId,
                actor_user_id: actorUserId,
                action: action,
                target_type: targetType,
                target_id: targetId,
                metadata: metadata || {}
            })
            .returning()
            .execute();

        const auditLog = result[0];
        return {
            ...auditLog,
            metadata: auditLog.metadata as Record<string, unknown>
        };
    } catch (error) {
        console.error('Audit event logging failed:', error);
        throw error;
    }
}

export async function getAuditLogsByOrgId(orgId: string, limit: number = 50, offset: number = 0): Promise<AuditLog[]> {
    try {
        const results = await db.select()
            .from(auditLogsTable)
            .where(eq(auditLogsTable.org_id, orgId))
            .orderBy(desc(auditLogsTable.created_at))
            .limit(limit)
            .offset(offset)
            .execute();

        return results.map(result => ({
            ...result,
            metadata: result.metadata as Record<string, unknown>
        }));
    } catch (error) {
        console.error('Fetching audit logs by org failed:', error);
        throw error;
    }
}

export async function getAuditLogsByUser(userId: string, limit: number = 50): Promise<AuditLog[]> {
    try {
        const results = await db.select()
            .from(auditLogsTable)
            .where(eq(auditLogsTable.actor_user_id, userId))
            .orderBy(desc(auditLogsTable.created_at))
            .limit(limit)
            .execute();

        return results.map(result => ({
            ...result,
            metadata: result.metadata as Record<string, unknown>
        }));
    } catch (error) {
        console.error('Fetching audit logs by user failed:', error);
        throw error;
    }
}

export async function getAuditLogsByTarget(targetType: string, targetId: string): Promise<AuditLog[]> {
    try {
        const conditions: SQL<unknown>[] = [
            eq(auditLogsTable.target_type, targetType),
            eq(auditLogsTable.target_id, targetId)
        ];

        const results = await db.select()
            .from(auditLogsTable)
            .where(and(...conditions))
            .orderBy(desc(auditLogsTable.created_at))
            .execute();

        return results.map(result => ({
            ...result,
            metadata: result.metadata as Record<string, unknown>
        }));
    } catch (error) {
        console.error('Fetching audit logs by target failed:', error);
        throw error;
    }
}