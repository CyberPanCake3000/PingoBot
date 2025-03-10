import { Bot } from 'grammy';
import mongoose from 'mongoose';
import { config } from '../config';
import { MonitorService } from '../services/monitor.service';

const bot = new Bot(config.TELEGRAM_TOKEN);
const monitorService = new MonitorService(bot);

let isConnected = false;
const connectToDatabase = async () => {
  if (isConnected) return;
  
  try {
    await mongoose.connect(config.MONGODB_URI);
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

export default async function handler(req, res) {
  try {
    await connectToDatabase();
    await monitorService.monitorSites();
    res.status(200).send('Sites monitored successfully');
  } catch (error) {
    console.error('Error monitoring sites:', error);
    res.status(500).send('Error monitoring sites');
  }
}