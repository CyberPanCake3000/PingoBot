export interface Site {
  url: string;
  userId: string;
  chatId: string;
  interval: number; 
  lastCheck: Date;
  isActive: boolean;
}