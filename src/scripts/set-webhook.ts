import axios from 'axios';
import { config } from '../config';

const TELEGRAM_API = `https://api.telegram.org/bot${config.TELEGRAM_TOKEN}`;
const WEBHOOK_URL = process.env.VERCEL_URL || 'https://pingo-bot.vercel.app';

async function setWebhook() {
  try {
    const response = await axios.post(
      `${TELEGRAM_API}/setWebhook`,
      {
        url: `${WEBHOOK_URL}/api/webhook`
      }
    );
    
    console.log('Webhook set result:', response.data);
  } catch (error) {
    console.error('Error setting webhook:', error);
  }
}

setWebhook();