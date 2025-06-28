import axios from 'axios';
import { Bot } from 'grammy';
import { SiteModel } from '../models/site.model';
import { UserModel } from '../models/user.model';

interface SendMessageOptions {
  message_thread_id?: number;
}

export class MonitorService {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  async checkSite(url: string): Promise<{ status: number; error?: string }> {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'PingoBot/1.0 (Website Monitor Bot)'
        }
      });
      return { status: response.status };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          status: error.response?.status || 500,
          error: error.message,
        };
      }
      return { status: 500, error: 'Unknown error occurred' };
    }
  }

  private extractChatId(chatIdentifier: string): string {
    return chatIdentifier.split(':')[0];
  }

  private extractThreadId(chatIdentifier: string): number | undefined {
    const parts = chatIdentifier.split(':');
    return parts.length > 1 ? parseInt(parts[1]) : undefined;
  }

  async monitorSites() {
    try {
      console.log(`[${new Date().toISOString()}] Starting site monitoring...`);
      const sites = await SiteModel.find({ isActive: true });
      console.log(`Found ${sites.length} active sites to monitor`);
      
      for (const site of sites) {
        const now = new Date();
        const timeSinceLastCheck = now.getTime() - site.lastCheck.getTime();
        const intervalMs = site.interval * 60 * 1000;
  
        if (timeSinceLastCheck >= intervalMs) {
          try {
            console.log(`Checking ${site.url}...`);
            const checkResult = await this.checkSite(site.url);
            
            if (checkResult.status !== 200) {
              console.log(`Alert needed for ${site.url}, status: ${checkResult.status}`);
              const message = `⚠️ Alert for ${site.url}\nStatus: ${checkResult.status}\n${checkResult.error ? `Error: ${checkResult.error}` : ''}`;
              
              const chatId = this.extractChatId(site.chatId);
              const threadId = this.extractThreadId(site.chatId);
              
              const sendOptions: SendMessageOptions = {};
              if (threadId) {
                sendOptions.message_thread_id = threadId;
              }
              
              console.log(`Sending message to chat ${chatId}...`);
              await this.bot.api.sendMessage(chatId, message, sendOptions);
              console.log(`Message sent successfully`);
            }
  
            site.lastCheck = now;
            await site.save();
          } catch (error) {
            console.error(`Error monitoring site ${site.url}:`, error);
            console.error('Error details:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in monitorSites:', error);
    }
  }

  async sendDailyStats() {
    try {
      const users = await UserModel.find({ dailyStats: 'on', isActive: true });
      
      for (const user of users) {
        try {
          const sites = await SiteModel.find({
            chatId: user.chatId,
            isActive: true
          });

          if (sites.length === 0) continue;

          let statsMessage = '📊 Daily Statistics Report\n\n';
          
          for (const site of sites) {
            const result = await this.checkSite(site.url);
            const status = result.status === 200 ? '✅' : '❌';
            const intervalText = site.interval >= 1440
              ? `${site.interval / 1440}d`
              : site.interval >= 60
                ? `${site.interval / 60}h`
                : `${site.interval}m`;
            
            statsMessage += `${status} ${site.url} (${intervalText})\n`;
            if (result.status !== 200) {
              statsMessage += `   Error: ${result.error || 'Unknown error'}\n`;
            }
          }

          const chatId = this.extractChatId(user.chatId);
          const threadId = this.extractThreadId(user.chatId);
          
          const sendOptions: SendMessageOptions = {};
          if (threadId) {
            sendOptions.message_thread_id = threadId;
          }
          
          await this.bot.api.sendMessage(chatId, statsMessage, sendOptions);
        } catch (error) {
          console.error(`Error sending daily stats to user ${user.userId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in sendDailyStats:', error);
    }
  }
}