const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors({
  origin: 'https://pavelromci25.github.io',
}));
app.use(express.json());

mongoose.connect('mongodb+srv://pavelromci25:lpUHGXAkgIaAbnnT@nebula.th0fboc.mongodb.net/nebula?retryWrites=true&w=majority')
  .then(() => console.log('MongoDB Atlas подключен'))
  .catch((err) => console.log('Ошибка подключения:', err));

const GameSchema = new mongoose.Schema({
  id: String,
  name: String,
  type: String,
  url: String,
  category: String,
});
const Game = mongoose.model('Game', GameSchema);

const CoinSchema = new mongoose.Schema({
  userId: String,
  coins: Number,
});
const Coin = mongoose.model('Coin', CoinSchema);

app.get('/api/games', async (req, res) => {
  const games = await Game.find();
  res.json(games);
});

async function seedDatabase() {
  await Game.deleteMany({});
  await Game.insertMany([
    { id: '1', name: 'TMA Game', type: 'tma', url: '', category: 'action' },
    { id: '2', name: 'WebView Game', type: 'webview', url: 'https://example.com', category: 'puzzle' },
  ]);
  console.log('Тестовые данные добавлены');
}
seedDatabase();

app.post('/api/coins', async (req, res) => {
  const { userId, coins } = req.body;
  await Coin.updateOne({ userId }, { $inc: { coins } }, { upsert: true });
  res.sendStatus(200);
});

app.get('/api/coins/:userId', async (req, res) => {
  const coins = await Coin.findOne({ userId: req.params.userId });
  res.json({ coins: coins?.coins || 0 });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Сервер запущен на порту ${port}`));