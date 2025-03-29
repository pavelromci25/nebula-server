import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { connectMongoDB, User, Game as GameModel, Transaction } from '../shared/mongodb';

/**
 * Интерфейс для игры
 * Определяет структуру данных игры для API
 */
interface Game {
  id: string;          // Уникальный ID игры
  name: string;        // Название игры
  type: string;        // Тип игры (tma или webview)
  url: string;         // URL для запуска игры
  imageUrl?: string;   // URL изображения игры (опционально)
  description?: string; // Описание игры (опционально)
}

/**
 * Интерфейс для данных пользователя
 * Определяет структуру данных пользователя для API
 */
interface UserData {
  id: string;          // Telegram ID пользователя
  username: string;    // Имя пользователя
  coins: number;       // Количество монет
  stars: number;       // Количество звезд
  referrals: { telegramId: string; username: string }[]; // Список рефералов
  photoUrl?: string;   // URL фото профиля (опционально)
  firstName?: string;  // Имя (опционально)
  lastName?: string;   // Фамилия (опционально)
}

/**
 * Регистрирует маршруты для Express приложения
 * и настраивает подключение к MongoDB
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Подключение к MongoDB
  await connectMongoDB().catch(err => {
    console.error('MongoDB connection error:', err);
  });

  /**
   * API для получения игр из MongoDB
   * Возвращает список доступных игр
   */
  app.get('/api/games', async (req: Request, res: Response) => {
    try {
      // Получаем игры из MongoDB
      const games = await GameModel.find({ isActive: true }).catch(() => []);
      
      // Преобразуем в формат для API
      const gamesResponse = games.map((game): Game => ({
        id: game.gameId,
        name: game.name,
        type: game.type,
        url: game.url,
        imageUrl: game.imageUrl,
        description: game.description
      }));
      
      // Если игр нет в базе, добавляем тестовые данные
      if (gamesResponse.length === 0) {
        const defaultGames: Game[] = [
          {
            id: "1",
            name: "Space Adventure",
            type: "webview",
            url: "https://vketgames.com/games/1000",
          },
          {
            id: "2",
            name: "Crypto Clicker",
            type: "tma",
            url: "https://tma.dev/crypto-clicker",
          },
          {
            id: "3",
            name: "Tower Defense",
            type: "webview",
            url: "https://vketgames.com/games/2000",
          }
        ];
        
        // Сохраняем тестовые игры в базу
        for (const game of defaultGames) {
          await GameModel.create({
            gameId: game.id,
            name: game.name,
            type: game.type,
            url: game.url,
            isActive: true
          }).catch(err => console.error(`Error creating game ${game.name}:`, err));
        }
        
        res.json(defaultGames);
      } else {
        res.json(gamesResponse);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
      res.status(500).json({ error: 'Failed to fetch games' });
    }
  });

  /**
   * API для получения данных пользователя
   * Возвращает информацию о пользователе по его Telegram ID
   */
  app.get('/api/user/:userId', async (req: Request, res: Response) => {
    try {
      const telegramId = req.params.userId;
      
      // Ищем пользователя в MongoDB
      let user = await User.findOne({ telegramId }).catch(() => null);
      
      // Если пользователь не найден, создаем нового
      if (!user) {
        user = await User.create({
          telegramId,
          username: telegramId === 'guest' ? 'Guest' : 'New User',
          coins: telegramId === 'guest' ? 50 : 0,
          stars: telegramId === 'guest' ? 10 : 0,
          lastActive: new Date(),
          referrals: []
        }).catch(err => {
          console.error('Error creating user:', err);
          return null;
        });
        
        // Если не удалось создать пользователя в MongoDB, используем локальные данные
        if (!user) {
          return res.json({
            id: telegramId,
            username: telegramId === 'guest' ? 'Guest' : 'New User',
            coins: telegramId === 'guest' ? 50 : 0,
            stars: telegramId === 'guest' ? 10 : 0,
            referrals: []
          });
        }
      }
      
      // Обновляем время последней активности
      user.lastActive = new Date();
      await user.save().catch(err => console.error('Error updating lastActive:', err));
      
      // Формируем ответ в соответствии с ожидаемым форматом
      const userData: UserData = {
        id: user.telegramId,
        username: user.username || user.firstName || 'Unknown',
        coins: user.coins,
        stars: user.stars,
        referrals: (user.referrals || []).map(refId => ({ 
          telegramId: refId, 
          username: 'Referral' // В будущем можно получать username из базы
        })),
        photoUrl: user.photoUrl,
        firstName: user.firstName,
        lastName: user.lastName
      };
      
      res.json(userData);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user data' });
    }
  });

  /**
   * API для добавления монет пользователю
   * Увеличивает количество монет у пользователя
   */
  app.post('/api/coins', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        userId: z.string(),
        coins: z.number().int().positive().default(1)
      });

      const { userId, coins } = schema.parse(req.body);
      
      // Находим пользователя или создаем нового
      let user = await User.findOne({ telegramId: userId }).catch(() => null);
      if (!user) {
        user = await User.create({
          telegramId: userId,
          username: userId === 'guest' ? 'Guest' : 'New User',
          coins: 0,
          stars: 0,
          lastActive: new Date(),
          referrals: []
        }).catch(err => {
          console.error('Error creating user:', err);
          return null;
        });
        
        // Если не удалось создать пользователя в MongoDB, возвращаем ошибку
        if (!user) {
          return res.status(500).json({ error: 'Failed to create user' });
        }
      }
      
      // Добавляем монеты
      user.coins += coins;
      user.lastActive = new Date();
      await user.save().catch(err => console.error('Error saving user after adding coins:', err));
      
      // Записываем транзакцию
      await Transaction.create({
        telegramId: userId,
        type: 'coins',
        amount: coins,
        reason: 'Online reward',
        createdAt: new Date()
      }).catch(err => console.error('Error creating transaction:', err));
      
      res.json({ success: true, coins: user.coins });
    } catch (error) {
      console.error('Error adding coins:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  });

  /**
   * API для системы рефералов
   * Позволяет добавить нового реферала и начислить бонус
   */
  app.post('/api/referral', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        userId: z.string(),
        referrerId: z.string(),
        username: z.string().optional()
      });

      const { userId, referrerId, username = 'Unknown' } = schema.parse(req.body);
      
      // Проверяем валидность запроса
      if (userId === referrerId) {
        return res.json({ success: false, error: 'Cannot refer yourself' });
      }
      
      // Находим пользователя-реферера
      let referrer = await User.findOne({ telegramId: referrerId }).catch(() => null);
      if (!referrer) {
        referrer = await User.create({
          telegramId: referrerId,
          username: username || 'New User',
          coins: 0,
          stars: 0,
          lastActive: new Date(),
          referrals: []
        }).catch(err => {
          console.error('Error creating referrer:', err);
          return null;
        });
        
        if (!referrer) {
          return res.status(500).json({ error: 'Failed to create referrer' });
        }
      }
      
      // Проверяем, что реферал не был добавлен ранее
      if (!referrer.referrals.includes(userId)) {
        // Добавляем реферала
        referrer.referrals.push(userId);
        
        // Начисляем бонус за реферала
        referrer.stars += 2;
        referrer.coins += 10;
        
        await referrer.save().catch(err => console.error('Error saving referrer after adding referral:', err));
        
        // Записываем транзакцию для звезд
        await Transaction.create({
          telegramId: referrerId,
          type: 'stars',
          amount: 2,
          reason: 'Referral bonus',
          createdAt: new Date()
        }).catch(err => console.error('Error creating stars transaction:', err));
        
        // Записываем транзакцию для монет
        await Transaction.create({
          telegramId: referrerId,
          type: 'coins',
          amount: 10,
          reason: 'Referral bonus',
          createdAt: new Date()
        }).catch(err => console.error('Error creating coins transaction:', err));
        
        res.json({ 
          success: true,
          referrals: referrer.referrals.map(refId => ({ telegramId: refId, username: 'Referral' })),
          stars: referrer.stars,
          coins: referrer.coins
        });
      } else {
        res.json({ 
          success: false, 
          error: 'Already referred',
          referrals: referrer.referrals.map(refId => ({ telegramId: refId, username: 'Referral' })),
          stars: referrer.stars,
          coins: referrer.coins
        });
      }
    } catch (error) {
      console.error('Error adding referral:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  });
  
  /**
   * API для обновления данных пользователя
   * Обновляет профиль пользователя после авторизации
   */
  app.post('/api/user/update', async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        telegramId: z.string(),
        username: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        photoUrl: z.string().optional()
      });

      const userData = schema.parse(req.body);
      
      // Находим пользователя или создаем нового
      let user = await User.findOne({ telegramId: userData.telegramId }).catch(() => null);
      if (!user) {
        user = await User.create({
          telegramId: userData.telegramId,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          photoUrl: userData.photoUrl,
          coins: 0,
          stars: 0,
          lastActive: new Date(),
          referrals: []
        }).catch(err => {
          console.error('Error creating user:', err);
          return null;
        });
        
        if (!user) {
          return res.status(500).json({ error: 'Failed to create user' });
        }
      } else {
        // Обновляем данные пользователя
        if (userData.username) user.username = userData.username;
        if (userData.firstName) user.firstName = userData.firstName;
        if (userData.lastName) user.lastName = userData.lastName;
        if (userData.photoUrl) user.photoUrl = userData.photoUrl;
        
        user.lastActive = new Date();
        await user.save().catch(err => console.error('Error updating user data:', err));
      }
      
      res.json({ 
        success: true, 
        user: {
          id: user.telegramId,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          coins: user.coins,
          stars: user.stars
        }
      });
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
