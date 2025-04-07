const mongoose = require('mongoose');

const developerSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  registrationDate: { type: String, required: true },
  telegramStarsBalance: { type: Number, default: 0 },
  referralCode: { type: String, required: true, unique: true },
  apps: [{ type: mongoose.Schema.Types.ObjectId, ref: 'App' }],
});

module.exports = mongoose.model('Developer', developerSchema);