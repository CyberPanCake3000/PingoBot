import mongoose, { Schema, Document } from 'mongoose';
import { Site } from '../types';

interface SiteDocument extends Site, Document {}

const siteSchema = new Schema({
  url: { type: String, required: true },
  userId: { type: String, required: true },
  chatId: { type: String, required: true }, 
  threadId: { type: Number, required: false }, 
  interval: { type: Number, required: true, default: 60 },
  lastCheck: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true 
});


siteSchema.index({ chatId: 1, isActive: 1 });
siteSchema.index({ userId: 1, isActive: 1 });
siteSchema.index({ isActive: 1, lastCheck: 1 });

export const SiteModel = mongoose.model<SiteDocument>('Site', siteSchema);