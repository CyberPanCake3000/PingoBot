export interface Site {
  url: string;
  userId: string;
  chatId: string;
  interval: number; 
  lastCheck: Date;
  isActive: boolean;
}

export interface User {
  userId: string;
  chatId: string;
  isActive: boolean;
  dailyStats: 'on' | 'off';
}