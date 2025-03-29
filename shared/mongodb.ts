/**
 * MongoDB интеграция
 * 
 * Данный модуль предоставляет подключение к MongoDB и определяет схемы данных
 * для пользователей, игр и других коллекций.
 */

import mongoose, { Schema, Document } from 'mongoose';

// Интерфейс для пользовательских данных
export interface IUser extends Document {
  telegramId: string;           // ID пользователя в Telegram
  username?: string;            // Имя пользователя (может отсутствовать)
  firstName?: string;           // Имя пользователя из Telegram
  lastName?: string;            // Фамилия пользователя из Telegram
  photoUrl?: string;            // URL фотографии профиля
  coins: number;                // Количество монет
  stars: number;                // Количество звезд
  lastActive: Date;             // Время последней активности
  referrals: string[];          // Список ID пользователей, которые перешли по реферальной ссылке
  createdAt: Date;              // Время создания аккаунта
}

// Интерфейс для игр
export interface IGame extends Document {
  gameId: string;               // Уникальный идентификатор игры
  name: string;                 // Название игры
  type: 'tma' | 'webview';      // Тип игры (tma - Telegram Mini App или webview - внешняя игра)
  url: string;                  // URL игры
  description?: string;         // Описание игры
  imageUrl?: string;            // URL изображения/иконки игры
  category?: string;            // Категория игры
  isActive: boolean;            // Доступна ли игра
}

// Интерфейс для транзакций (история изменения монет/звезд)
export interface ITransaction extends Document {
  telegramId: string;           // ID пользователя в Telegram
  type: 'coins' | 'stars';      // Тип транзакции
  amount: number;               // Количество (может быть отрицательным)
  reason: string;               // Причина транзакции
  createdAt: Date;              // Время транзакции
}

// Схема для пользователей
const UserSchema = new Schema<IUser>({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  photoUrl: { type: String },
  coins: { type: Number, default: 0 },
  stars: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  referrals: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

// Схема для игр
const GameSchema = new Schema<IGame>({
  gameId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['tma', 'webview'], required: true },
  url: { type: String, required: true },
  description: { type: String },
  imageUrl: { type: String },
  category: { type: String },
  isActive: { type: Boolean, default: true }
});

// Схема для транзакций
const TransactionSchema = new Schema<ITransaction>({
  telegramId: { type: String, required: true },
  type: { type: String, enum: ['coins', 'stars'], required: true },
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Подключение к MongoDB
const connectMongoDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://pavelromci25:lpUHGXAkgIaAbnnT@nebula.th0fboc.mongodb.net/nebula?retryWrites=true&w=majority');
    console.log('Connected to MongoDB successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
  }
};

// Создаем модели только если они еще не были определены
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
const Game = mongoose.models.Game || mongoose.model<IGame>('Game', GameSchema);
const Transaction = mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', TransactionSchema);

export { connectMongoDB, User, Game, Transaction };