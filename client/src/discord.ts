import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  public_flags: number;
}

export interface DiscordActivity {
  state?: string;
  details?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  buttons?: Array<{ label: string; url: string }>;
  instance?: boolean;
}

let discordSdk: DiscordSDK | null = null;
let auth: { access_token: string; user: DiscordUser } | null = null;

// Initialize the Discord SDK
export const setupDiscordSdk = async (): Promise<void> => {
  try {
    // Only initialize once
    if (discordSdk) return;

    // Initialize the SDK
    discordSdk = new DiscordSDK(process.env.REACT_APP_DISCORD_CLIENT_ID || '');

    // Listen for ready event using the proper event type
    (discordSdk as any).on('ready', () => {
      console.log('Discord SDK is ready!');
    });

    // Wait for the SDK to be ready
    await discordSdk.ready();
    console.log('Discord SDK is ready to authenticate');

    // Authenticate with Discord
    const { code } = await discordSdk.commands.authorize({
      client_id: process.env.REACT_APP_DISCORD_CLIENT_ID || '',
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'rpc.activities.write'],
    });

    // Exchange the code for an access token
    const response = await fetch('/api/discord/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
      }),
    });

    const { access_token } = await response.json();
    
    // Get the authenticated user
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const user = await userResponse.json();
    
    auth = { access_token, user };
    console.log('Authenticated as', user.username);
  } catch (error) {
    console.error('Error initializing Discord SDK:', error);
    throw error;
  }
};

// Get the Discord SDK instance
export const getDiscordSdk = (): DiscordSDK => {
  if (!discordSdk) {
    throw new Error('Discord SDK not initialized. Call setupDiscordSdk() first.');
  }
  return discordSdk;
};

// Get the authenticated user
export const getDiscordUser = (): DiscordUser | null => {
  return auth?.user || null;
};

// Update the user's Discord activity
export const updateActivity = async (activity: DiscordActivity): Promise<void> => {
  if (!discordSdk) {
    console.warn('Discord SDK not initialized');
    return;
  }

  try {
    // Remove pid as it's not part of the type definition
    await discordSdk.commands.setActivity({
      activity: {
        ...activity,
        type: 0, // Playing
      }
    });
  } catch (error) {
    console.error('Error updating Discord activity:', error);
  }
};

// Clear the user's Discord activity
export const clearActivity = async (): Promise<void> => {
  if (!discordSdk) {
    return;
  }

  try {
    await discordSdk.commands.setActivity({ activity: null });
  } catch (error) {
    console.error('Error clearing Discord activity:', error);
  }
};

// Note: getSelectedVoiceChannel is not available in the current SDK version
// This is a placeholder that can be implemented if needed in the future
export const getVoiceChannelId = async (): Promise<string | null> => {
  console.warn('getSelectedVoiceChannel is not available in this version of the Discord SDK');
  return null;
};

export default {
  setupDiscordSdk,
  getDiscordSdk,
  getDiscordUser,
  updateActivity,
  clearActivity,
  getVoiceChannelId,
};
