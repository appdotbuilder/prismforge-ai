import { db } from '../db';
import { chatSessionsTable, projectsTable, usersTable } from '../db/schema';
import { type CreateChatSessionInput, type ChatSession, type ChatMessageInput } from '../schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const createChatSession = async (input: CreateChatSessionInput): Promise<ChatSession> => {
  try {
    // Verify project exists
    const project = await db.select()
      .from(projectsTable)
      .where(eq(projectsTable.id, input.project_id))
      .limit(1)
      .execute();

    if (project.length === 0) {
      throw new Error(`Project with id ${input.project_id} not found`);
    }

    // Verify user exists
    const user = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, input.user_id))
      .limit(1)
      .execute();

    if (user.length === 0) {
      throw new Error(`User with id ${input.user_id} not found`);
    }

    // Insert chat session
    const result = await db.insert(chatSessionsTable)
      .values({
        id: nanoid(),
        project_id: input.project_id,
        user_id: input.user_id,
        title: input.title || null,
        model: input.model,
        messages: []
      })
      .returning()
      .execute();

    const session = result[0];
    return {
      ...session,
      messages: session.messages as Record<string, unknown>[]
    };
  } catch (error) {
    console.error('Chat session creation failed:', error);
    throw error;
  }
};

export const getChatSessionById = async (id: string): Promise<ChatSession | null> => {
  try {
    const result = await db.select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.id, id))
      .limit(1)
      .execute();

    if (result.length === 0) {
      return null;
    }

    const session = result[0];
    return {
      ...session,
      messages: session.messages as Record<string, unknown>[]
    };
  } catch (error) {
    console.error('Get chat session by id failed:', error);
    throw error;
  }
};

export const getChatSessionsByProjectId = async (projectId: string): Promise<ChatSession[]> => {
  try {
    const result = await db.select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.project_id, projectId))
      .execute();

    return result.map(session => ({
      ...session,
      messages: session.messages as Record<string, unknown>[]
    }));
  } catch (error) {
    console.error('Get chat sessions by project id failed:', error);
    throw error;
  }
};

export const getChatSessionsByUserId = async (userId: string): Promise<ChatSession[]> => {
  try {
    const result = await db.select()
      .from(chatSessionsTable)
      .where(eq(chatSessionsTable.user_id, userId))
      .execute();

    return result.map(session => ({
      ...session,
      messages: session.messages as Record<string, unknown>[]
    }));
  } catch (error) {
    console.error('Get chat sessions by user id failed:', error);
    throw error;
  }
};

export const sendChatMessage = async (input: ChatMessageInput): Promise<ReadableStream<Uint8Array>> => {
  try {
    // Verify session exists
    const session = await getChatSessionById(input.session_id);
    if (!session) {
      throw new Error(`Chat session with id ${input.session_id} not found`);
    }

    // Add user message to session
    const userMessage = {
      role: 'user',
      content: input.content,
      timestamp: new Date().toISOString()
    };

    const updatedMessages = [...session.messages, userMessage];

    // Update session with user message
    await db.update(chatSessionsTable)
      .set({
        messages: updatedMessages,
        model: input.model,
        updated_at: new Date()
      })
      .where(eq(chatSessionsTable.id, input.session_id))
      .execute();

    // Create a simple streaming response (placeholder for real AI integration)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const response = `I received your message: "${input.content}". This is a placeholder response using ${input.model}.`;
        
        // Simulate streaming by chunking the response
        const words = response.split(' ');
        let index = 0;
        
        const interval = setInterval(async () => {
          if (index < words.length) {
            const chunk = words[index] + ' ';
            controller.enqueue(encoder.encode(`data: {"content": "${chunk}"}\n\n`));
            index++;
          } else {
            // Add assistant message to session
            const assistantMessage = {
              role: 'assistant',
              content: response,
              timestamp: new Date().toISOString()
            };

            const finalMessages = [...updatedMessages, assistantMessage];
            
            await db.update(chatSessionsTable)
              .set({
                messages: finalMessages,
                updated_at: new Date()
              })
              .where(eq(chatSessionsTable.id, input.session_id))
              .execute();

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            clearInterval(interval);
          }
        }, 50);
      }
    });

    return stream;
  } catch (error) {
    console.error('Send chat message failed:', error);
    throw error;
  }
};

export const updateChatSession = async (sessionId: string, messages: any[]): Promise<ChatSession> => {
  try {
    // Verify session exists
    const existingSession = await getChatSessionById(sessionId);
    if (!existingSession) {
      throw new Error(`Chat session with id ${sessionId} not found`);
    }

    const result = await db.update(chatSessionsTable)
      .set({
        messages: messages,
        updated_at: new Date()
      })
      .where(eq(chatSessionsTable.id, sessionId))
      .returning()
      .execute();

    const session = result[0];
    return {
      ...session,
      messages: session.messages as Record<string, unknown>[]
    };
  } catch (error) {
    console.error('Update chat session failed:', error);
    throw error;
  }
};

export const deleteChatSession = async (id: string): Promise<void> => {
  try {
    // Verify session exists
    const existingSession = await getChatSessionById(id);
    if (!existingSession) {
      throw new Error(`Chat session with id ${id} not found`);
    }

    await db.delete(chatSessionsTable)
      .where(eq(chatSessionsTable.id, id))
      .execute();
  } catch (error) {
    console.error('Delete chat session failed:', error);
    throw error;
  }
};