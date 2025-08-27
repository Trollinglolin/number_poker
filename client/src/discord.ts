// src/discord.ts
import { DiscordSDK } from "@discord/embedded-app-sdk";

let discordSdk: DiscordSDK | null = null;

export function getDiscordSdk(): DiscordSDK {
  if (!discordSdk) {
    const clientId = process.env.VITE_DISCORD_CLIENT_ID || '';
    
    // In development, add frame_id to URL if it doesn't exist
    if (process.env.NODE_ENV === 'development' && !window.location.search.includes('frame_id')) {
      const url = new URL(window.location.href);
      url.searchParams.set('frame_id', 'development');
      window.history.replaceState({}, '', url);
    }

    discordSdk = new DiscordSDK(clientId);
  }
  return discordSdk;
}

export async function setupDiscordSdk() {
  const sdk = getDiscordSdk();
  try {
    await sdk.ready();
    console.log('Discord SDK is ready');
    return sdk;
  } catch (error) {
    console.error('Error initializing Discord SDK:', error);
    throw error;
  }
}