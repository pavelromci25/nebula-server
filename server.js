const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const App = require('./models/App');
const User = require('./models/User');
const Inventory = require('./models/Inventory');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB подключён'))
  .catch(err => console.error('Ошибка подключения MongoDB:', err));

// Инициализация Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

const PORT = process.env.PORT || 10000;

// Эндпоинты для приложений
app.get('/api/apps', async (req, res) => {
  try {
    const apps = await App.find();
    const transformedApps = apps.map(app => ({
      ...app._doc,
      banner: app.bannerImages && app.bannerImages.length > 0 ? app.bannerImages[0] : '',
      categories: [app.category, ...(app.additionalCategories || [])],
      rating: app.userRating,
      telegramStars: app.telegramStarsDonations,
      opens: app.clicks,
    }));
    res.json(transformedApps);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении приложений' });
  }
});

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

app.post('/api/apps/:id/complain', async (req, res) => {
  try {
    const { id } = req.params;
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.complaints += 1;
    if (app.complaints >= 10) {
      app.status = 'onModeration';
    }
    await app.save();
    res.json(app);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при добавлении жалобы' });
  }
});

// Эндпоинт для создания инвойса на Telegram Stars
app.post('/api/apps/:id/donate', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, stars } = req.body;

    // Проверяем приложение
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    // Ограничение на количество Stars (максимум 10 за раз)
    if (stars > 10) {
      return res.status(400).json({ error: 'Максимум 10 Stars за один раз' });
    }

    // Создаём инвойс
    const invoice = await bot.createInvoiceLink({
      title: `Донат для ${app.name}`,
      description: `Поддержите приложение ${app.name} с помощью ${stars} Telegram Stars!`,
      payload: JSON.stringify({ appId: id, userId, stars }),
      provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
      currency: 'XTR', // Telegram Stars
      prices: [{ label: 'Telegram Stars', amount: stars }],
    });

    res.json({ invoiceLink: invoice });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при создании инвойса' });
  }
});

// Обработка успешного платежа
bot.on('pre_checkout_query', async (query) => {
  try {
    await bot.answerPreCheckoutQuery(query.id, true);
  } catch (error) {
    console.error('Ошибка при обработке pre_checkout_query:', error);
  }
});

bot.on('successful_payment', async (msg) => {
  try {
    const payment = msg.successful_payment;
    const payload = JSON.parse(payment.invoice_payload);
    const { appId, userId, stars } = payload;

    // Обновляем Telegram Stars приложения
    const app = await App.findOne({ id: appId });
    if (app) {
      app.telegramStarsDonations = (app.telegramStarsDonations || 0) + stars;
      await app.save();
    }

    // Отправляем сообщение пользователю
    await bot.sendMessage(userId, `Спасибо за ваш донат в ${stars} Telegram Stars для приложения ${app.name}!`);
  } catch (error) {
    console.error('Ошибка при обработке успешного платежа:', error);
  }
});

// Эндпоинты для пользователей
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ id });
    if (!user) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении пользователя' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    const newUser = new User(userData);
    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при создании пользователя' });
  }
});

// Эндпоинты для инвентаря
app.get('/api/inventory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const inventory = await Inventory.findOne({ userId });
    if (!inventory) {
      return res.status(404).json({ error: 'Инвентарь не найден' });
    }
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при получении инвентаря' });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const inventoryData = req.body;
    const newInventory = new Inventory(inventoryData);
    await newInventory.save();
    res.status(201).json(newInventory);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при создании инвентаря' });
  }
});

app.patch('/api/inventory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    const inventory = await Inventory.findOneAndUpdate({ userId }, updates, { new: true });
    if (!inventory) {
      return res.status(404).json({ error: 'Инвентарь не найден' });
    }
    res.json(inventory);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка при обновлении инвентаря' });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});