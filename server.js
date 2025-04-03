const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB подключён'))
  .catch((err) => console.error('Ошибка подключения MongoDB:', err));

// Схема пользователя
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: String,
  photoUrl: String,
  platform: String,
  isPremium: Boolean,
  referrals: [{ telegramId: String, username: String }],
  firstLogin: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now },
  platforms: [String],
  onlineStatus: { type: String, default: 'offline' },
  loginCount: { type: Number, default: 0 },
});

const User = mongoose.model('User', UserSchema);

// Схема инвентаря
const InventorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 },
  stars: { type: Number, default: 0 },
  telegramStars: { type: Number, default: 0 },
  lastCoinUpdate: { type: Date, default: Date.now },
});

const Inventory = mongoose.model('Inventory', InventorySchema);

// Схема игры
const GameSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  url: String,
  imageUrl: String,
  description: String,
});

const Game = mongoose.model('Game', GameSchema);

// Маршруты
app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/user/update', async (req, res) => {
  try {
    const { userId, username, photoUrl, platform, isPremium } = req.body;
    const updateData = {};
    if (username !== undefined) updateData.username = username;
    if (photoUrl !== undefined) updateData.photoUrl = photoUrl;
    if (platform !== undefined) {
      updateData.platform = platform;
      updateData.$addToSet = { platforms: platform };
    }
    if (isPremium !== undefined) updateData.isPremium = isPremium;
    updateData.lastLogin = new Date();
    updateData.$inc = { loginCount: 1 };

    const user = await User.findOneAndUpdate(
      { userId },
      updateData,
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/inventory/:userId', async (req, res) => {
  try {
    const inventory = await Inventory.findOne({ userId: req.params.userId });
    if (!inventory) return res.status(404).json({ error: 'Инвентарь не найден' });
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/inventory/update', async (req, res) => {
  try {
    const { userId, coins, stars, telegramStars } = req.body;
    const updateData = {};
    if (coins !== undefined) updateData.coins = coins;
    if (stars !== undefined) updateData.stars = stars;
    if (telegramStars !== undefined) updateData.telegramStars = telegramStars;
    updateData.lastCoinUpdate = new Date();

    const inventory = await Inventory.findOneAndUpdate(
      { userId },
      updateData,
      { upsert: true, new: true }
    );
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/games', async (req, res) => {
  try {
    const games = await Game.find();
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});