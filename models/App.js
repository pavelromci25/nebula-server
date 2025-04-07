const mongoose = require('mongoose');

const appSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['game', 'app'], required: true },
  name: { type: String, required: true },
  shortDescription: { type: String, required: true, maxlength: 100 },
  longDescription: { type: String },
  category: { type: String, required: true },
  additionalCategories: { type: [String], default: [] },
  icon: { type: String, required: true },
  banner: { type: String },
  gallery: { type: [String], default: [] },
  video: { type: String },
  developerId: { type: String, required: true },
  platforms: { type: [String], default: [] },
  ageRating: { type: String, required: true },
  inAppPurchases: { type: Boolean, default: false },
  supportsTON: { type: Boolean, default: false },
  supportsTelegramStars: { type: Boolean, default: false },
  contactInfo: { type: String, required: true },
  status: { type: String, enum: ['added', 'onModeration', 'rejected'], default: 'onModeration' },
  rejectionReason: { type: String },
  clicks: { type: Number, default: 0 },
  telegramStarsDonations: { type: Number, default: 0 },
  votes: { type: Number, default: 0 },
  userRating: { type: Number, default: 0 },
  complaints: { type: Number, default: 0 },
  promotion: {
    catalog: { active: { type: Boolean, default: false }, endDate: { type: String } },
    category: { active: { type: Boolean, default: false }, endDate: { type: String } },
  },
  isPromotedInCatalog: { type: Boolean, default: false },
  isPromotedInCategory: { type: Boolean, default: false },
  adminEmail: { type: String, default: '' }, // Убрали required: true
  adminId: { type: String, default: '' },    // Убрали required: true
  dateAdded: { type: String, default: new Date().toISOString() }, // Убрали required: true и добавили значение по умолчанию
});

module.exports = mongoose.model('App', appSchema);