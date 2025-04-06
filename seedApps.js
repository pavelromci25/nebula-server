const mongoose = require('mongoose');
const App = require('./models/App');

async function connectToMongo() {
  try {
    await mongoose.connect('mongodb+srv://pavelromci25:lpUHGXAkgIaAbnnT@nebula.th0fboc.mongodb.net/?retryWrites=true&w=majority');
    console.log('MongoDB подключён');
  } catch (err) {
    console.error('Ошибка подключения MongoDB:', err);
    process.exit(1);
  }
}

const mockApps = [
  {
    id: "1",
    type: "game",
    name: "Тетрис",
    shortDescription: "Классическая игра-головоломка.",
    category: "Пазлы",
    additionalCategories: ["Классика"],
    icon: "https://via.placeholder.com/80",
    bannerImages: ["https://via.placeholder.com/300x150"],
    clicks: 1200,
    telegramStarsDonations: 150,
    votes: 0,
    userRating: 4.5,
    dateAdded: "2025-03-01",
    complaints: 0,
    adminId: "12345",
    adminEmail: "admin@example.com",
    isTopInCatalog: false,
    isTopInCategory: false,
    isPromotedInCatalog: false,
    isPromotedInCategory: false,
    isVip: false,
    longDescription: "Тетрис — легендарная игра-головоломка, где вам нужно складывать падающие блоки, чтобы заполнить ряды и набрать очки. Играйте и соревнуйтесь с друзьями!",
    categories: ["Пазлы", "Классика"],
    geo: "Россия",
    developer: "Tetris Inc.",
    catalogRating: 4.8,
    opens: 1200,
    platforms: ["iOS", "Android", "Web"],
    ageRating: "3+",
    inAppPurchases: false,
    gallery: ["https://via.placeholder.com/300", "https://via.placeholder.com/300"],
    video: "https://www.youtube.com/embed/dQw4w9WgXcQ"
  },
  {
    id: "2",
    type: "game",
    name: "Змейка",
    shortDescription: "Классическая аркада.",
    category: "Аркады",
    additionalCategories: ["Классика"],
    icon: "https://via.placeholder.com/80",
    bannerImages: ["https://via.placeholder.com/300x150"],
    clicks: 900,
    telegramStarsDonations: 80,
    votes: 0,
    userRating: 4.2,
    dateAdded: "2025-04-01",
    complaints: 0,
    adminId: "12345",
    adminEmail: "admin@example.com",
    isTopInCatalog: false,
    isTopInCategory: false,
    isPromotedInCatalog: false,
    isPromotedInCategory: false,
    isVip: false,
    longDescription: "Змейка — аркадная игра, где вы управляете змейкой, собирая еду и избегая столкновений. Сможете ли вы побить рекорд?",
    categories: ["Аркады", "Классика"],
    geo: "США",
    developer: "Snake Games",
    catalogRating: 4.5,
    opens: 900,
    platforms: ["Web"],
    ageRating: "3+",
    inAppPurchases: true,
    gallery: ["https://via.placeholder.com/300"]
  },
  {
    id: "3",
    type: "game",
    name: "Пазлы 2048",
    shortDescription: "Собирайте числа и достигайте 2048!",
    category: "Пазлы",
    additionalCategories: ["Логические"],
    icon: "https://via.placeholder.com/80",
    bannerImages: ["https://via.placeholder.com/300x150"],
    clicks: 1500,
    telegramStarsDonations: 200,
    votes: 0,
    userRating: 4.7,
    dateAdded: "2025-02-15",
    complaints: 0,
    adminId: "12345",
    adminEmail: "admin@example.com",
    isTopInCatalog: false,
    isTopInCategory: false,
    isPromotedInCatalog: false,
    isPromotedInCategory: false,
    isVip: false,
    longDescription: "2048 — увлекательная головоломка, где вы соединяете числа, чтобы достичь 2048. Проверьте свои математические навыки!",
    categories: ["Пазлы", "Логические"],
    geo: "Германия",
    developer: "2048 Games",
    catalogRating: 4.9,
    opens: 1500,
    platforms: ["iOS", "Android"],
    ageRating: "6+",
    inAppPurchases: false,
    gallery: ["https://via.placeholder.com/300", "https://via.placeholder.com/300", "https://via.placeholder.com/300"],
    video: "https://www.youtube.com/embed/dQw4w9WgXcQ"
  },
  {
    id: "4",
    type: "app",
    name: "Словесный Бой",
    shortDescription: "Составляйте слова и побеждайте!",
    category: "Словесные",
    additionalCategories: ["Мультиплеер"],
    icon: "https://via.placeholder.com/80",
    bannerImages: ["https://via.placeholder.com/300x150"],
    clicks: 600,
    telegramStarsDonations: 50,
    votes: 0,
    userRating: 4.0,
    dateAdded: "2025-03-20",
    complaints: 0,
    adminId: "12345",
    adminEmail: "admin@example.com",
    isTopInCatalog: false,
    isTopInCategory: false,
    isPromotedInCatalog: false,
    isPromotedInCategory: false,
    isVip: false,
    longDescription: "Словесный Бой — игра, где вы соревнуетесь с другими игроками, составляя слова из букв. Улучшайте свой словарный запас и побеждайте!",
    categories: ["Словесные", "Мультиплеер"],
    geo: "Россия",
    developer: "Word Games",
    catalogRating: 4.3,
    opens: 600,
    platforms: ["iOS", "Android", "Web"],
    ageRating: "12+",
    inAppPurchases: true,
    gallery: ["https://via.placeholder.com/300"]
  },
  {
    id: "5",
    type: "app",
    name: "Шахматы Онлайн",
    shortDescription: "Играйте в шахматы с друзьями.",
    category: "Настольные",
    additionalCategories: ["Мультиплеер"],
    icon: "https://via.placeholder.com/80",
    bannerImages: ["https://via.placeholder.com/300x150"],
    clicks: 1000,
    telegramStarsDonations: 120,
    votes: 0,
    userRating: 4.8,
    dateAdded: "2025-01-10",
    complaints: 0,
    adminId: "12345",
    adminEmail: "admin@example.com",
    isTopInCatalog: false,
    isTopInCategory: false,
    isPromotedInCatalog: false,
    isPromotedInCategory: false,
    isVip: false,
    longDescription: "Шахматы Онлайн — играйте в классические шахматы с друзьями или случайными соперниками. Улучшайте свои навыки и станьте мастером!",
    categories: ["Настольные", "Мультиплеер"],
    geo: "США",
    developer: "Chess Masters",
    catalogRating: 4.7,
    opens: 1000,
    platforms: ["Web"],
    ageRating: "6+",
    inAppPurchases: false,
    gallery: ["https://via.placeholder.com/300", "https://via.placeholder.com/300"]
  }
];

async function seedApps() {
  try {
    await connectToMongo();

    // Очищаем коллекцию перед добавлением
    await App.deleteMany({});
    console.log('Коллекция apps очищена');

    // Добавляем данные
    await App.insertMany(mockApps);
    console.log('Мок-данные успешно добавлены в коллекцию apps');

    // Закрываем соединение
    mongoose.connection.close();
  } catch (error) {
    console.error('Ошибка при добавлении мок-данных:', error);
    mongoose.connection.close();
  }
}

seedApps();