import { slackClient } from '../config/slack-client.js';

export interface SlackMessage {
  text: string;
  user: string;
  ts: string;
  thread_ts?: string;
  reply_count?: number;
  permalink?: string;
}

export async function fetchChannelHistory(channelId: string, limit: number = 100) {
  try {
    const result = await slackClient.conversations.history({
      channel: channelId,
      limit: limit,
    });

    if (!result.messages) {
      return [];
    }

    return result.messages as SlackMessage[];
  } catch (error) {
    return [];
  }
}

export async function fetchThreadReplies(channelId: string, threadTs: string) {
  try {
    const result = await slackClient.conversations.replies({
      channel: channelId,
      ts: threadTs,
    });

    if (!result.messages) {
      return [];
    }

    return result.messages.slice(1) as SlackMessage[];
  } catch (error) {
    return [];
  }
}

export async function fetchUserInfo(userId: string) {
  try {
    const result = await slackClient.users.info({
      user: userId,
    });

    if (result.user) {
      return {
        id: result.user.id,
        real_name: result.user.real_name || result.user.name,
        display_name: result.user.profile?.display_name,
        email: result.user.profile?.email,
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}
