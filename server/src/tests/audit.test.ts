import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, organizationsTable, auditLogsTable } from '../db/schema';
import { logAuditEvent, getAuditLogsByOrgId, getAuditLogsByUser, getAuditLogsByTarget } from '../handlers/audit';
import { nanoid } from 'nanoid';
import { eq, desc } from 'drizzle-orm';

// Test data
const testUser = {
    id: nanoid(),
    email: 'test@example.com',
    name: 'Test User'
};

const testOrg = {
    id: nanoid(),
    name: 'Test Organization',
    slug: 'test-org',
    owner_user_id: testUser.id
};

const testAuditData = {
    action: 'project.create',
    targetType: 'project',
    targetId: nanoid(),
    metadata: { projectName: 'Test Project', tags: ['test'] }
};

describe('Audit Handler', () => {
    beforeEach(async () => {
        await createDB();
        
        // Create prerequisite data
        await db.insert(usersTable).values(testUser).execute();
        await db.insert(organizationsTable).values(testOrg).execute();
    });
    
    afterEach(resetDB);

    describe('logAuditEvent', () => {
        it('should log audit event successfully', async () => {
            const result = await logAuditEvent(
                testOrg.id,
                testUser.id,
                testAuditData.action,
                testAuditData.targetType,
                testAuditData.targetId,
                testAuditData.metadata
            );

            expect(result.id).toBeDefined();
            expect(result.org_id).toEqual(testOrg.id);
            expect(result.actor_user_id).toEqual(testUser.id);
            expect(result.action).toEqual(testAuditData.action);
            expect(result.target_type).toEqual(testAuditData.targetType);
            expect(result.target_id).toEqual(testAuditData.targetId);
            expect(result.metadata).toEqual(testAuditData.metadata);
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should log audit event with empty metadata when not provided', async () => {
            const result = await logAuditEvent(
                testOrg.id,
                testUser.id,
                testAuditData.action,
                testAuditData.targetType,
                testAuditData.targetId
            );

            expect(result.metadata).toEqual({});
        });

        it('should save audit event to database', async () => {
            const result = await logAuditEvent(
                testOrg.id,
                testUser.id,
                testAuditData.action,
                testAuditData.targetType,
                testAuditData.targetId,
                testAuditData.metadata
            );

            const auditLogs = await db.select()
                .from(auditLogsTable)
                .where(eq(auditLogsTable.id, result.id))
                .execute();

            expect(auditLogs).toHaveLength(1);
            expect(auditLogs[0].org_id).toEqual(testOrg.id);
            expect(auditLogs[0].actor_user_id).toEqual(testUser.id);
            expect(auditLogs[0].action).toEqual(testAuditData.action);
            expect(auditLogs[0].target_type).toEqual(testAuditData.targetType);
            expect(auditLogs[0].target_id).toEqual(testAuditData.targetId);
            expect(auditLogs[0].metadata).toEqual(testAuditData.metadata);
        });

        it('should handle invalid foreign key constraints', async () => {
            await expect(
                logAuditEvent(
                    'nonexistent-org',
                    'nonexistent-user',
                    testAuditData.action,
                    testAuditData.targetType,
                    testAuditData.targetId,
                    testAuditData.metadata
                )
            ).rejects.toThrow(/violates foreign key constraint|foreign key constraint fails/i);
        });
    });

    describe('getAuditLogsByOrgId', () => {
        beforeEach(async () => {
            // Create multiple audit logs for testing
            for (let i = 0; i < 5; i++) {
                await logAuditEvent(
                    testOrg.id,
                    testUser.id,
                    `action.${i}`,
                    'resource',
                    `target_${i}`,
                    { index: i }
                );
            }

            // Create audit log for different org
            const otherOrg = {
                id: nanoid(),
                name: 'Other Organization',
                slug: 'other-org',
                owner_user_id: testUser.id
            };
            await db.insert(organizationsTable).values(otherOrg).execute();
            await logAuditEvent(
                otherOrg.id,
                testUser.id,
                'other.action',
                'resource',
                'other_target'
            );
        });

        it('should fetch audit logs for organization', async () => {
            const result = await getAuditLogsByOrgId(testOrg.id);

            expect(result).toHaveLength(5);
            result.forEach(log => {
                expect(log.org_id).toEqual(testOrg.id);
                expect(log.actor_user_id).toEqual(testUser.id);
                expect(log.created_at).toBeInstanceOf(Date);
            });
        });

        it('should return logs in descending order by created_at', async () => {
            const result = await getAuditLogsByOrgId(testOrg.id);

            expect(result).toHaveLength(5);
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].created_at >= result[i].created_at).toBe(true);
            }
        });

        it('should apply limit correctly', async () => {
            const result = await getAuditLogsByOrgId(testOrg.id, 3);

            expect(result).toHaveLength(3);
            result.forEach(log => {
                expect(log.org_id).toEqual(testOrg.id);
            });
        });

        it('should apply offset correctly', async () => {
            const allLogs = await getAuditLogsByOrgId(testOrg.id);
            const offsetLogs = await getAuditLogsByOrgId(testOrg.id, 50, 2);

            expect(offsetLogs).toHaveLength(3);
            expect(offsetLogs[0].id).toEqual(allLogs[2].id);
        });

        it('should return empty array for nonexistent organization', async () => {
            const result = await getAuditLogsByOrgId('nonexistent-org');
            expect(result).toHaveLength(0);
        });

        it('should use default pagination parameters', async () => {
            const result = await getAuditLogsByOrgId(testOrg.id);
            expect(result).toHaveLength(5); // All logs since less than default limit of 50
        });
    });

    describe('getAuditLogsByUser', () => {
        beforeEach(async () => {
            // Create audit logs for test user
            for (let i = 0; i < 3; i++) {
                await logAuditEvent(
                    testOrg.id,
                    testUser.id,
                    `user.action.${i}`,
                    'resource',
                    `target_${i}`
                );
            }

            // Create audit log for different user
            const otherUser = {
                id: nanoid(),
                email: 'other@example.com',
                name: 'Other User'
            };
            await db.insert(usersTable).values(otherUser).execute();
            await logAuditEvent(
                testOrg.id,
                otherUser.id,
                'other.user.action',
                'resource',
                'other_target'
            );
        });

        it('should fetch audit logs for specific user', async () => {
            const result = await getAuditLogsByUser(testUser.id);

            expect(result).toHaveLength(3);
            result.forEach(log => {
                expect(log.actor_user_id).toEqual(testUser.id);
                expect(log.created_at).toBeInstanceOf(Date);
            });
        });

        it('should return logs in descending order by created_at', async () => {
            const result = await getAuditLogsByUser(testUser.id);

            expect(result).toHaveLength(3);
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].created_at >= result[i].created_at).toBe(true);
            }
        });

        it('should apply limit correctly', async () => {
            const result = await getAuditLogsByUser(testUser.id, 2);

            expect(result).toHaveLength(2);
            result.forEach(log => {
                expect(log.actor_user_id).toEqual(testUser.id);
            });
        });

        it('should return empty array for nonexistent user', async () => {
            const result = await getAuditLogsByUser('nonexistent-user');
            expect(result).toHaveLength(0);
        });

        it('should use default limit parameter', async () => {
            const result = await getAuditLogsByUser(testUser.id);
            expect(result).toHaveLength(3); // All logs since less than default limit of 50
        });
    });

    describe('getAuditLogsByTarget', () => {
        beforeEach(async () => {
            const targetId = 'test-target-123';
            
            // Create audit logs for specific target
            for (let i = 0; i < 3; i++) {
                await logAuditEvent(
                    testOrg.id,
                    testUser.id,
                    `target.action.${i}`,
                    'project',
                    targetId,
                    { actionIndex: i }
                );
            }

            // Create audit logs for different target type but same ID
            await logAuditEvent(
                testOrg.id,
                testUser.id,
                'different.type.action',
                'user',
                targetId
            );

            // Create audit log for same target type but different ID
            await logAuditEvent(
                testOrg.id,
                testUser.id,
                'different.id.action',
                'project',
                'different-target-456'
            );
        });

        it('should fetch audit logs for specific target type and ID', async () => {
            const result = await getAuditLogsByTarget('project', 'test-target-123');

            expect(result).toHaveLength(3);
            result.forEach(log => {
                expect(log.target_type).toEqual('project');
                expect(log.target_id).toEqual('test-target-123');
                expect(log.created_at).toBeInstanceOf(Date);
            });
        });

        it('should return logs in descending order by created_at', async () => {
            const result = await getAuditLogsByTarget('project', 'test-target-123');

            expect(result).toHaveLength(3);
            for (let i = 1; i < result.length; i++) {
                expect(result[i - 1].created_at >= result[i].created_at).toBe(true);
            }
        });

        it('should filter by both target type and ID', async () => {
            // Should not return logs with same ID but different type
            const result = await getAuditLogsByTarget('user', 'test-target-123');
            expect(result).toHaveLength(1);
            expect(result[0].target_type).toEqual('user');
            expect(result[0].target_id).toEqual('test-target-123');
        });

        it('should return empty array for nonexistent target', async () => {
            const result = await getAuditLogsByTarget('nonexistent-type', 'nonexistent-id');
            expect(result).toHaveLength(0);
        });

        it('should handle complex metadata correctly', async () => {
            const complexMetadata = {
                nested: { data: 'value' },
                array: [1, 2, 3],
                boolean: true
            };

            await logAuditEvent(
                testOrg.id,
                testUser.id,
                'complex.action',
                'complex',
                'complex-target',
                complexMetadata
            );

            const result = await getAuditLogsByTarget('complex', 'complex-target');
            expect(result).toHaveLength(1);
            expect(result[0].metadata).toEqual(complexMetadata);
        });
    });
});