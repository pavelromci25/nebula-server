const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const App = require('./models/App');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB подключён'))
  .catch(err => console.error('Ошибка подключения MongoDB:', err));

const PORT = process.env.PORT || 10000;

// Получение всех приложений
app.get('/api/apps', async (req, res) => {
  try {
    const apps = await App.find();
    res.json(apps);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении приложений' });
  }
});

// Добавление приложения
app.post('/api/apps', async (req, res) => {
  try {
    const appData = req.body;
    const newApp = new App(appData);
    await newApp.save();
    res.status(201).json(newApp);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при добавлении приложения' });
  }
});

// Добавление рейтинга
app.post('/api/apps/:id/rate', async (req, res) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.votes += 1;
    app.userRating = ((app.userRating * (app.votes - 1)) + rating) / app.votes;
    await app.save();
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при добавлении рейтинга' });
  }
});

// Добавление жалобы
app.post('/api/apps/:id/complain', async (req, res) => {
  try {
    const { id } = req.params;
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.complaints += 1;
    if (app.complaints >= 10) {
      app.status = 'onModeration'; // Предполагаем поле status
    }
    await app.save();
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при добавлении жалобы' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});