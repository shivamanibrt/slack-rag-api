import { WebClient } from '@slack/web-api';

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function slackConnection() {
  try {
    const result = await slackClient.auth.test();
    console.log(`Slack Connected, Bot: ${result.user}, Team: ${result.team}`);

    return true;
  } catch (error) {
    console.error('Slack connection failed:', error);
    return false;
  }
}
