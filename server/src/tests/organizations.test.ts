import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, organizationsTable, membershipsTable } from '../db/schema';
import { 
  type CreateOrganizationInput, 
  type UpdateOrganizationInput,
  type CreateMembershipInput,
  type UpdateMembershipInput
} from '../schema';
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
} from '../handlers/organizations';
import { eq } from 'drizzle-orm';

// Test data
const testUser = {
  id: 'user_test_123',
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null,
};

const testUser2 = {
  id: 'user_test_456',
  email: 'test2@example.com',
  name: 'Test User 2',
  avatar_url: null,
};

const testOrgInput: CreateOrganizationInput = {
  name: 'Test Organization',
  slug: 'test-org',
  owner_user_id: 'user_test_123',
  plan: 'pro',
};

const testMembershipInput: CreateMembershipInput = {
  org_id: '', // Will be set dynamically
  user_id: 'user_test_456',
  role: 'editor',
};

describe('Organization Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  // Helper function to create test users
  const createTestUsers = async () => {
    await db.insert(usersTable).values([testUser, testUser2]).execute();
  };

  describe('createOrganization', () => {
    it('should create an organization with owner membership', async () => {
      await createTestUsers();

      const result = await createOrganization(testOrgInput);

      // Verify organization fields
      expect(result.name).toEqual('Test Organization');
      expect(result.slug).toEqual('test-org');
      expect(result.owner_user_id).toEqual('user_test_123');
      expect(result.plan).toEqual('pro');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);

      // Verify organization was saved to database
      const orgs = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, result.id))
        .execute();

      expect(orgs).toHaveLength(1);
      expect(orgs[0].name).toEqual('Test Organization');

      // Verify owner membership was created
      const memberships = await db.select()
        .from(membershipsTable)
        .where(eq(membershipsTable.org_id, result.id))
        .execute();

      expect(memberships).toHaveLength(1);
      expect(memberships[0].user_id).toEqual('user_test_123');
      expect(memberships[0].role).toEqual('owner');
    });

    it('should use default plan when not specified', async () => {
      await createTestUsers();

      const inputWithoutPlan = {
        name: 'Test Organization',
        slug: 'test-org',
        owner_user_id: 'user_test_123',
      };

      const result = await createOrganization(inputWithoutPlan);
      expect(result.plan).toEqual('free');
    });

    it('should throw error when owner user does not exist', async () => {
      const inputWithInvalidUser = {
        ...testOrgInput,
        owner_user_id: 'nonexistent_user',
      };

      await expect(createOrganization(inputWithInvalidUser)).rejects.toThrow(/owner user not found/i);
    });
  });

  describe('getOrganizationById', () => {
    it('should retrieve organization by ID', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const result = await getOrganizationById(org.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(org.id);
      expect(result!.name).toEqual('Test Organization');
    });

    it('should return null for non-existent ID', async () => {
      const result = await getOrganizationById('nonexistent_id');
      expect(result).toBeNull();
    });
  });

  describe('getOrganizationBySlug', () => {
    it('should retrieve organization by slug', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const result = await getOrganizationBySlug('test-org');

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(org.id);
      expect(result!.slug).toEqual('test-org');
    });

    it('should return null for non-existent slug', async () => {
      const result = await getOrganizationBySlug('nonexistent-slug');
      expect(result).toBeNull();
    });
  });

  describe('updateOrganization', () => {
    it('should update organization fields', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const updateInput: UpdateOrganizationInput = {
        id: org.id,
        name: 'Updated Organization',
        plan: 'enterprise',
      };

      const result = await updateOrganization(updateInput);

      expect(result.name).toEqual('Updated Organization');
      expect(result.plan).toEqual('enterprise');
      expect(result.slug).toEqual('test-org'); // Should remain unchanged
      expect(result.id).toEqual(org.id);

      // Verify database was updated
      const dbOrg = await db.select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, org.id))
        .execute();

      expect(dbOrg[0].name).toEqual('Updated Organization');
      expect(dbOrg[0].plan).toEqual('enterprise');
    });

    it('should only update specified fields', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const updateInput: UpdateOrganizationInput = {
        id: org.id,
        name: 'Updated Name Only',
      };

      const result = await updateOrganization(updateInput);

      expect(result.name).toEqual('Updated Name Only');
      expect(result.plan).toEqual('pro'); // Should remain unchanged
      expect(result.slug).toEqual('test-org'); // Should remain unchanged
    });

    it('should throw error for non-existent organization', async () => {
      const updateInput: UpdateOrganizationInput = {
        id: 'nonexistent_id',
        name: 'Updated Name',
      };

      await expect(updateOrganization(updateInput)).rejects.toThrow(/organization not found/i);
    });
  });

  describe('getOrganizationsByUserId', () => {
    it('should retrieve organizations where user is a member', async () => {
      await createTestUsers();
      
      // Create two organizations
      const org1 = await createOrganization(testOrgInput);
      const org2Input = { ...testOrgInput, name: 'Org 2', slug: 'org-2', owner_user_id: 'user_test_456' };
      const org2 = await createOrganization(org2Input);

      // Add user_test_123 as member to org2
      await createMembership({ org_id: org2.id, user_id: 'user_test_123', role: 'editor' });

      const result = await getOrganizationsByUserId('user_test_123');

      expect(result).toHaveLength(2);
      const orgIds = result.map(org => org.id);
      expect(orgIds).toContain(org1.id);
      expect(orgIds).toContain(org2.id);
    });

    it('should return empty array for user with no organizations', async () => {
      await createTestUsers();

      const result = await getOrganizationsByUserId('user_test_456');
      expect(result).toHaveLength(0);
    });
  });

  describe('createMembership', () => {
    it('should create a membership', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const membershipInput = { ...testMembershipInput, org_id: org.id };
      const result = await createMembership(membershipInput);

      expect(result.org_id).toEqual(org.id);
      expect(result.user_id).toEqual('user_test_456');
      expect(result.role).toEqual('editor');
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);

      // Verify membership was saved to database
      const memberships = await db.select()
        .from(membershipsTable)
        .where(eq(membershipsTable.id, result.id))
        .execute();

      expect(memberships).toHaveLength(1);
      expect(memberships[0].role).toEqual('editor');
    });

    it('should throw error for non-existent organization', async () => {
      await createTestUsers();

      const invalidInput = { ...testMembershipInput, org_id: 'nonexistent_org' };
      await expect(createMembership(invalidInput)).rejects.toThrow(/organization not found/i);
    });

    it('should throw error for non-existent user', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const invalidInput = { org_id: org.id, user_id: 'nonexistent_user', role: 'editor' as const };
      await expect(createMembership(invalidInput)).rejects.toThrow(/user not found/i);
    });
  });

  describe('updateMembership', () => {
    it('should update membership role', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);
      const membership = await createMembership({ ...testMembershipInput, org_id: org.id });

      const updateInput: UpdateMembershipInput = {
        id: membership.id,
        role: 'admin',
      };

      const result = await updateMembership(updateInput);

      expect(result.id).toEqual(membership.id);
      expect(result.role).toEqual('admin');
      expect(result.org_id).toEqual(org.id);
      expect(result.user_id).toEqual('user_test_456');

      // Verify database was updated
      const dbMembership = await db.select()
        .from(membershipsTable)
        .where(eq(membershipsTable.id, membership.id))
        .execute();

      expect(dbMembership[0].role).toEqual('admin');
    });

    it('should throw error for non-existent membership', async () => {
      const updateInput: UpdateMembershipInput = {
        id: 'nonexistent_membership',
        role: 'admin',
      };

      await expect(updateMembership(updateInput)).rejects.toThrow(/membership not found/i);
    });
  });

  describe('getMembershipsByOrgId', () => {
    it('should retrieve all memberships for an organization', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);
      
      // Add additional member
      await createMembership({ ...testMembershipInput, org_id: org.id });

      const result = await getMembershipsByOrgId(org.id);

      expect(result).toHaveLength(2); // Owner + added member
      
      const roles = result.map(m => m.role);
      expect(roles).toContain('owner');
      expect(roles).toContain('editor');

      const userIds = result.map(m => m.user_id);
      expect(userIds).toContain('user_test_123');
      expect(userIds).toContain('user_test_456');
    });

    it('should return empty array for organization with no members', async () => {
      const result = await getMembershipsByOrgId('nonexistent_org');
      expect(result).toHaveLength(0);
    });
  });

  describe('getUserMembership', () => {
    it('should retrieve specific user membership', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const result = await getUserMembership('user_test_123', org.id);

      expect(result).not.toBeNull();
      expect(result!.user_id).toEqual('user_test_123');
      expect(result!.org_id).toEqual(org.id);
      expect(result!.role).toEqual('owner');
    });

    it('should return null for non-existent membership', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);

      const result = await getUserMembership('user_test_456', org.id);
      expect(result).toBeNull();
    });
  });

  describe('deleteMembership', () => {
    it('should delete membership', async () => {
      await createTestUsers();
      const org = await createOrganization(testOrgInput);
      const membership = await createMembership({ ...testMembershipInput, org_id: org.id });

      await deleteMembership(membership.id);

      // Verify membership was deleted from database
      const result = await db.select()
        .from(membershipsTable)
        .where(eq(membershipsTable.id, membership.id))
        .execute();

      expect(result).toHaveLength(0);
    });

    it('should throw error for non-existent membership', async () => {
      await expect(deleteMembership('nonexistent_membership')).rejects.toThrow(/membership not found/i);
    });
  });
});