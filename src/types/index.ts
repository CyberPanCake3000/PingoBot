export interface Site {
  url: string;
  userId: string;
  chatId: string; 
  threadId?: number; 
  interval: number; 
  lastCheck: Date;
  isActive: boolean;
}

export interface User {
  userId: string;
  chatId: string;  
  threadId?: number;
  isActive: boolean;
  dailyStats: 'on' | 'off';
}

export interface MonitorResult {
  status: number;
  error?: string;
}

export interface Config {
  TELEGRAM_TOKEN: string;
  MONGODB_URI: string;
  NODE_ENV?: string;
}