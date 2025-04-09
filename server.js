// ============================================================================
// БЛОК 1: ИНИЦИАЛИЗАЦИЯ И ПОДКЛЮЧЕНИЯ
// ============================================================================

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const App = require('./models/App');
const User = require('./models/User');
const Inventory = require('./models/Inventory');
const Developer = require('./models/Developer');

// Загружаем переменные окружения из .env
dotenv.config();

// Инициализация приложения Express
const app = express();
app.use(cors());
app.use(express.json());

// Подключение к MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB подключён'))
  .catch(err => console.error('Ошибка подключения MongoDB:', err));

// Инициализация ботов Telegram
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const developerBot = new TelegramBot(process.env.DEVELOPER_BOT_TOKEN, { polling: false });

// Проверка токена для adminBot
if (!process.env.ADMIN_BOT_TOKEN) {
  console.error('Ошибка: ADMIN_BOT_TOKEN не предоставлен в переменных окружения');
  process.exit(1);
}
const adminBot = new TelegramBot(process.env.ADMIN_BOT_TOKEN, { polling: false });

// Общие константы
const PORT = process.env.PORT || 10000;
const allowedDeveloperIds = ['6567771093'];
const allowedAdminIds = ['6567771093'];
const adminId = '6567771093';

// Общие утилиты
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

// Функции проверки доступа
const checkDeveloperAccess = (userId) => {
  return allowedDeveloperIds.includes(userId);
};

const checkAdminAccess = (userId) => {
  if (!userId || typeof userId !== 'string') {
    console.log('checkAdminAccess: Invalid userId:', userId);
    return false;
  }
  console.log('checkAdminAccess: Checking userId:', userId);
  return allowedAdminIds.includes(userId);
};

// ============================================================================
// БЛОК 2: ДЛЯ КАТАЛОГА (nebula-frontend)
// ============================================================================

// Эндпоинты для каталога приложений
app.get('/api/apps', async (req, res) => {
  try {
    const apps = await App.find({ status: 'added' });
    const transformedApps = apps.map(app => ({
      ...app._doc,
      banner: app.bannerImages && app.bannerImages.length > 0 ? app.bannerImages[0] : '',
      categories: [app.category, ...(app.additionalCategories || [])],
      rating: app.userRating,
      stars: app.stars || 0,
      telegramStars: app.telegramStarsDonations,
      opens: app.clicks,
      clicks: app.clicks, // Добавляем clicks
      isPromotedInCatalog: app.isPromotedInCatalog, // Добавляем isPromotedInCatalog
      dateAdded: app.dateAdded, // Добавляем dateAdded
    }));
    res.json(transformedApps);
  } catch (error) {
    console.error('Ошибка при получении приложений:', error);
    res.status(500).json({ error: 'Ошибка при получении приложений: ' + error.message });
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

    // Обновляем внутренние stars вместо telegramStars
    app.stars = (app.stars || 0) + stars;
    await app.save();

    // Обновляем баланс разработчика
    const developer = await Developer.findOne({ userId: app.developerId });
    if (developer) {
      developer.starsBalance = (developer.starsBalance || 0) + stars; // Используем starsBalance
      await developer.save();
    }

    // Обновляем инвентарь пользователя (вычитаем stars)
    const inventory = await Inventory.findOne({ userId });
    if (!inventory) {
      return res.status(404).json({ error: 'Инвентарь пользователя не найден' });
    }
    if ((inventory.stars || 0) < stars) {
      return res.status(400).json({ error: 'Недостаточно Stars для доната' });
    }
    inventory.stars = (inventory.stars || 0) - stars;
    await inventory.save();

    res.json({ message: `Донат ${stars} Stars успешно отправлен!` });
  } catch (error) {
    console.error('Ошибка при создании доната:', error);
    res.status(500).json({ error: 'Ошибка при создании доната: ' + error.message });
  }
});

// Обработчики Telegram-бота для каталога
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

// Эндпоинты для пользователей каталога
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('GET /api/users/:userId - Searching for userId:', userId);
    const user = await User.findOne({ userId });
    if (!user) {
      console.log('GET /api/users/:userId - User not found for userId:', userId);
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    console.log('GET /api/users/:userId - Found user:', user);
    res.json(user);
  } catch (error) {
    console.error('Ошибка при получении пользователя:', error);
    res.status(500).json({ error: 'Ошибка при получении пользователя: ' + error.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    const { userId } = userData;

    console.log('POST /api/users - Received userData:', userData);

    const existingUser = await User.findOne({ userId });
    if (existingUser) {
      console.log('POST /api/users - User already exists:', existingUser);
      return res.status(200).json(existingUser);
    }

    const newUser = new User(userData);
    await newUser.save();
    console.log('POST /api/users - Created new user:', newUser);
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Ошибка при создании пользователя:', error);
    res.status(500).json({ error: 'Ошибка при создании пользователя: ' + error.message });
  }
});

// Эндпоинты для инвентаря пользователей каталога
app.get('/api/inventory/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('GET /api/inventory/:userId - Searching for userId:', userId);
    const inventory = await Inventory.findOne({ userId });
    if (!inventory) {
      console.log('GET /api/inventory/:userId - Inventory not found for userId:', userId);
      return res.status(404).json({ error: 'Инвентарь не найден' });
    }
    console.log('GET /api/inventory/:userId - Found inventory:', inventory);
    res.json(inventory);
  } catch (error) {
    console.error('Ошибка при получении инвентаря:', error);
    res.status(500).json({ error: 'Ошибка при получении инвентаря: ' + error.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const inventoryData = req.body;
    console.log('POST /api/inventory - Received inventoryData:', inventoryData);
    const newInventory = new Inventory(inventoryData);
    await newInventory.save();
    console.log('POST /api/inventory - Created new inventory:', newInventory);
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
    console.log('PATCH /api/inventory/:userId - Updating for userId:', userId, 'with updates:', updates);
    const inventory = await Inventory.findOneAndUpdate({ userId }, updates, { new: true });
    if (!inventory) {
      console.log('PATCH /api/inventory/:userId - Inventory not found for userId:', userId);
      return res.status(404).json({ error: 'Инвентарь не найден' });
    }
    console.log('PATCH /api/inventory/:userId - Updated inventory:', inventory);
    res.json(inventory);
  } catch (error) {
    console.error('Ошибка при обновлении инвентаря:', error);
    res.status(500).json({ error: 'Ошибка при обновлении инвентаря: ' + error.message });
  }
});

app.post('/api/apps/:id/click', async (req, res) => {
  try {
    const { id } = req.params;
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.clicks = (app.clicks || 0) + 1;
    await app.save();
    res.json({ message: 'Счётчик кликов увеличен' });
  } catch (error) {
    console.error('Ошибка при увеличении счётчика кликов:', error);
    res.status(500).json({ error: 'Ошибка при увеличении счётчика кликов: ' + error.message });
  }
});

// ============================================================================
// БЛОК 3: ДЛЯ РАЗРАБОТЧИКОВ (nebula-developer-frontend)
// ============================================================================

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

    const existingApp = await App.findOne({ name: appData.name, developerId: userId });
    if (existingApp) {
      return res.status(400).json({ error: 'Приложение с таким названием уже существует для этого разработчика' });
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
      dateAdded: appData.dateAdded || new Date().toISOString(),
    });
    await newApp.save();
    developer.apps.push(newApp._id);
    await developer.save();

    try {
      const message = `Новое приложение добавлено для модерации!\n` +
                      `Разработчик: ${userId}\n` +
                      `Название: ${newApp.name}\n` +
                      `Тип: ${newApp.type}\n` +
                      `Категория: ${newApp.category}\n` +
                      `ID приложения: ${newApp.id}`;
      await adminBot.sendMessage(adminId, message);
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
    }

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

// ============================================================================
// БЛОК 4: ДЛЯ АДМИНИСТРАЦИИ (nebula-admin-frontend)
// ============================================================================

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
    const userId = req.query.userId;
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
    const userId = req.query.userId;
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

// ============================================================================
// БЛОК 5: ЗАПУСК СЕРВЕРА
// ============================================================================

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});