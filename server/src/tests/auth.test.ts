import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { 
  createUser, 
  getUserById, 
  getUserByEmail, 
  updateUser, 
  updateLastLogin 
} from '../handlers/auth';
import { eq } from 'drizzle-orm';

// Test input data
const testUserInput: CreateUserInput = {
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: 'https://example.com/avatar.jpg',
};

const minimalUserInput: CreateUserInput = {
  email: 'minimal@example.com',
  name: 'Minimal User',
};

describe('auth handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create a user with all fields', async () => {
      const result = await createUser(testUserInput);

      expect(result.email).toEqual('test@example.com');
      expect(result.name).toEqual('Test User');
      expect(result.avatar_url).toEqual('https://example.com/avatar.jpg');
      expect(result.id).toBeDefined();
      expect(typeof result.id).toBe('string');
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.last_login_at).toBeNull();
    });

    it('should create a user with minimal fields', async () => {
      const result = await createUser(minimalUserInput);

      expect(result.email).toEqual('minimal@example.com');
      expect(result.name).toEqual('Minimal User');
      expect(result.avatar_url).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.last_login_at).toBeNull();
    });

    it('should save user to database', async () => {
      const result = await createUser(testUserInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].email).toEqual('test@example.com');
      expect(users[0].name).toEqual('Test User');
      expect(users[0].avatar_url).toEqual('https://example.com/avatar.jpg');
    });

    it('should enforce unique email constraint', async () => {
      await createUser(testUserInput);

      await expect(createUser(testUserInput)).rejects.toThrow(/duplicate key/i);
    });
  });

  describe('getUserById', () => {
    it('should return user when found', async () => {
      const createdUser = await createUser(testUserInput);
      const result = await getUserById(createdUser.id);

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdUser.id);
      expect(result!.email).toEqual('test@example.com');
      expect(result!.name).toEqual('Test User');
      expect(result!.avatar_url).toEqual('https://example.com/avatar.jpg');
      expect(result!.created_at).toBeInstanceOf(Date);
    });

    it('should return null when user not found', async () => {
      const result = await getUserById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return user when found', async () => {
      const createdUser = await createUser(testUserInput);
      const result = await getUserByEmail('test@example.com');

      expect(result).not.toBeNull();
      expect(result!.id).toEqual(createdUser.id);
      expect(result!.email).toEqual('test@example.com');
      expect(result!.name).toEqual('Test User');
      expect(result!.avatar_url).toEqual('https://example.com/avatar.jpg');
    });

    it('should return null when user not found', async () => {
      const result = await getUserByEmail('nonexistent@example.com');
      expect(result).toBeNull();
    });

    it('should be case-sensitive for email lookup', async () => {
      await createUser(testUserInput);
      const result = await getUserByEmail('TEST@EXAMPLE.COM');
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user name', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        name: 'Updated Name',
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(createdUser.id);
      expect(result.name).toEqual('Updated Name');
      expect(result.email).toEqual('test@example.com'); // Should remain unchanged
      expect(result.avatar_url).toEqual('https://example.com/avatar.jpg'); // Should remain unchanged
    });

    it('should update avatar_url', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        avatar_url: 'https://newavatar.com/image.png',
      };

      const result = await updateUser(updateInput);

      expect(result.id).toEqual(createdUser.id);
      expect(result.avatar_url).toEqual('https://newavatar.com/image.png');
      expect(result.name).toEqual('Test User'); // Should remain unchanged
    });

    it('should update avatar_url to null', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        avatar_url: null,
      };

      const result = await updateUser(updateInput);

      expect(result.avatar_url).toBeNull();
    });

    it('should update multiple fields', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        name: 'New Name',
        avatar_url: 'https://newavatar.com/pic.jpg',
      };

      const result = await updateUser(updateInput);

      expect(result.name).toEqual('New Name');
      expect(result.avatar_url).toEqual('https://newavatar.com/pic.jpg');
    });

    it('should save updates to database', async () => {
      const createdUser = await createUser(testUserInput);
      
      const updateInput: UpdateUserInput = {
        id: createdUser.id,
        name: 'Database Updated',
      };

      await updateUser(updateInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, createdUser.id))
        .execute();

      expect(users[0].name).toEqual('Database Updated');
    });

    it('should throw error when user not found', async () => {
      const updateInput: UpdateUserInput = {
        id: 'non-existent-id',
        name: 'New Name',
      };

      await expect(updateUser(updateInput)).rejects.toThrow(/not found/i);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      const createdUser = await createUser(testUserInput);
      expect(createdUser.last_login_at).toBeNull();

      const beforeUpdate = new Date();
      await updateLastLogin(createdUser.id);

      const updatedUser = await getUserById(createdUser.id);
      expect(updatedUser!.last_login_at).toBeInstanceOf(Date);
      expect(updatedUser!.last_login_at!.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should update existing last login timestamp', async () => {
      const createdUser = await createUser(testUserInput);
      
      // First login
      await updateLastLogin(createdUser.id);
      const firstLogin = await getUserById(createdUser.id);
      
      // Wait a small amount to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Second login
      await updateLastLogin(createdUser.id);
      const secondLogin = await getUserById(createdUser.id);

      expect(secondLogin!.last_login_at!.getTime())
        .toBeGreaterThan(firstLogin!.last_login_at!.getTime());
    });

    it('should not throw error for non-existent user', async () => {
      // This should complete without throwing - it's a silent update
      await expect(updateLastLogin('non-existent-id')).resolves.toBeUndefined();
    });
  });
});