import mongoose, { Schema, Document } from 'mongoose';
import { Site } from '../types';

interface SiteDocument extends Site, Document {}

const siteSchema = new Schema({
  url: { type: String, required: true },
  userId: { type: String, required: true },
  chatId: { type: String, required: true },
  interval: { type: Number, required: true, default: 5 },
  lastCheck: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

export const SiteModel = mongoose.model<SiteDocument>('Site', siteSchema);