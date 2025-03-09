import mongoose, { Schema, Document } from 'mongoose';
import { User } from '../types';

interface UserDocument extends User, Document {}

export const userSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  chatId: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  dailyStats: { type: String, default: 'off' },
});

export const UserModel = mongoose.model<UserDocument>('User', userSchema);