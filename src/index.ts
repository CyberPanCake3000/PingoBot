import { Bot } from 'grammy';
import mongoose from 'mongoose';
import { config } from './config';
import { MonitorService } from './services/monitor.service';
import { SiteModel } from './models/site.model';
import { UserModel } from './models/user.model';
import axios from 'axios';

const bot = new Bot(config.TELEGRAM_TOKEN);
const monitorService = new MonitorService(bot);

// Улучшенное подключение к MongoDB с обработкой переподключений
async function connectToMongoDB() {
  try {
    await mongoose.connect(config.MONGODB_URI, {
      maxPoolSize: 10, 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    setTimeout(connectToMongoDB, 5000);
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

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Graceful shutdown...');
  try {
    await bot.stop();
    await mongoose.connection.close();
    console.log('Bot and database connections closed.');
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Graceful shutdown...');
  try {
    await bot.stop();
    await mongoose.connection.close();
    console.log('Bot and database connections closed.');
  } catch (err) {
    console.error('Error during shutdown:', err);
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

bot.command('start', async (ctx) => {
  await ctx.reply(
    'Welcome to Website Monitor Bot!\n\n' +
    'Commands:\n' +
    '/add <url> <interval> - Add a website to monitor (interval in minutes, hours or days)\n' +
    '/list - List monitored websites\n' +
    '/remove <url> - Remove a website from monitoring\n' +
    '/ping <url> - Check website status once\n' +
    '/daily on/off - Toggle daily stats, list of all your sites and ip addresses will be displayed daily with statistics'
  );

  if (!ctx.from) {
    return ctx.reply('Error occured, try again later');
  }

  const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
  if (!user) {
    await UserModel.create({
      userId: ctx.from.id.toString(),
      chatId: ctx.chat.id.toString(),
      isActive: true,
      dailyStats: 'off',
    });
  }
});

bot.command('daily', async (ctx) => {
  const args = ctx.match?.split(' ');

  if (!ctx.from) {
    return ctx.reply('Error occured, try again later');
  }

  if (!args || args.length === 0) {
    return ctx.reply('Usage: /daily on/off');
  }

  let setting = 'off';

  if (args[0] === 'on') {
    setting = 'on';
  }

  const user = await UserModel.findOne({ userId: ctx.from.id.toString() });
  if (!user) {
    await UserModel.create({
      userId: ctx.from.id.toString(),
      chatId: ctx.chat.id.toString(),
      isActive: true,
      dailyStats: setting,
    });
  }

  await UserModel.updateOne({ userId: ctx.from.id.toString() }, { dailyStats: setting });

  ctx.reply(`Daily stats are now ${setting}`);
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
  if (!ctx.from) {
    await ctx.reply("Error occured");
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
      '- Days (d): 1-7'
    );
  }

  const formattedUrl = await formatUrl(args[0]);
  const intervalResult = parseInterval(args[1]);

  if (intervalResult.error) {
    return ctx.reply(`Error: ${intervalResult.error}`);
  }

  try {
    await SiteModel.create({
      url: formattedUrl,
      userId: ctx.from.id.toString(),
      chatId: ctx.chat.id.toString(),
      interval: intervalResult.minutes,
    });

    const intervalText = intervalResult.minutes >= 1440
      ? `${intervalResult.minutes / 1440} days`
      : intervalResult.minutes >= 60
        ? `${intervalResult.minutes / 60} hours`
        : `${intervalResult.minutes} minutes`;

    await ctx.reply(
      `✅ Added ${formattedUrl} to monitoring\n` +
      `⏰ Check interval: ${intervalText}`
    );
  } catch (error) {
    console.log(error);
    await ctx.reply('❌ Error adding site to monitoring');
  }
});

bot.command('list', async (ctx) => {
  const sites = await SiteModel.find({
    chatId: ctx.chat.id.toString(),
    isActive: true,
  });

  if (sites.length === 0) {
    return ctx.reply('No sites are being monitored');
  }

  const sitesList = sites
    .map(site => `${site.url} (every ${site.interval} minutes)`)
    .join('\n');

  await ctx.reply(`Monitored sites:\n${sitesList}`);
});

bot.command('remove', async (ctx) => {
  const url = await formatUrl(ctx.match || '');
  if (!url || !ctx.match) {
    return ctx.reply('Usage: /remove <url>');
  }

  try {
    await SiteModel.updateOne(
      { url, chatId: ctx.chat.id.toString() },
      { isActive: false }
    );
    await ctx.reply(`Removed ${url} from monitoring`);
  } catch (error) {
    console.log(error);
    await ctx.reply('Error removing site from monitoring');
  }
});

bot.command('ping', async (ctx) => {
  const arg = ctx.match;
  if (!arg) {
    return ctx.reply('Usage: /ping <url>');
  }

  if (arg === 'all') {
    const sites = await SiteModel.find({
      chatId: ctx.chat.id.toString(),
      isActive: true,
    });
    let message = '';
    for (const site of sites) {
      const result = await monitorService.checkSite(site.url);
      const line = `Status for ${site.url}:\nStatus: ${result.status}\n${result.error ? `Error: ${result.error}` : ''}`;
      message += line + '\n';
    }
    await ctx.reply(message);
    return;
  }

  try {
    const result = await monitorService.checkSite(arg);
    const message = `Status for ${arg}:\nStatus: ${result.status}\n${result.error ? `Error: ${result.error}` : ''}`;
    await ctx.reply(message);
  } catch (error) {
    console.log(error);
    await ctx.reply('Error checking site');
  }
});

// Функция для запуска мониторинга
function startMonitoring() {
  const monitoringInterval = setInterval(() => {
    monitorService.monitorSites().catch((error) => {
      console.error('Monitoring error:', error);
    });
  }, 60000);

  // Сохраняем ссылку на интервал для graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(monitoringInterval);
  });

  process.on('SIGTERM', () => {
    clearInterval(monitoringInterval);
  });

  console.log('Monitoring started');
}

// Основная функция запуска
async function main() {
  try {
    console.log('Starting bot...');
    
    // Подключаемся к MongoDB
    await connectToMongoDB();
    
    // Запускаем бота
    await bot.start();
    console.log('Bot started successfully');
    
    // Запускаем мониторинг
    startMonitoring();
    
    // Добавляем обработчик для предотвращения закрытия процесса
    console.log('Bot is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Запускаем приложение
main();