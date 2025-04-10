const mongoose = require('mongoose');

const allowedDeveloperSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  addedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('AllowedDeveloper', allowedDeveloperSchema);