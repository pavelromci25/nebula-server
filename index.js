const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

// Подключение к MongoDB Atlas
mongoose.connect('mongodb+srv://pavelromci25:lpUHGXAkgIaAbnnT@nebula.th0fboc.mongodb.net/nebula?retryWrites=true&w=majority')
  .then(() => console.log('MongoDB Atlas подключен'))
  .catch((err) => console.log('Ошибка подключения:', err));

// Модель игры
const GameSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  url: String,
  category: String,
});
const Game = mongoose.model('Game', GameSchema);

// API для получения игр
app.get('/api/games', async (req, res) => {
  const games = await Game.find();
  res.json(games);
});

// Добавление тестовых данных
async function seedDatabase() {
  await Game.deleteMany({});
  await Game.insertMany([
    { id: '1', name: 'TMA Game', type: 'tma', url: '', category: 'action' },
    { id: '2', name: 'WebView Game', type: 'webview', url: 'https://example.com', category: 'puzzle' },
  ]);
  console.log('Тестовые данные добавлены');
}
seedDatabase();

// Запуск сервера
const port = process.env.PORT || 3000; // Для Render.com
app.listen(port, () => console.log(`Сервер запущен на порту ${port}`));