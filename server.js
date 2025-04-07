const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const App = require('./models/App');
const User = require('./models/User');
const Inventory = require('./models/Inventory');
const Developer = require('./models/Developer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB подключён'))
  .catch(err => console.error('Ошибка подключения MongoDB:', err));

// Инициализация ботов
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const developerBot = new TelegramBot(process.env.DEVELOPER_BOT_TOKEN, { polling: false });
const adminBot = new TelegramBot(process.env.ADMIN_BOT_TOKEN, { polling: false });

// Список разрешённых userId для разработчиков
const allowedDeveloperIds = ['6567771093'];

// Список разрешённых userId для администраторов
const allowedAdminIds = ['6567771093'];

// ID администратора, который будет получать уведомления
const adminId = '6567771093';

const PORT = process.env.PORT || 10000;

// Генерация реферального кода
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Проверка доступа для разработчиков
const checkDeveloperAccess = (userId) => {
  return allowedDeveloperIds.includes(userId);
};

// Проверка доступа для администраторов
const checkAdminAccess = (userId) => {
  if (!userId || typeof userId !== 'string') {
    console.log('checkAdminAccess: Invalid userId:', userId);
    return false;
  }
  console.log('checkAdminAccess: Checking userId:', userId);
  return allowedAdminIds.includes(userId);
};

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
    console.error('Ошибка при получении приложений:', error);
    res.status(500).json({ error: 'Ошибка при получении приложений: ' + error.message });
  }
});

app.post('/api/apps', async (req, res) => {
  try {
    const appData = req.body;
    const newApp = new App(appData);
    await newApp.save();
    res.status(201).json(newApp);
  } catch (error) {
    console.error('Ошибка при добавлении приложения:', error);
    res.status(500).json({ error: 'Ошибка при добавлении приложения: ' + error.message });
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
    console.error('Ошибка при добавлении рейтинга:', error);
    res.status(500).json({ error: 'Ошибка при добавлении рейтинга: ' + error.message });
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
    console.error('Ошибка при добавлении жалобы:', error);
    res.status(500).json({ error: 'Ошибка при добавлении жалобы: ' + error.message });
  }
});

app.post('/api/apps/:id/donate', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, stars } = req.body;

    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    if (stars > 10) {
      return res.status(400).json({ error: 'Максимум 10 Stars за один раз' });
    }

    const invoice = await bot.createInvoiceLink({
      title: `Донат для ${app.name}`,
      description: `Поддержите приложение ${app.name} с помощью ${stars} Telegram Stars!`,
      payload: JSON.stringify({ appId: id, userId, stars }),
      provider_token: process.env.PAYMENT_PROVIDER_TOKEN,
      currency: 'XTR',
      prices: [{ label: 'Telegram Stars', amount: stars }],
    });

    res.json({ invoiceLink: invoice });
  } catch (error) {
    console.error('Ошибка при создании инвойса:', error);
    res.status(500).json({ error: 'Ошибка при создании инвойса: ' + error.message });
  }
});

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

    const app = await App.findOne({ id: appId });
    if (app) {
      app.telegramStarsDonations = (app.telegramStarsDonations || 0) + stars;
      await app.save();
    }

    const developer = await Developer.findOne({ userId: app.developerId });
    if (developer) {
      developer.telegramStarsBalance = (developer.telegramStarsBalance || 0) + stars;
      await developer.save();
    }

    await bot.sendMessage(userId, `Спасибо за ваш донат в ${stars} Telegram Stars для приложения ${app.name}!`);
  } catch (error) {
    console.error('Ошибка при обработке успешного платежа:', error);
  }
});

// Эндпоинты для разработчиков
app.get('/api/developer/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!checkDeveloperAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    let developer = await Developer.findOne({ userId });
    if (!developer) {
      developer = new Developer({
        userId,
        registrationDate: new Date().toISOString(),
        referralCode: generateReferralCode(),
      });
      await developer.save();
    }
    const apps = await App.find({ developerId: userId });
    developer.apps = apps.map(app => app._id);
    await developer.save();
    res.json({ ...developer._doc, apps });
  } catch (error) {
    console.error('Ошибка при получении данных разработчика:', error);
    res.status(500).json({ error: 'Ошибка при получении данных разработчика: ' + error.message });
  }
});

app.post('/api/developer/:userId/apps', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!checkDeveloperAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const developer = await Developer.findOne({ userId });
    if (!developer) {
      return res.status(404).json({ error: 'Разработчик не найден' });
    }

    const appData = req.body;
    console.log('Received appData:', appData);

    // Валидация данных
    if (!appData.type || !['game', 'app'].includes(appData.type)) {
      return res.status(400).json({ error: 'Тип приложения должен быть "game" или "app"' });
    }
    if (!appData.name || typeof appData.name !== 'string' || appData.name.trim() === '') {
      return res.status(400).json({ error: 'Название приложения обязательно' });
    }
    if (!appData.shortDescription || typeof appData.shortDescription !== 'string' || appData.shortDescription.trim() === '') {
      return res.status(400).json({ error: 'Короткое описание обязательно' });
    }
    if (appData.shortDescription.length > 100) {
      return res.status(400).json({ error: 'Короткое описание не должно превышать 100 символов' });
    }
    if (!appData.category || typeof appData.category !== 'string' || appData.category.trim() === '') {
      return res.status(400).json({ error: 'Основная категория обязательна' });
    }
    if (!appData.icon || typeof appData.icon !== 'string' || appData.icon.trim() === '') {
      return res.status(400).json({ error: 'URL аватарки обязателен' });
    }
    if (!appData.ageRating || typeof appData.ageRating !== 'string' || appData.ageRating.trim() === '') {
      return res.status(400).json({ error: 'Возрастной рейтинг обязателен' });
    }
    if (!appData.contactInfo || typeof appData.contactInfo !== 'string' || appData.contactInfo.trim() === '') {
      return res.status(400).json({ error: 'Контакты для связи обязательны' });
    }

    const newApp = new App({
      ...appData,
      id: Date.now().toString(),
      developerId: userId,
      status: 'onModeration',
      clicks: 0,
      telegramStarsDonations: 0,
      votes: 0,
      userRating: 0,
      complaints: 0,
      dateAdded: appData.dateAdded || new Date().toISOString(), // Добавляем dateAdded, если его нет
    });
    await newApp.save();
    developer.apps.push(newApp._id);
    await developer.save();

    // Отправляем уведомление администратору
    const message = `Новое приложение добавлено для модерации!\n` +
                    `Разработчик: ${userId}\n` +
                    `Название: ${newApp.name}\n` +
                    `Тип: ${newApp.type}\n` +
                    `Категория: ${newApp.category}\n` +
                    `ID приложения: ${newApp.id}`;
    await adminBot.sendMessage(adminId, message);

    res.status(201).json(newApp);
  } catch (error) {
    console.error('Ошибка при добавлении приложения:', error);
    res.status(500).json({ error: 'Ошибка при добавлении приложения: ' + error.message });
  }
});

app.patch('/api/developer/:userId/apps/:appId', async (req, res) => {
  try {
    const { userId, appId } = req.params;
    if (!checkDeveloperAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const updates = req.body;
    const app = await App.findOneAndUpdate({ id: appId }, updates, { new: true });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    res.json(app);
  } catch (error) {
    console.error('Ошибка при обновлении приложения:', error);
    res.status(500).json({ error: 'Ошибка при обновлении приложения: ' + error.message });
  }
});

app.get('/api/developer/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!checkDeveloperAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const apps = await App.find({ developerId: userId });
    const allApps = await App.find();

    const stats = apps.map(app => {
      const catalogRank = allApps
        .sort((a, b) => {
          const scoreA = (a.rating || 0) * 0.2 + (a.catalogRating || 0) * 0.2 + (a.telegramStarsDonations || 0) * 0.3 + (a.clicks || 0) * 0.0001;
          const scoreB = (b.rating || 0) * 0.2 + (b.catalogRating || 0) * 0.2 + (b.telegramStarsDonations || 0) * 0.3 + (b.clicks || 0) * 0.0001;
          return scoreB - scoreA;
        })
        .findIndex(a => a.id === app.id) + 1;

      const categoryRank = allApps
        .filter(a => a.category === app.category)
        .sort((a, b) => {
          const scoreA = (a.rating || 0) * 0.2 + (a.catalogRating || 0) * 0.2 + (a.telegramStarsDonations || 0) * 0.3 + (a.clicks || 0) * 0.0001;
          const scoreB = (b.rating || 0) * 0.2 + (b.catalogRating || 0) * 0.2 + (b.telegramStarsDonations || 0) * 0.3 + (b.clicks || 0) * 0.0001;
          return scoreB - scoreA;
        })
        .findIndex(a => a.id === app.id) + 1;

      const additionalCategoryRanks = (app.additionalCategories || []).map(cat => {
        return {
          category: cat,
          rank: allApps
            .filter(a => a.additionalCategories && a.additionalCategories.includes(cat))
            .sort((a, b) => {
              const scoreA = (a.rating || 0) * 0.2 + (a.catalogRating || 0) * 0.2 + (a.telegramStarsDonations || 0) * 0.3 + (a.clicks || 0) * 0.0001;
              const scoreB = (b.rating || 0) * 0.2 + (b.catalogRating || 0) * 0.2 + (b.telegramStarsDonations || 0) * 0.3 + (b.clicks || 0) * 0.0001;
              return scoreB - scoreA;
            })
            .findIndex(a => a.id === app.id) + 1,
        };
      });

      return {
        appId: app.id,
        name: app.name,
        clicks: app.clicks || 0,
        telegramStars: app.telegramStarsDonations || 0,
        complaints: app.complaints || 0,
        catalogRank,
        categoryRank,
        additionalCategoryRanks,
        platforms: app.platforms || [],
      };
    });

    res.json(stats);
  } catch (error) {
    console.error('Ошибка при получении статистики:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики: ' + error.message });
  }
});

app.post('/api/developer/:userId/promote', async (req, res) => {
  try {
    const { userId, appId, type, duration } = req.body;
    if (!checkDeveloperAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const developer = await Developer.findOne({ userId });
    if (!developer) {
      return res.status(404).json({ error: 'Разработчик не найден' });
    }

    const app = await App.findOne({ id: appId, developerId: userId });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    const cost = duration === 3 ? 50 : duration === 14 ? 200 : 500;
    if ((developer.telegramStarsBalance || 0) < cost) {
      return res.status(400).json({ error: 'Недостаточно Telegram Stars' });
    }

    developer.telegramStarsBalance -= cost;
    await developer.save();

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);

    if (type === 'catalog') {
      app.promotion.catalog = { active: true, endDate: endDate.toISOString() };
      app.isPromotedInCatalog = true;
    } else if (type === 'category') {
      app.promotion.category = { active: true, endDate: endDate.toISOString() };
      app.isPromotedInCategory = true;
    }

    await app.save();
    res.json({ message: `Продвижение успешно активировано на ${duration} дней` });
  } catch (error) {
    console.error('Ошибка при активации продвижения:', error);
    res.status(500).json({ error: 'Ошибка при активации продвижения: ' + error.message });
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
    console.error('Ошибка при получении пользователя:', error);
    res.status(500).json({ error: 'Ошибка при получении пользователя: ' + error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    const newUser = new User(userData);
    await newUser.save();
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Ошибка при создании пользователя:', error);
    res.status(500).json({ error: 'Ошибка при создании пользователя: ' + error.message });
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
    console.error('Ошибка при получении инвентаря:', error);
    res.status(500).json({ error: 'Ошибка при получении инвентаря: ' + error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const inventoryData = req.body;
    const newInventory = new Inventory(inventoryData);
    await newInventory.save();
    res.status(201).json(newInventory);
  } catch (error) {
    console.error('Ошибка при создании инвентаря:', error);
    res.status(500).json({ error: 'Ошибка при создании инвентаря: ' + error.message });
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
    console.error('Ошибка при обновлении инвентаря:', error);
    res.status(500).json({ error: 'Ошибка при обновлении инвентаря: ' + error.message });
  }
});

// Эндпоинты для администратора
app.get('/api/admin/apps', async (req, res) => {
  try {
    console.log('GET /api/admin/apps - userId:', req.query.userId);
    const userId = req.query.userId;
    if (!checkAdminAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const apps = await App.find();
    res.json(apps);
  } catch (error) {
    console.error('Ошибка при получении приложений для администратора:', error);
    res.status(500).json({ error: 'Ошибка при получении приложений: ' + error.message });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    console.log('GET /api/admin/stats - userId:', req.query.userId);
    const userId = req.query.userId;
    if (!checkAdminAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const apps = await App.find();
    const stats = {
      totalApps: apps.length,
      totalClicks: apps.reduce((sum, app) => sum + (app.clicks || 0), 0),
      totalStars: apps.reduce((sum, app) => sum + (app.telegramStarsDonations || 0), 0),
      totalComplaints: apps.reduce((sum, app) => sum + (app.complaints || 0), 0),
    };
    res.json(stats);
  } catch (error) {
    console.error('Ошибка при получении статистики для администратора:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики: ' + error.message });
  }
});

app.patch('/api/admin/apps/:appId/approve', async (req, res) => {
  try {
    const userId = req.query.userId; // Предполагаем, что userId передаётся как query-параметр
    if (!checkAdminAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { appId } = req.params;
    const app = await App.findOne({ id: appId });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.status = 'added';
    app.rejectionReason = undefined;
    await app.save();
    res.json(app);
  } catch (error) {
    console.error('Ошибка при подтверждении приложения:', error);
    res.status(500).json({ error: 'Ошибка при подтверждении приложения: ' + error.message });
  }
});

app.patch('/api/admin/apps/:appId/reject', async (req, res) => {
  try {
    const userId = req.query.userId; // Предполагаем, что userId передаётся как query-параметр
    if (!checkAdminAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { appId } = req.params;
    const { rejectionReason } = req.body;
    const app = await App.findOne({ id: appId });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.status = 'rejected';
    app.rejectionReason = rejectionReason;
    await app.save();
    res.json(app);
  } catch (error) {
    console.error('Ошибка при отклонении приложения:', error);
    res.status(500).json({ error: 'Ошибка при отклонении приложения: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});