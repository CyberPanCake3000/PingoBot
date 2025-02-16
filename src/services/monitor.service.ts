import axios from 'axios';
import { Bot } from 'grammy';
import { SiteModel } from '../models/site.model';

export class MonitorService {
  private bot: Bot;

  constructor(bot: Bot) {
    this.bot = bot;
  }

  async checkSite(url: string): Promise<{ status: number; error?: string }> {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
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

  async monitorSites() {
    const sites = await SiteModel.find({ isActive: true });
    
    for (const site of sites) {
      const now = new Date();
      const timeSinceLastCheck = now.getTime() - site.lastCheck.getTime();
      const intervalMs = site.interval * 60 * 1000;

      if (timeSinceLastCheck >= intervalMs) {
        const checkResult = await this.checkSite(site.url);
        
        if (checkResult.status !== 200) {
          const message = `⚠️ Alert for ${site.url}\nStatus: ${checkResult.status}\n${checkResult.error ? `Error: ${checkResult.error}` : ''}`;
          await this.bot.api.sendMessage(site.chatId, message);
        }

        site.lastCheck = now;
        await site.save();
      }
    }
  }
}