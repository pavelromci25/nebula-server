const mongoose = require('mongoose');

const appSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  type: { type: String, enum: ['game', 'app'], required: true },
  name: { type: String, required: true, maxlength: 60 },
  shortDescription: { type: String, required: true, maxlength: 100 },
  category: { type: String, required: true },
  additionalCategories: { type: [String], default: [] },
  icon: { type: String, required: true },
  bannerImages: { type: [String], default: [] },
  clicks: { type: Number, default: 0 },
  telegramStarsDonations: { type: Number, default: 0 },
  votes: { type: Number, default: 0 },
  userRating: { type: Number, default: 0 },
  dateAdded: { type: String, required: true },
  complaints: { type: Number, default: 0 },
  adminId: { type: String, required: true },
  adminEmail: { type: String, required: true },
  isTopInCatalog: { type: Boolean, default: false },
  isTopInCategory: { type: Boolean, default: false },
  isPromotedInCatalog: { type: Boolean, default: false },
  isPromotedInCategory: { type: Boolean, default: false },
  isVip: { type: Boolean, default: false },
});

module.exports = mongoose.model('App', appSchema);