const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  photoUrl: { type: String, default: '' },
  referrals: [{ telegramId: String, username: String }],
  firstLogin: { type: String, required: true },
  lastLogin: { type: String, required: true },
  platforms: { type: [String], default: [] },
  onlineStatus: { type: String, default: 'offline' },
  loginCount: { type: Number, default: 1 },
});

module.exports = mongoose.model('User', userSchema);