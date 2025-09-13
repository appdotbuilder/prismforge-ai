import { db } from '../db';
import { organizationsTable, membershipsTable, usersTable } from '../db/schema';
import { type CreateOrganizationInput, type Organization, type UpdateOrganizationInput, type CreateMembershipInput, type Membership, type UpdateMembershipInput } from '../schema';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  try {
    // Verify the owner user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.owner_user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('Owner user not found');
    }

    // Generate a unique ID
    const id = `org_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Insert organization record
    const result = await db.insert(organizationsTable)
      .values({
        id,
        name: input.name,
        slug: input.slug,
        owner_user_id: input.owner_user_id,
        plan: input.plan || 'free',
      })
      .returning()
      .execute();

    // Create owner membership
    const membershipId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await db.insert(membershipsTable)
      .values({
        id: membershipId,
        org_id: id,
        user_id: input.owner_user_id,
        role: 'owner',
      })
      .execute();

    return result[0];
  } catch (error) {
    console.error('Organization creation failed:', error);
    throw error;
  }
}

export async function getOrganizationById(id: string): Promise<Organization | null> {
  try {
    const result = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, id))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get organization by ID:', error);
    throw error;
  }
}

export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  try {
    const result = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.slug, slug))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get organization by slug:', error);
    throw error;
  }
}

export async function updateOrganization(input: UpdateOrganizationInput): Promise<Organization> {
  try {
    // Build update values object with only defined fields
    const updateValues: Partial<typeof organizationsTable.$inferInsert> = {};
    
    if (input.name !== undefined) {
      updateValues.name = input.name;
    }
    if (input.slug !== undefined) {
      updateValues.slug = input.slug;
    }
    if (input.plan !== undefined) {
      updateValues.plan = input.plan;
    }

    const result = await db.update(organizationsTable)
      .set(updateValues)
      .where(eq(organizationsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Organization not found');
    }

    return result[0];
  } catch (error) {
    console.error('Organization update failed:', error);
    throw error;
  }
}

export async function getOrganizationsByUserId(userId: string): Promise<Organization[]> {
  try {
    const result = await db.select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      slug: organizationsTable.slug,
      owner_user_id: organizationsTable.owner_user_id,
      plan: organizationsTable.plan,
      created_at: organizationsTable.created_at,
    })
      .from(organizationsTable)
      .innerJoin(membershipsTable, eq(organizationsTable.id, membershipsTable.org_id))
      .where(eq(membershipsTable.user_id, userId))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to get organizations by user ID:', error);
    throw error;
  }
}

export async function createMembership(input: CreateMembershipInput): Promise<Membership> {
  try {
    // Verify the organization exists
    const org = await db.select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, input.org_id))
      .execute();

    if (org.length === 0) {
      throw new Error('Organization not found');
    }

    // Verify the user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .execute();

    if (user.length === 0) {
      throw new Error('User not found');
    }

    // Generate a unique ID
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Insert membership record
    const result = await db.insert(membershipsTable)
      .values({
        id,
        org_id: input.org_id,
        user_id: input.user_id,
        role: input.role,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('Membership creation failed:', error);
    throw error;
  }
}

export async function updateMembership(input: UpdateMembershipInput): Promise<Membership> {
  try {
    const result = await db.update(membershipsTable)
      .set({ role: input.role })
      .where(eq(membershipsTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Membership not found');
    }

    return result[0];
  } catch (error) {
    console.error('Membership update failed:', error);
    throw error;
  }
}

export async function getMembershipsByOrgId(orgId: string): Promise<Membership[]> {
  try {
    const result = await db.select()
      .from(membershipsTable)
      .where(eq(membershipsTable.org_id, orgId))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to get memberships by org ID:', error);
    throw error;
  }
}

export async function getUserMembership(userId: string, orgId: string): Promise<Membership | null> {
  try {
    const result = await db.select()
      .from(membershipsTable)
      .where(and(
        eq(membershipsTable.user_id, userId),
        eq(membershipsTable.org_id, orgId)
      ))
      .execute();

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('Failed to get user membership:', error);
    throw error;
  }
}

export async function deleteMembership(membershipId: string): Promise<void> {
  try {
    const result = await db.delete(membershipsTable)
      .where(eq(membershipsTable.id, membershipId))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('Membership not found');
    }
  } catch (error) {
    console.error('Membership deletion failed:', error);
    throw error;
  }
}