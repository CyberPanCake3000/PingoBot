import dotenv from 'dotenv';
dotenv.config();

export const config = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '',
  MONGODB_URI: process.env.MONGODB_URI || '',
};