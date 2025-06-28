import { Bot, Context } from 'grammy';
import mongoose from 'mongoose';
import { config } from './config';
import { MonitorService } from './services/monitor.service';
import { SiteModel } from './models/site.model';
import { UserModel } from './models/user.model';
import axios from 'axios';

const bot = new Bot(config.TELEGRAM_TOKEN);
const monitorService = new MonitorService(bot);

async function connectToMongoDB() {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MongoDB URI:', config.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Скрываем пароль
    
    await mongoose.connect(config.MONGODB_URI, {
      maxPoolSize: 10, 
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.error('Error details:', err);
    
    setTimeout(connectToMongoDB, 10000); 
  }
}


mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected. Attempting to reconnect...');
  connectToMongoDB();
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

async function gracefulShutdown(signal: string) {
  console.log(`Received ${signal}. Graceful shutdown...`);
  try {
    await bot.stop();
    await mongoose.connection.close();
    console.log('Bot and database connections closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

function getThreadId(ctx: Context): number | undefined {
  return ctx.message?.message_thread_id || ctx.update?.message?.message_thread_id;
}

function getChatIdentifier(ctx: Context): string {
  const chatId = ctx.chat!.id.toString();
  const threadId = getThreadId(ctx);
  return threadId ? `${chatId}:${threadId}` : chatId;
}

bot.command('start', async (ctx) => {
  const threadId = getThreadId(ctx);
  
  await ctx.reply(
    'Welcome to Website Monitor Bot!\n\n' +
    'Commands:\n' +
    '/add <url> <interval> - Add a website to monitor (interval in minutes, hours or days)\n' +
    '/list - List monitored websites\n' +
    '/remove <url> - Remove a website from monitoring\n' +
    '/ping <url> - Check website status once\n' +
    '/daily on/off - Toggle daily stats, list of all your sites and ip addresses will be displayed daily with statistics' +
    (threadId ? `\n\n🧵 Working in topic thread: ${threadId}` : ''),
    { message_thread_id: threadId }
  );

  if (!ctx.from) {
    return ctx.reply('Error occured, try again later', { message_thread_id: threadId });
  }

  const chatIdentifier = getChatIdentifier(ctx);
  const user = await UserModel.findOne({ 
    userId: ctx.from.id.toString(),
    chatId: chatIdentifier
  });
  
  if (!user) {
    await UserModel.create({
      userId: ctx.from.id.toString(),
      chatId: chatIdentifier,
      threadId: threadId,
      isActive: true,
      dailyStats: 'off',
    });
  }
});

bot.command('daily', async (ctx) => {
  const args = ctx.match?.split(' ');
  const threadId = getThreadId(ctx);

  if (!ctx.from) {
    return ctx.reply('Error occured, try again later', { message_thread_id: threadId });
  }

  if (!args || args.length === 0) {
    return ctx.reply('Usage: /daily on/off', { message_thread_id: threadId });
  }

  let setting = 'off';

  if (args[0] === 'on') {
    setting = 'on';
  }

  const chatIdentifier = getChatIdentifier(ctx);
  const user = await UserModel.findOne({ 
    userId: ctx.from.id.toString(),
    chatId: chatIdentifier
  });
  
  if (!user) {
    await UserModel.create({
      userId: ctx.from.id.toString(),
      chatId: chatIdentifier,
      threadId: threadId,
      isActive: true,
      dailyStats: setting,
    });
  } else {
    await UserModel.updateOne(
      { userId: ctx.from.id.toString(), chatId: chatIdentifier }, 
      { dailyStats: setting }
    );
  }

  ctx.reply(`Daily stats are now ${setting}`, { message_thread_id: threadId });
});

function parseInterval(value: string): { minutes: number; error?: string } {
  const num = parseFloat(value);
  const unit = value.toLowerCase().replace(/[0-9.]/g, '').trim();

  switch (unit) {
    case 'm':
    case 'min':
    case 'mins':
    case 'minute':
    case 'minutes':
      if (num < 5 || num > 60) {
        return { minutes: 0, error: 'Minutes should be between 5 and 60' };
      }
      return { minutes: num };

    case 'h':
    case 'hr':
    case 'hrs':
    case 'hour':
    case 'hours':
      if (num < 1 || num > 24) {
        return { minutes: 0, error: 'Hours should be between 1 and 24' };
      }
      return { minutes: num * 60 };

    case 'd':
    case 'day':
    case 'days':
      if (num < 1 || num > 7) {
        return { minutes: 0, error: 'Days should be between 1 and 7' };
      }
      return { minutes: num * 24 * 60 };

    default:
      if (num < 5 || num > 60) {
        return { minutes: 0, error: 'Minutes should be between 5 and 60' };
      }
      return { minutes: num };
  }
}

async function formatUrl(url: string): Promise<string> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  try {
    const httpsUrl = `https://${url}`;
    await axios.get(httpsUrl, {
      timeout: 5000,
      validateStatus: () => true
    });
    return httpsUrl;
  } catch (error) {
    console.log(error);
    try {
      const httpUrl = `http://${url}`;
      await axios.get(httpUrl, {
        timeout: 5000,
        validateStatus: () => true
      });
      return httpUrl;
    } catch (error) {
      console.log(error);
      return `https://${url}`;
    }
  }
}

bot.command('add', async (ctx) => {
  const threadId = getThreadId(ctx);
  
  if (!ctx.from) {
    await ctx.reply("Error occured", { message_thread_id: threadId });
    return;
  }
  
  const args = ctx.match?.split(' ');
  if (!args || args.length < 2) {
    return ctx.reply(
      'Usage: /add <domain> <interval>\n\n' +
      'Examples:\n' +
      '- /add example.com 30m\n' +
      '- /add example.com 2h\n' +
      '- /add example.com 3d\n\n' +
      'Intervals:\n' +
      '- Minutes (m): 5-60\n' +
      '- Hours (h): 1-24\n' +
      '- Days (d): 1-7',
      { message_thread_id: threadId }
    );
  }

  const formattedUrl = await formatUrl(args[0]);
  const intervalResult = parseInterval(args[1]);

  if (intervalResult.error) {
    return ctx.reply(`Error: ${intervalResult.error}`, { message_thread_id: threadId });
  }

  try {
    const chatIdentifier = getChatIdentifier(ctx);
    
    await SiteModel.create({
      url: formattedUrl,
      userId: ctx.from.id.toString(),
      chatId: chatIdentifier,
      threadId: threadId,
      interval: intervalResult.minutes,
    });

    const intervalText = intervalResult.minutes >= 1440
      ? `${intervalResult.minutes / 1440} days`
      : intervalResult.minutes >= 60
        ? `${intervalResult.minutes / 60} hours`
        : `${intervalResult.minutes} minutes`;

    await ctx.reply(
      `✅ Added ${formattedUrl} to monitoring\n` +
      `⏰ Check interval: ${intervalText}`,
      { message_thread_id: threadId }
    );
  } catch (error) {
    console.log(error);
    await ctx.reply('❌ Error adding site to monitoring', { message_thread_id: threadId });
  }
});

bot.command('list', async (ctx) => {
  const threadId = getThreadId(ctx);
  const chatIdentifier = getChatIdentifier(ctx);
  
  const sites = await SiteModel.find({
    chatId: chatIdentifier,
    isActive: true,
  });

  if (sites.length === 0) {
    return ctx.reply('No sites are being monitored', { message_thread_id: threadId });
  }

  const sitesList = sites
    .map(site => `${site.url} (every ${site.interval} minutes)`)
    .join('\n');

  await ctx.reply(`Monitored sites:\n${sitesList}`, { message_thread_id: threadId });
});

bot.command('remove', async (ctx) => {
  const threadId = getThreadId(ctx);
  const url = await formatUrl(ctx.match || '');
  
  if (!url || !ctx.match) {
    return ctx.reply('Usage: /remove <url>', { message_thread_id: threadId });
  }

  try {
    const chatIdentifier = getChatIdentifier(ctx);
    
    await SiteModel.updateOne(
      { url, chatId: chatIdentifier },
      { isActive: false }
    );
    await ctx.reply(`Removed ${url} from monitoring`, { message_thread_id: threadId });
  } catch (error) {
    console.log(error);
    await ctx.reply('Error removing site from monitoring', { message_thread_id: threadId });
  }
});

bot.command('ping', async (ctx) => {
  const threadId = getThreadId(ctx);
  const arg = ctx.match;
  
  if (!arg) {
    return ctx.reply('Usage: /ping <url>', { message_thread_id: threadId });
  }

  if (arg === 'all') {
    const chatIdentifier = getChatIdentifier(ctx);
    const sites = await SiteModel.find({
      chatId: chatIdentifier,
      isActive: true,
    });
    
    let message = '';
    for (const site of sites) {
      const result = await monitorService.checkSite(site.url);
      const line = `Status for ${site.url}:\nStatus: ${result.status}\n${result.error ? `Error: ${result.error}` : ''}`;
      message += line + '\n';
    }
    await ctx.reply(message, { message_thread_id: threadId });
    return;
  }

  try {
    const result = await monitorService.checkSite(arg);
    const message = `Status for ${arg}:\nStatus: ${result.status}\n${result.error ? `Error: ${result.error}` : ''}`;
    await ctx.reply(message, { message_thread_id: threadId });
  } catch (error) {
    console.log(error);
    await ctx.reply('Error checking site', { message_thread_id: threadId });
  }
});

// Функция для запуска мониторинга
async function startMonitoring() {
  console.log('Monitoring started');

  const monitoringInterval = setInterval(() => {
    monitorService.monitorSites().catch((error) => {
      console.error('Monitoring error:', error);
    });
  }, 60000);

  const cleanup = () => {
    clearInterval(monitoringInterval);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return cleanup;
}

async function main() {
  try {
    console.log('Starting bot...');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Process ID:', process.pid);
    
    if (!config.TELEGRAM_TOKEN) {
      throw new Error('TELEGRAM_TOKEN is not set!');
    }
    
    try {
      const testBot = new Bot(config.TELEGRAM_TOKEN);
      const me = await testBot.api.getMe();
      console.log('Bot info:', me);
    } catch (error) {
      console.error('Cannot connect to Telegram:', error);
      throw error;
    }
    
    await connectToMongoDB();
    
    await bot.start({
      onStart: (botInfo) => {
        console.log(`Bot @${botInfo.username} started successfully`);
      },
    });
    
    console.log('Bot started successfully');
    
    await startMonitoring();
    
    console.log('Bot is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    console.error('Failed to start bot:', error);
    
    if (error instanceof Error && error.message.includes('409')) {
      console.log('Another instance is running. Waiting 30 seconds...');
      setTimeout(() => {
        process.exit(1);
      }, 30000);
    } else {
      process.exit(1);
    }
  }
}


if (require.main === module) {
  main();
}

export { main };