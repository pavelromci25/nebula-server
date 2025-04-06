const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  stars: { type: Number, default: 0 },
  telegramStars: { type: Number, default: 0 },
  lastCoinUpdate: { type: String, required: true },
});

module.exports = mongoose.model('Inventory', inventorySchema);