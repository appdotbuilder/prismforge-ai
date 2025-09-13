import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { chatSessionsTable, projectsTable, usersTable, organizationsTable } from '../db/schema';
import { type CreateChatSessionInput, type ChatMessageInput } from '../schema';
import {
  createChatSession,
  getChatSessionById,
  getChatSessionsByProjectId,
  getChatSessionsByUserId,
  sendChatMessage,
  updateChatSession,
  deleteChatSession
} from '../handlers/chat';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Test data
const testUser = {
  id: nanoid(),
  email: 'test@example.com',
  name: 'Test User',
  avatar_url: null
};

const testOrg = {
  id: nanoid(),
  name: 'Test Organization',
  slug: 'test-org',
  owner_user_id: testUser.id,
  plan: 'free' as const
};

const testProject = {
  id: nanoid(),
  org_id: testOrg.id,
  name: 'Test Project',
  description: 'A test project',
  tags: ['test']
};

const testChatInput: CreateChatSessionInput = {
  project_id: testProject.id,
  user_id: testUser.id,
  title: 'Test Chat Session',
  model: 'gpt-4'
};

describe('createChatSession', () => {
  beforeEach(async () => {
    await createDB();
    // Create prerequisite data
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should create a chat session', async () => {
    const result = await createChatSession(testChatInput);

    expect(result.project_id).toEqual(testProject.id);
    expect(result.user_id).toEqual(testUser.id);
    expect(result.title).toEqual('Test Chat Session');
    expect(result.model).toEqual('gpt-4');
    expect(result.messages).toEqual([]);
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save chat session to database', async () => {
    const result = await createChatSession(testChatInput);

    const sessions = await db.select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.id, result.id))
      .execute();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].project_id).toEqual(testProject.id);
    expect(sessions[0].user_id).toEqual(testUser.id);
    expect(sessions[0].title).toEqual('Test Chat Session');
    expect(sessions[0].model).toEqual('gpt-4');
  });

  it('should create chat session with nullable title', async () => {
    const inputWithoutTitle: CreateChatSessionInput = {
      project_id: testProject.id,
      user_id: testUser.id,
      model: 'gpt-3.5-turbo'
    };

    const result = await createChatSession(inputWithoutTitle);

    expect(result.title).toBeNull();
    expect(result.model).toEqual('gpt-3.5-turbo');
  });

  it('should throw error if project does not exist', async () => {
    const invalidInput: CreateChatSessionInput = {
      project_id: 'nonexistent-project',
      user_id: testUser.id,
      model: 'gpt-4'
    };

    await expect(createChatSession(invalidInput))
      .rejects.toThrow(/Project with id nonexistent-project not found/i);
  });

  it('should throw error if user does not exist', async () => {
    const invalidInput: CreateChatSessionInput = {
      project_id: testProject.id,
      user_id: 'nonexistent-user',
      model: 'gpt-4'
    };

    await expect(createChatSession(invalidInput))
      .rejects.toThrow(/User with id nonexistent-user not found/i);
  });
});

describe('getChatSessionById', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should get chat session by id', async () => {
    const created = await createChatSession(testChatInput);
    const result = await getChatSessionById(created.id);

    expect(result).not.toBeNull();
    expect(result!.id).toEqual(created.id);
    expect(result!.project_id).toEqual(testProject.id);
    expect(result!.user_id).toEqual(testUser.id);
    expect(result!.title).toEqual('Test Chat Session');
  });

  it('should return null for nonexistent session', async () => {
    const result = await getChatSessionById('nonexistent-id');
    expect(result).toBeNull();
  });
});

describe('getChatSessionsByProjectId', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should get chat sessions by project id', async () => {
    const session1 = await createChatSession(testChatInput);
    const session2 = await createChatSession({
      ...testChatInput,
      title: 'Second Session'
    });

    const result = await getChatSessionsByProjectId(testProject.id);

    expect(result).toHaveLength(2);
    const sessionIds = result.map(s => s.id).sort();
    expect(sessionIds).toEqual([session1.id, session2.id].sort());
  });

  it('should return empty array for project with no sessions', async () => {
    const result = await getChatSessionsByProjectId(testProject.id);
    expect(result).toEqual([]);
  });
});

describe('getChatSessionsByUserId', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should get chat sessions by user id', async () => {
    const session1 = await createChatSession(testChatInput);
    const session2 = await createChatSession({
      ...testChatInput,
      title: 'User Session 2'
    });

    const result = await getChatSessionsByUserId(testUser.id);

    expect(result).toHaveLength(2);
    const sessionIds = result.map(s => s.id).sort();
    expect(sessionIds).toEqual([session1.id, session2.id].sort());
    result.forEach(session => {
      expect(session.user_id).toEqual(testUser.id);
    });
  });

  it('should return empty array for user with no sessions', async () => {
    const result = await getChatSessionsByUserId(testUser.id);
    expect(result).toEqual([]);
  });
});

describe('sendChatMessage', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should send chat message and return stream', async () => {
    const session = await createChatSession(testChatInput);
    const messageInput: ChatMessageInput = {
      session_id: session.id,
      content: 'Hello, AI!',
      model: 'gpt-4'
    };

    const stream = await sendChatMessage(messageInput);
    expect(stream).toBeInstanceOf(ReadableStream);

    // Read the stream
    const reader = stream.getReader();
    const chunks: string[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new TextDecoder().decode(value));
    }

    const fullResponse = chunks.join('');
    // The response should contain the message split across chunks
    expect(fullResponse).toContain('Hello,');
    expect(fullResponse).toContain('AI!');
    expect(fullResponse).toContain('gpt-4');
    expect(fullResponse).toContain('[DONE]');
  });

  it('should update session messages after sending message', async () => {
    const session = await createChatSession(testChatInput);
    const messageInput: ChatMessageInput = {
      session_id: session.id,
      content: 'Test message',
      model: 'gpt-3.5-turbo'
    };

    // Send message and consume stream
    const stream = await sendChatMessage(messageInput);
    const reader = stream.getReader();
    
    // Consume entire stream to ensure completion
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    // Give a small delay for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    const updatedSession = await getChatSessionById(session.id);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession!.messages).toHaveLength(2); // user + assistant
    expect(updatedSession!.messages[0]['role']).toEqual('user');
    expect(updatedSession!.messages[0]['content']).toEqual('Test message');
    expect(updatedSession!.messages[1]['role']).toEqual('assistant');
    expect(updatedSession!.model).toEqual('gpt-3.5-turbo');
  });

  it('should throw error for nonexistent session', async () => {
    const messageInput: ChatMessageInput = {
      session_id: 'nonexistent-session',
      content: 'Hello',
      model: 'gpt-4'
    };

    await expect(sendChatMessage(messageInput))
      .rejects.toThrow(/Chat session with id nonexistent-session not found/i);
  });
});

describe('updateChatSession', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should update chat session messages', async () => {
    const session = await createChatSession(testChatInput);
    const newMessages = [
      { role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
      { role: 'assistant', content: 'Hi there!', timestamp: new Date().toISOString() }
    ];

    const result = await updateChatSession(session.id, newMessages);

    expect(result.id).toEqual(session.id);
    expect(result.messages).toEqual(newMessages);
    expect(result.updated_at).not.toEqual(session.updated_at);
  });

  it('should update messages in database', async () => {
    const session = await createChatSession(testChatInput);
    const newMessages = [
      { role: 'user', content: 'Database test', timestamp: new Date().toISOString() }
    ];

    await updateChatSession(session.id, newMessages);

    const updatedSession = await getChatSessionById(session.id);
    expect(updatedSession).not.toBeNull();
    expect(updatedSession!.messages).toEqual(newMessages);
  });

  it('should throw error for nonexistent session', async () => {
    const newMessages = [{ role: 'user', content: 'Test' }];

    await expect(updateChatSession('nonexistent-id', newMessages))
      .rejects.toThrow(/Chat session with id nonexistent-id not found/i);
  });
});

describe('deleteChatSession', () => {
  beforeEach(async () => {
    await createDB();
    await db.insert(usersTable).values(testUser).execute();
    await db.insert(organizationsTable).values(testOrg).execute();
    await db.insert(projectsTable).values(testProject).execute();
  });
  afterEach(resetDB);

  it('should delete chat session', async () => {
    const session = await createChatSession(testChatInput);
    
    await deleteChatSession(session.id);

    const deletedSession = await getChatSessionById(session.id);
    expect(deletedSession).toBeNull();
  });

  it('should verify session is removed from database', async () => {
    const session = await createChatSession(testChatInput);
    
    await deleteChatSession(session.id);

    const sessions = await db.select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.id, session.id))
      .execute();

    expect(sessions).toHaveLength(0);
  });

  it('should throw error for nonexistent session', async () => {
    await expect(deleteChatSession('nonexistent-id'))
      .rejects.toThrow(/Chat session with id nonexistent-id not found/i);
  });
});