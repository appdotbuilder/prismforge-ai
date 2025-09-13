import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type User, type UpdateUserInput } from '../schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    const result = await db.insert(usersTable)
      .values({
        id: randomUUID(),
        email: input.email,
        name: input.name,
        avatar_url: input.avatar_url || null,
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return results[0] || null;
  } catch (error) {
    console.error('Get user by ID failed:', error);
    throw error;
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    const results = await db.select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .execute();

    return results[0] || null;
  } catch (error) {
    console.error('Get user by email failed:', error);
    throw error;
  }
}

export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update object conditionally
    const updateData: Partial<typeof usersTable.$inferInsert> = {};
    
    if (input.name !== undefined) {
      updateData.name = input.name;
    }
    
    if (input.avatar_url !== undefined) {
      updateData.avatar_url = input.avatar_url;
    }

    const result = await db.update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error(`User with id ${input.id} not found`);
    }

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

export async function updateLastLogin(userId: string): Promise<void> {
  try {
    await db.update(usersTable)
      .set({
        last_login_at: new Date(),
      })
      .where(eq(usersTable.id, userId))
      .execute();
  } catch (error) {
    console.error('Update last login failed:', error);
    throw error;
  }
}