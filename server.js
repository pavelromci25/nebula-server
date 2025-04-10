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
let allowedDeveloperIds = ['6567771093']; // Список разрешённых разработчиков
const allowedAdminIds = ['6567771093'];
const adminId = '6567771093';

// Список категорий
const gameCategories = ['Arcade', 'Sport', 'Card', 'Race'];
const appCategories = ['Useful', 'Business', 'Personal', 'Simple'];

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
      categories: app.type === 'game' 
        ? [app.categoryGame, ...(app.additionalCategoriesGame || [])]
        : [app.categoryApps, ...(app.additionalCategoriesApps || [])],
      rating: app.userRating,
      stars: app.stars || 0,
      telegramStars: app.telegramStarsDonations,
      opens: app.clicks,
      clicks: app.clicks,
      isPromotedInCatalog: app.isPromotedInCatalog,
      dateAdded: app.dateAdded,
      linkApp: app.linkApp, // Добавляем linkApp
      startPromoCatalog: app.startPromoCatalog, // Добавляем startPromoCatalog
      finishPromoCatalog: app.finishPromoCatalog, // Добавляем finishPromoCatalog
      startPromoCategory: app.startPromoCategory, // Добавляем startPromoCategory
      finishPromoCategory: app.finishPromoCategory, // Добавляем finishPromoCategory
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

    // Обновляем telegramStarsDonations вместо stars
    app.telegramStarsDonations = (app.telegramStarsDonations || 0) + stars;
    await app.save();

    // Обновляем баланс разработчика
    const developer = await Developer.findOne({ userId: app.developerId });
    if (developer) {
      developer.starsBalance = (developer.starsBalance || 0) + stars;
      await developer.save();

      // Отправляем уведомление разработчику
      try {
        const user = await User.findOne({ userId });
        const message = `Пользователь ${user?.username || 'Неизвестный'} задонатил вам ${stars} Stars для приложения ${app.name}!`;
        await developerBot.sendMessage(app.developerId, message);
      } catch (notificationError) {
        console.error('Ошибка при отправке уведомления разработчику:', notificationError);
      }
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

    res.json({ message: `Донат ${stars} Stars успешно отправлен!`, updatedStars: app.telegramStarsDonations });
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

// Эндпоинт для увеличения счётчика кликов
app.post('/api/apps/:id/click', async (req, res) => {
  try {
    const { id } = req.params;
    const app = await App.findOne({ id });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }
    app.clicks = (app.clicks || 0) + 1;
    await app.save();
    res.json({ message: 'Счётчик кликов увеличен', clicks: app.clicks });
  } catch (error) {
    console.error('Ошибка при увеличении счётчика кликов:', error);
    res.status(500).json({ error: 'Ошибка при увеличении счётчика кликов: ' + error.message });
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

    // Валидация типа приложения
    if (!appData.type || !['game', 'app'].includes(appData.type)) {
      return res.status(400).json({ error: 'Тип приложения должен быть "game" или "app"' });
    }

    // Валидация названия
    if (!appData.name || typeof appData.name !== 'string' || appData.name.trim() === '') {
      return res.status(400).json({ error: 'Название приложения обязательно' });
    }

    // Валидация короткого описания
    if (!appData.shortDescription || typeof appData.shortDescription !== 'string' || appData.shortDescription.trim() === '') {
      return res.status(400).json({ error: 'Короткое описание обязательно' });
    }
    if (appData.shortDescription.length > 100) {
      return res.status(400).json({ error: 'Короткое описание не должно превышать 100 символов' });
    }

    // Валидация категории
    const validCategories = appData.type === 'game' ? gameCategories : appCategories;
    if (appData.type === 'game' && !validCategories.includes(appData.categoryGame)) {
      return res.status(400).json({ error: `Основная категория для игры должна быть одной из: ${validCategories.join(', ')}` });
    }
    if (appData.type === 'app' && !validCategories.includes(appData.categoryApps)) {
      return res.status(400).json({ error: `Основная категория для приложения должна быть одной из: ${validCategories.join(', ')}` });
    }

    // Валидация дополнительных категорий
    const additionalCategoriesField = appData.type === 'game' ? appData.additionalCategoriesGame : appData.additionalCategoriesApps;
    if (additionalCategoriesField && additionalCategoriesField.length > 2) {
      return res.status(400).json({ error: 'Максимум 2 дополнительные категории' });
    }
    if (additionalCategoriesField) {
      for (const cat of additionalCategoriesField) {
        if (!validCategories.includes(cat)) {
          return res.status(400).json({ error: `Дополнительная категория "${cat}" должна быть одной из: ${validCategories.join(', ')}` });
        }
      }
    }

    // Валидация URL аватарки
    if (!appData.icon || typeof appData.icon !== 'string' || appData.icon.trim() === '') {
      return res.status(400).json({ error: 'URL аватарки обязателен' });
    }

    // Валидация возрастного рейтинга
    if (!appData.ageRating || typeof appData.ageRating !== 'string' || appData.ageRating.trim() === '') {
      return res.status(400).json({ error: 'Возрастной рейтинг обязателен' });
    }

    // Валидация контактов
    if (!appData.contactInfo || typeof appData.contactInfo !== 'string' || appData.contactInfo.trim() === '') {
      return res.status(400).json({ error: 'Контакты для связи обязательны' });
    }

    // Валидация linkApp
    if (!appData.linkApp || !appData.linkApp.startsWith('https://t.me/')) {
      return res.status(400).json({ error: 'Ссылка на приложение должна быть в формате https://t.me/...' });
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
      linkApp: appData.linkApp, // Добавляем linkApp
      editCount: 0, // Инициализируем editCount
    });
    await newApp.save();
    developer.apps.push(newApp._id);
    await developer.save();

    try {
      const message = `Новое приложение добавлено для модерации!\n` +
                      `Разработчик: ${userId}\n` +
                      `Название: ${newApp.name}\n` +
                      `Тип: ${newApp.type}\n` +
                      `Категория: ${newApp.type === 'game' ? newApp.categoryGame : newApp.categoryApps}\n` +
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

    // Валидация типа приложения
    if (updates.type && !['game', 'app'].includes(updates.type)) {
      return res.status(400).json({ error: 'Тип приложения должен быть "game" или "app"' });
    }

    // Валидация названия
    if (updates.name && (typeof updates.name !== 'string' || updates.name.trim() === '')) {
      return res.status(400).json({ error: 'Название приложения обязательно' });
    }

    // Валидация короткого описания
    if (updates.shortDescription && (typeof updates.shortDescription !== 'string' || updates.shortDescription.trim() === '')) {
      return res.status(400).json({ error: 'Короткое описание обязательно' });
    }
    if (updates.shortDescription && updates.shortDescription.length > 100) {
      return res.status(400).json({ error: 'Короткое описание не должно превышать 100 символов' });
    }

    // Валидация категории
    const validCategories = updates.type === 'game' ? gameCategories : appCategories;
    if (updates.categoryGame && !validCategories.includes(updates.categoryGame)) {
      return res.status(400).json({ error: `Основная категория для игры должна быть одной из: ${validCategories.join(', ')}` });
    }
    if (updates.categoryApps && !validCategories.includes(updates.categoryApps)) {
      return res.status(400).json({ error: `Основная категория для приложения должна быть одной из: ${validCategories.join(', ')}` });
    }

    // Валидация дополнительных категорий
    const additionalCategoriesField = updates.type === 'game' ? updates.additionalCategoriesGame : updates.additionalCategoriesApps;
    if (additionalCategoriesField && additionalCategoriesField.length > 2) {
      return res.status(400).json({ error: 'Максимум 2 дополнительные категории' });
    }
    if (additionalCategoriesField) {
      for (const cat of additionalCategoriesField) {
        if (!validCategories.includes(cat)) {
          return res.status(400).json({ error: `Дополнительная категория "${cat}" должна быть одной из: ${validCategories.join(', ')}` });
        }
      }
    }

    // Валидация URL аватарки
    if (updates.icon && (typeof updates.icon !== 'string' || updates.icon.trim() === '')) {
      return res.status(400).json({ error: 'URL аватарки обязателен' });
    }

    // Валидация возрастного рейтинга
    if (updates.ageRating && (typeof updates.ageRating !== 'string' || updates.ageRating.trim() === '')) {
      return res.status(400).json({ error: 'Возрастной рейтинг обязателен' });
    }

    // Валидация контактов
    if (updates.contactInfo && (typeof updates.contactInfo !== 'string' || updates.contactInfo.trim() === '')) {
      return res.status(400).json({ error: 'Контакты для связи обязательны' });
    }

    // Валидация linkApp
    if (updates.linkApp && !updates.linkApp.startsWith('https://t.me/')) {
      return res.status(400).json({ error: 'Ссылка на приложение должна быть в формате https://t.me/...' });
    }

    const app = await App.findOne({ id: appId, developerId: userId });
    if (!app) {
      return res.status(404).json({ error: 'Приложение не найдено' });
    }

    // Увеличиваем editCount и меняем статус на onModeration
    app.editCount = (app.editCount || 0) + 1;
    app.status = 'onModeration';
    Object.assign(app, updates);
    await app.save();

    try {
      const message = `Приложение обновлено и отправлено на повторную модерацию!\n` +
                      `Разработчик: ${userId}\n` +
                      `Название: ${app.name}\n` +
                      `Тип: ${app.type}\n` +
                      `Категория: ${app.type === 'game' ? app.categoryGame : app.categoryApps}\n` +
                      `ID приложения: ${app.id}\n` +
                      `Количество редакций: ${app.editCount}`;
      await adminBot.sendMessage(adminId, message);
    } catch (notificationError) {
      console.error('Ошибка при отправке уведомления администратору:', notificationError);
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
        .filter(a => (a.type === 'game' ? a.categoryGame : a.categoryApps) === (app.type === 'game' ? app.categoryGame : app.categoryApps))
        .sort((a, b) => {
          const scoreA = (a.rating || 0) * 0.2 + (a.catalogRating || 0) * 0.2 + (a.telegramStarsDonations || 0) * 0.3 + (a.clicks || 0) * 0.0001;
          const scoreB = (b.rating || 0) * 0.2 + (b.catalogRating || 0) * 0.2 + (b.telegramStarsDonations || 0) * 0.3 + (b.clicks || 0) * 0.0001;
          return scoreB - scoreA;
        })
        .findIndex(a => a.id === app.id) + 1;

      const additionalCategoryRanks = (app.type === 'game' ? app.additionalCategoriesGame : app.additionalCategoriesApps || []).map(cat => {
        return {
          category: cat,
          rank: allApps
            .filter(a => (a.type === 'game' ? a.additionalCategoriesGame : a.additionalCategoriesApps || []).includes(cat))
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
    const { userId, appId, type } = req.body;
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

    // Устанавливаем стоимость и длительность продвижения
    const cost = type === 'catalog' ? 1 : 2; // 1 звезда за каталог, 2 звезды за категорию
    const durationMinutes = type === 'catalog' ? 1 : 2; // 1 минута для каталога, 2 минуты для категории

    if ((developer.starsBalance || 0) < cost) {
      return res.status(400).json({ error: 'Недостаточно Stars для продвижения' });
    }

    developer.starsBalance -= cost;
    await developer.save();

    const endDate = new Date();
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);

    if (type === 'catalog') {
      app.promotion.catalog = { active: true, endDate: endDate.toISOString() };
      app.isPromotedInCatalog = true;
      app.startPromoCatalog = new Date().toISOString();
      app.finishPromoCatalog = endDate.toISOString();
    } else if (type === 'category') {
      app.promotion.category = { active: true, endDate: endDate.toISOString() };
      app.isPromotedInCategory = true;
      app.startPromoCategory = new Date().toISOString();
      app.finishPromoCategory = endDate.toISOString();
    }

    await app.save();
    res.json({ message: `Продвижение успешно активировано на ${durationMinutes} минут` });
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
      allowedDeveloperIds: allowedDeveloperIds, // Добавляем список разрешённых разработчиков
    };
    res.json(stats);
  } catch (error) {
    console.error('Ошибка при получении статистики для администратора:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики: ' + error.message });
  }
});

// Эндпоинт для добавления нового разрешённого разработчика
app.post('/api/admin/add-developer', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!checkAdminAccess(userId)) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    const { developerId } = req.body;
    if (!developerId || typeof developerId !== 'string') {
      return res.status(400).json({ error: 'ID разработчика обязателен и должен быть строкой' });
    }
    if (allowedDeveloperIds.includes(developerId)) {
      return res.status(400).json({ error: 'Этот ID уже в списке разрешённых разработчиков' });
    }
    allowedDeveloperIds.push(developerId);
    res.json({ message: `Разработчик с ID ${developerId} успешно добавлен`, allowedDeveloperIds });
  } catch (error) {
    console.error('Ошибка при добавлении разработчика:', error);
    res.status(500).json({ error: 'Ошибка при добавлении разработчика: ' + error.message });
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