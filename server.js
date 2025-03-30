const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Подключение к MongoDB
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
  lastLogin: { type: Date, default: Date.now },
});

const User = mongoose.model('User', UserSchema);

// Схема и модель игры
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
    const { userId, username, photoUrl, coins, stars, referrals, platform, isPremium } = req.body;
    const user = await User.findOneAndUpdate(
      { userId },
      { username, photoUrl, coins, stars, referrals, platform, isPremium, lastLogin: new Date() },
      { upsert: true, new: true }
    );
    res.json(user);
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

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});