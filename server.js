const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB подключён'))
  .catch((err) => console.error('Ошибка подключения MongoDB:', err));

// Схема и модель пользователя
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: String,
  photoUrl: String,
  coins: { type: Number, default: 0 },
  stars: { type: Number, default: 0 },
  referrals: [{ telegramId: String, username: String }],
  platform: String,
  isPremium: Boolean,
  firstLogin: { type: Date, default: Date.now }, // Дата первого входа
  lastLogin: { type: Date, default: Date.now }, // Дата последнего входа
  platforms: { type: [String], default: [] }, // Список используемых платформ
  onlineStatus: { type: String, default: 'offline' }, // Статус онлайн/оффлайн
});

const User = mongoose.model('User', UserSchema);

// Схема и модель инвентаря
const InventorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  coins: { type: Number, default: 0 }, // Монеты за активность
  telegramStars: { type: Number, default: 0 }, // Telegram Stars
});
const Inventory = mongoose.model('Inventory', InventorySchema);

// Схема и модель игры
const GameSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  url: String,
});

const Game = mongoose.model('Game', GameSchema);

// Маршруты для пользователей
app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/user/update', async (req, res) => {
  try {
    const { userId, username, photoUrl, platform, isPremium, coins, stars, referrals, onlineStatus } = req.body;
    const existingUser = await User.findOne({ userId });
    const platforms = existingUser ? [...new Set([...existingUser.platforms, platform])] : [platform];
    
    const user = await User.findOneAndUpdate(
      { userId },
      { 
        username, 
        photoUrl, 
        platform, 
        isPremium, 
        coins, 
        stars, 
        referrals, 
        lastLogin: new Date(),
        platforms,
        onlineStatus,
        ...(existingUser ? {} : { firstLogin: new Date() }), // Устанавливаем firstLogin только при создании
      },
      { upsert: true, new: true }
    );
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Маршруты для инвентаря
app.get('/api/inventory/:userId', async (req, res) => {
  try {
    const inventory = await Inventory.findOne({ userId: req.params.userId });
    if (!inventory) {
      return res.status(404).json({ error: 'Инвентарь не найден' });
    }
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/inventory/update', async (req, res) => {
  try {
    const { userId, coins, telegramStars } = req.body;
    const inventory = await Inventory.findOneAndUpdate(
      { userId },
      { coins, telegramStars },
      { upsert: true, new: true }
    );
    res.json(inventory);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Маршрут для игр
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