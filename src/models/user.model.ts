import mongoose, { Schema, Document } from 'mongoose';

interface User {
  userId: string;
  chatId: string;
  threadId?: number;
  isActive: boolean;
  dailyStats: 'on' | 'off';
}

interface UserDocument extends User, Document {}

const userSchema = new Schema({
  userId: { type: String, required: true },
  chatId: { type: String, required: true },
  threadId: { type: Number, required: false },
  isActive: { type: Boolean, default: true },
  dailyStats: { type: String, enum: ['on', 'off'], default: 'off' }
}, {
  timestamps: true
});

// Создаем составной индекс для быстрого поиска пользователей
userSchema.index({ userId: 1, chatId: 1 }, { unique: true });
userSchema.index({ dailyStats: 1, isActive: 1 });

export const UserModel = mongoose.model<UserDocument>('User', userSchema);