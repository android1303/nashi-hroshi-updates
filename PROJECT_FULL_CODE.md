# Повний код проєкту «Наші Гроші» (v1.0.5)

> Автоматично згенеровано: 2026-11-08 через `node scripts/sync-project-doc.js`
> Цей файл містить актуальний вихідний код усіх модулів додатку (включно з Firebase синхронізацією та ШІ-асистентом голосу і фото чеків).

---

## 1. Конфігурація залежностей (package.json)
**Файл:** `package.json`

```json
{
  "name": "nashi-hroshi",
  "version": "1.0.5",
  "description": "Мобільний додаток для обліку сімейного бюджету «Наші Гроші»",
  "main": "index.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@expo/vector-icons": "^14.0.2",
    "@react-native-async-storage/async-storage": "1.23.1",
    "expo": "~51.0.28",
    "expo-av": "~14.0.4",
    "expo-file-system": "~17.0.1",
    "expo-image-picker": "~15.0.7",
    "expo-linear-gradient": "~13.0.2",
    "expo-local-authentication": "~14.0.1",
    "expo-status-bar": "~1.12.1",
    "firebase": "^10.12.5",
    "react": "18.2.0",
    "react-native": "0.74.5",
    "react-native-safe-area-context": "4.10.5",
    "react-native-svg": "15.2.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0"
  },
  "private": true
}
```

---

## 2. Конфігурація Expo та дозволів Android/iOS (app.json)
**Файл:** `app.json`

```json
{
  "expo": {
    "name": "Наші Гроші",
    "slug": "nashi-hroshi",
    "version": "1.0.5",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#141218"
    },
    "ios": {
      "supportsTablet": true,
      "infoPlist": {
        "NSFaceIDUsageDescription": "Додатку потрібен доступ до Face ID / Touch ID для безпечного входу в Наші Гроші",
        "NSMicrophoneUsageDescription": "Додатку потрібен доступ до мікрофона для голосового додавання витрат через ШІ",
        "NSCameraUsageDescription": "Додатку потрібен доступ до камери для сканування чеків через ШІ",
        "NSPhotoLibraryUsageDescription": "Додатку потрібен доступ до галереї для додавання фото чеків та скріншотів"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#141218"
      },
      "package": "com.android1303.nashihroshi",
      "versionCode": 5,
      "permissions": [
        "USE_BIOMETRIC",
        "USE_FINGERPRINT",
        "RECORD_AUDIO",
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE"
      ]
    },
    "plugins": [
      [
        "expo-local-authentication",
        {
          "faceIDPermission": "Дозволити вхід через Face ID у Наші Гроші"
        }
      ],
      [
        "expo-av",
        {
          "microphonePermission": "Дозволити доступ до мікрофона для голосового вводу витрат"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": "Дозволити доступ до фото для сканування чеків",
          "cameraPermission": "Дозволити доступ до камери для фотографування чеків"
        }
      ]
    ]
  }
}
```

---

## 3. Точка входу додатку (index.js)
**Файл:** `index.js`

```javascript
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

---

## 4. Підключення Firebase Firestore (src/services/firebase.js)
**Файл:** `src/services/firebase.js`

```javascript
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBk5MGK6IomPvWAFH7cyI44svqTHYyO1Is",
  authDomain: "first-apk-469d4.firebaseapp.com",
  projectId: "first-apk-469d4",
  storageBucket: "first-apk-469d4.firebasestorage.app",
  messagingSenderId: "382160876662",
  appId: "1:382160876662:web:ee4d9e10a77643f2f9db57",
  measurementId: "G-W7N0JPD915"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export default app;
```

---

## 5. ШІ-сервіс Google Gemini для голосу, фото чеків і тексту (src/services/ai.js)
**Файл:** `src/services/ai.js`

```javascript
// Сервіс ШІ-асистента (Google Gemini Multimodal API) для розпізнавання голосу, фото чеків та тексту

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest'
];

/**
 * Допоміжна функція для нормалізації категорії та підкатегорії відповідно до доступних у додатку
 */
function normalizeTransactionItem(rawItem, categories = [], incomeGroups = [], defaultAuthor = 'Андрій') {
  const type = rawItem.type === 'income' ? 'income' : 'expense';
  const rawAmount = typeof rawItem.amount === 'number'
    ? rawItem.amount
    : parseFloat(String(rawItem.amount || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
  const amount = Math.round((isNaN(rawAmount) ? 0 : Math.abs(rawAmount)) * 100) / 100;

  const sourceGroups = type === 'income'
    ? incomeGroups.filter(g => !g.isHidden)
    : categories.filter(c => !c.isHidden);

  const fallbackGroups = sourceGroups.length > 0
    ? sourceGroups
    : (type === 'income' ? incomeGroups : categories);

  let matchedGroup = null;
  let matchedSubItem = null;

  const targetCatStr = String(rawItem.category || '').trim().toLowerCase();
  const targetMainIdStr = String(rawItem.mainCategoryId || '').trim().toLowerCase();

  // 1. Точний пошук по підкатегорії
  for (const grp of fallbackGroups) {
    const exactSub = (grp.items || []).find(i => i.toLowerCase() === targetCatStr);
    if (exactSub) {
      matchedGroup = grp;
      matchedSubItem = exactSub;
      break;
    }
  }

  // 2. Частковий пошук по підкатегорії
  if (!matchedSubItem && targetCatStr) {
    for (const grp of fallbackGroups) {
      const partialSub = (grp.items || []).find(
        i => i.toLowerCase().includes(targetCatStr) || targetCatStr.includes(i.toLowerCase())
      );
      if (partialSub) {
        matchedGroup = grp;
        matchedSubItem = partialSub;
        break;
      }
    }
  }

  // 3. Пошук по mainCategoryId або імені групи
  if (!matchedGroup) {
    matchedGroup = fallbackGroups.find(
      g => g.id.toLowerCase() === targetMainIdStr || g.name.toLowerCase() === targetMainIdStr || g.name.toLowerCase().includes(targetCatStr)
    );
  }

  // 4. Дефолтна категорія, якщо нічого не знайдено
  if (!matchedGroup) {
    matchedGroup = fallbackGroups.find(g => g.id === 'food') || fallbackGroups[0] || {
      id: type === 'income' ? 'job' : 'food',
      items: [type === 'income' ? 'Зарплата' : 'Продукти']
    };
  }

  if (!matchedSubItem) {
    matchedSubItem = (matchedGroup.items && matchedGroup.items[0]) || (type === 'income' ? 'Зарплата' : 'Продукти');
  }

  let author = defaultAuthor || 'Андрій';
  if (rawItem.author) {
    const aLower = String(rawItem.author).toLowerCase();
    if (aLower.includes('люд') || aLower.includes('мила') || aLower.includes('дружин')) {
      author = 'Людмила';
    } else if (aLower.includes('андр')) {
      author = 'Андрій';
    }
  }

  const note = String(rawItem.note || '').trim();
  const dateOffsetDays = typeof rawItem.dateOffsetDays === 'number' ? rawItem.dateOffsetDays : 0;

  return {
    id: 'ai_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    type,
    amount,
    mainCategoryId: matchedGroup.id,
    category: matchedSubItem,
    note,
    author,
    dateOffsetDays
  };
}

/**
 * Побудова системного промпту з актуальними категоріями користувача
 */
function buildSystemPrompt({ categories, incomeGroups, defaultAuthor, mode, receiptSplitMode }) {
  const activeExp = (categories || []).filter(c => !c.isHidden).map(c => ({
    mainCategoryId: c.id,
    groupName: c.name,
    subcategories: c.items || []
  }));

  const activeInc = (incomeGroups || []).filter(g => !g.isHidden).map(g => ({
    mainCategoryId: g.id,
    groupName: g.name,
    subcategories: g.items || []
  }));

  const receiptInstruction = mode === 'photo'
    ? (receiptSplitMode === 'items'
        ? 'Це фото чека або скріншот. Розбий чек на окремі логічні позиції або групи товарів за категоріями (наприклад, окремо продукти, окремо побутова хімія чи кафе), вказуючи назву товару/магазину в полі "note".'
        : 'Це фото чека, квитанції або скріншот банківського додатку (Monobank, Приват24 тощо). Витягни ЗАГАЛЬНУ підсумкову суму чека (СУМА РАЗОМ / ДО СПЛАТИ) як одну операцію (або кілька, якщо на скріншоті список різних транзакцій з банку). У поле "note" запиши назву магазину/закладу або короткий опис.')
    : 'Якщо користувач назвав або написав кілька різних витрат чи доходів у одній фразі (наприклад: "Заправив авто на 1200 грн на ОККО і купив каву за 90 грн"), обов\'язково розділи їх на окремі елементи масиву "transactions".';

  return `Ти — розумний фінансовий ШІ-асистент сімейного бюджету в додатку «Наші Гроші».
Твоє завдання — проаналізувати вхідні дані (голосовий запис, фото чека/скріншота або текст українською чи російською мовою) і перетворити їх у структурований JSON зі списком фінансових операцій.

ДОСТУПНІ КАТЕГОРІЇ ВИТРАТ (type: "expense"):
${JSON.stringify(activeExp, null, 2)}

ДОСТУПНІ КАТЕГОРІЇ ДОХОДІВ (type: "income"):
${JSON.stringify(activeInc, null, 2)}

ПРАВИЛА:
1. ${receiptInstruction}
2. Обирай "mainCategoryId" та "category" (підкатегорію) СТРОГО зі списків вище, які найкраще підходять за змістом:
   - супермаркети (АТБ, Сільпо, Фора, Novus, Ашан, Метро, ринок, їжа, вода, солодощі) -> mainCategoryId: "food", category: "Продукти"
   - кава, кафе, ресторани, доставка їжі, McDonald's, піца, суші -> mainCategoryId: "food", category: "Ресторани/Кафе"
   - одяг, взуття, Zara, Sinsay тощо -> mainCategoryId: "food", category: "Одяг/Взуття"
   - АЗС (ОККО, WOG, UPG, БРСМ, бензин, дизель, газ, зарядка авто) -> mainCategoryId: "auto", category: "Пальне/Заправка"
   - СТО, мийка, шиномонтаж, запчастини, страховка авто, парковка -> mainCategoryId: "auto", category: "Авто/Обслуговування"
   - Uklon, Bolt, Uber, таксі -> mainCategoryId: "auto", category: "Таксі"
   - маршрутка, метро, автобус, потяг -> mainCategoryId: "auto", category: "Громадський транспорт"
   - світло, газ, вода, опалення, ОСББ, квартплата -> mainCategoryId: "home", category: "Комуналка"
   - мобільний зв'язок, Київстар, Vodafone, Lifecell, домашній інтернет -> mainCategoryId: "home", category: "Інтернет/Зв’язок"
   - побутова хімія, Єва, Prostor, Аврора, Епіцентр, товари для дому -> mainCategoryId: "home", category: "Ремонт/Побут"
   - аптека, ліки, лікарі, аналізи, стоматолог -> mainCategoryId: "health", category: "Аптека/Здоров’я"
   - перукарня, манікюр, косметика, догляд -> mainCategoryId: "health", category: "Краса/Догляд"
   - спортзал, басейн, тренування -> mainCategoryId: "health", category: "Спорт/Фітнес"
   - корм для кота/собаки, ветклініка, зоомагазин -> mainCategoryId: "zoo", category: "Тварини/Зоо"
   - зарплата, аванс -> type: "income", mainCategoryId: "job", category: "Зарплата"
3. Автор за замовчуванням: "${defaultAuthor || 'Андрій'}". Якщо явно сказано "Людмила витратила/купила/отримала" — став "Людмила", якщо "Андрій" — став "Андрій".
4. Поле "dateOffsetDays": 0 (сьогодні), -1 (якщо сказано "вчора"), -2 ("позавчора").
5. У полі "transcript" поверни короткий текст того, що було розпізнано з голосу або що зображено на фото чека.

ФОРМАТ ВІДПОВІДІ (СТРОГО валідний JSON без markdown-обгорток):
{
  "transcript": "Розпізнаний текст або короткий опис чека",
  "transactions": [
    {
      "type": "expense",
      "amount": 1200,
      "mainCategoryId": "auto",
      "category": "Пальне/Заправка",
      "note": "ОККО",
      "author": "${defaultAuthor || 'Андрій'}",
      "dateOffsetDays": 0
    }
  ]
}`;
}

/**
 * Основна функція виклику Gemini API
 */
export async function analyzeTransactionsWithAI({
  apiKey,
  mode = 'voice', // 'voice' | 'photo' | 'text'
  receiptSplitMode = 'total', // 'total' | 'items'
  audioBase64,
  audioMimeType = 'audio/mp4',
  imageBase64,
  imageMimeType = 'image/jpeg',
  textInput = '',
  categories = [],
  incomeGroups = [],
  defaultAuthor = 'Андрій'
}) {
  const cleanKey = String(apiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();
  if (!cleanKey) {
    throw new Error('MISSING_API_KEY');
  }

  const systemPrompt = buildSystemPrompt({
    categories,
    incomeGroups,
    defaultAuthor,
    mode,
    receiptSplitMode
  });

  const parts = [{ text: systemPrompt }];

  if (mode === 'voice' && audioBase64) {
    parts.push({
      inlineData: {
        mimeType: audioMimeType,
        data: audioBase64
      }
    });
    parts.push({
      text: 'Розпізнай це голосове повідомлення про витрати/доходи та поверни JSON.'
    });
  } else if (mode === 'photo' && imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType,
        data: imageBase64
      }
    });
    if (textInput && textInput.trim()) {
      parts.push({ text: `Додатковий коментар від користувача: "${textInput.trim()}"` });
    } else {
      parts.push({ text: 'Проаналізуй це фото чека / скріншота та поверни JSON з операціями.' });
    }
  } else if (textInput && textInput.trim()) {
    parts.push({
      text: `Повідомлення користувача: "${textInput.trim()}"\nПоверни JSON з операціями.`
    });
  } else {
    throw new Error('Немає даних для аналізу (запишіть голос, додайте фото або введіть текст).');
  }

  const requestBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.15,
      responseMimeType: 'application/json'
    }
  };

  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const resData = await response.json();

      if (!response.ok) {
        const errMsg = resData?.error?.message || `HTTP ${response.status}`;
        // Якщо модель не знайдена (404), пробуємо наступну модель зі списку
        if (response.status === 404) {
          lastError = new Error(errMsg);
          continue;
        }
        if (response.status === 400 && errMsg.toLowerCase().includes('api key')) {
          throw new Error('Невірний Gemini API ключ. Перевірте його у Налаштуваннях.');
        }
        throw new Error(`Помилка Gemini API: ${errMsg}`);
      }

      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) {
        throw new Error('ШІ не зміг розпізнати дані. Спробуйте ще раз.');
      }

      // Очищення можливих markdown блоків ```json ... ```
      const cleanedJsonStr = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleanedJsonStr);
      } catch (parseErr) {
        const match = cleanedJsonStr.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          throw new Error('Не вдалося розібрати відповідь ШІ.');
        }
      }

      const rawList = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed.transactions) ? parsed.transactions : []);

      const normalizedTransactions = rawList
        .map(item => normalizeTransactionItem(item, categories, incomeGroups, defaultAuthor))
        .filter(item => item.amount > 0);

      return {
        transcript: parsed.transcript || '',
        transactions: normalizedTransactions
      };
    } catch (err) {
      lastError = err;
      // Якщо це помилка ключа або мережі — не перебираємо інші моделі без потреби, крім 404
      if (err.message && (err.message.includes('API ключ') || err.message === 'MISSING_API_KEY')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Не вдалося з’єднатися з Gemini AI.');
}
```

---

## 6. Теми оформлення (src/theme/theme.js)
**Файл:** `src/theme/theme.js`

```javascript
export const themes = {
  dark: {
    bg: '#141218',
    card: '#211F26',
    modalBg: '#2B2930',
    text: '#E6E0E9',
    subText: '#CAC4D0',
    primary: '#D0BCFF',
    primaryText: '#381E72',
    expense: '#F2B8B5',
    income: '#A8E6CF',
    border: '#49454F',
    chipInactive: '#36343B',
    inputBg: '#1D1B20',
    statusBarStyle: 'light-content'
  },
  light: {
    bg: '#FEF7FF',
    card: '#F7F2FA',
    modalBg: '#F3EDF7',
    text: '#1D1B20',
    subText: '#49454F',
    primary: '#6750A4',
    primaryText: '#FFFFFF',
    expense: '#B3261E',
    income: '#2E7D32',
    border: '#CAC4D0',
    chipInactive: '#E7E0EC',
    inputBg: '#F3EDF7',
    statusBarStyle: 'dark-content'
  }
};
```

---

## 7. Категорії витрат, доходів та константи (src/constants.js)
**Файл:** `src/constants.js`

```javascript
export const initialCategories = [
  {
    id: 'auto',
    name: 'Авто та Транспорт',
    icon: 'car-outline',
    color: '#3B82F6',
    items: ['Пальне/Заправка', 'Авто/Обслуговування', 'Таксі', 'Громадський транспорт']
  },
  {
    id: 'food',
    name: 'Покупки та Їжа',
    icon: 'cart-outline',
    color: '#10B981',
    items: ['Продукти', 'Ресторани/Кафе', 'Одяг/Взуття', 'Техніка/Електроніка']
  },
  {
    id: 'home',
    name: 'Дім та Комуналка',
    icon: 'home-outline',
    color: '#F59E0B',
    items: ['Комуналка', 'Оренда/Дім', 'Інтернет/Зв’язок', 'Ремонт/Побут']
  },
  {
    id: 'health',
    name: 'Здоров’я та Краса',
    icon: 'medkit-outline',
    color: '#EC4899',
    items: ['Аптека/Здоров’я', 'Спорт/Фітнес', 'Краса/Догляд']
  },
  {
    id: 'entertainment',
    name: 'Розваги та Відпочинок',
    icon: 'film-outline',
    color: '#8B5CF6',
    items: ['Розваги/Кіно', 'Подорожі/Квитки', 'Подарки/Свята']
  },
  {
    id: 'finances',
    name: 'Фінанси та Послуги',
    icon: 'card-outline',
    color: '#06B6D4',
    items: ['Навчання/Курси', 'Кредити/Борги', 'Податки/Комісії']
  },
  {
    id: 'zoo',
    name: 'Тварини та Зоо',
    icon: 'paw-outline',
    color: '#EAB308',
    items: ['Тварини/Зоо']
  }
];

export const initialIncomeGroups = [
  {
    id: 'job',
    name: 'Робота та Заробіток',
    icon: 'briefcase-outline',
    color: '#10B981',
    items: ['Зарплата', 'Фріланс']
  },
  {
    id: 'passive',
    name: 'Пасивний дохід',
    icon: 'trending-up-outline',
    color: '#3B82F6',
    items: ['Дивіденди', 'Оренда']
  },
  {
    id: 'other_inc',
    name: 'Інші надходження',
    icon: 'wallet-outline',
    color: '#8B5CF6',
    items: ['Подарунок', 'Продаж']
  }
];

export const monthNames = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 
  'Травень', 'Червень', 'Липень', 'Серпень', 
  'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];
```

---

## 8. Модальне вікно ШІ-Асистента (src/components/AIAssistantModal.js)
**Файл:** `src/components/AIAssistantModal.js`

```javascript
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  KeyboardAvoidingView,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { analyzeTransactionsWithAI } from '../services/ai';

let Audio = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {}

let ImagePicker = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {}

let FileSystem = null;
try {
  FileSystem = require('expo-file-system');
} catch (e) {}

export default function AIAssistantModal({
  visible,
  onClose,
  initialTab = 'voice', // 'voice' | 'photo' | 'text'
  theme,
  isLight,
  cardBg,
  borderColor,
  categories = [],
  incomeGroups = [],
  defaultAuthor = 'Андрій',
  geminiApiKey = '',
  onSaveApiKey,
  onSaveTransactions
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [receiptSplitMode, setReceiptSplitMode] = useState('total'); // 'total' | 'items'

  // Стан запису голосу
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Стан фото
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState(null);
  const [selectedImageMime, setSelectedImageMime] = useState('image/jpeg');

  // Стан текстового вводу
  const [textInput, setTextInput] = useState('');

  // Стан ШІ-обробки та результатів
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [expandedCatItemIdx, setExpandedCatItemIdx] = useState(null);

  // Стан вводу API-ключа, якщо він ще не заданий
  const [tempApiKey, setTempApiKey] = useState(geminiApiKey || '');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const effectiveApiKey = (geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab || 'voice');
      setErrorMsg('');
      setTempApiKey(geminiApiKey || '');
      setShowKeyInput(!effectiveApiKey);
    } else {
      stopAndCleanupRecording();
    }
    return () => {
      stopAndCleanupRecording();
    };
  }, [visible, initialTab, geminiApiKey]);

  // Пульсація мікрофона під час запису
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.22,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const stopAndCleanupRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {}
      recordingRef.current = null;
    }
  };

  const startVoiceRecording = async () => {
    setErrorMsg('');
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }
    if (!Audio) {
      setErrorMsg('Модуль запису звуку (expo-av) недоступний на цьому пристрої.');
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setErrorMsg('Надайте дозвіл на використання мікрофона в налаштуваннях телефону.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setErrorMsg('Не вдалося почати запис голосу: ' + (err.message || ''));
    }
  };

  const finishVoiceRecordingAndAnalyze = async () => {
    if (!recordingRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);

    try {
      const rec = recordingRef.current;
      recordingRef.current = null;
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      if (!uri || !FileSystem) {
        setErrorMsg('Не вдалося отримати аудіофайл запису.');
        return;
      }

      setIsAnalyzing(true);
      setErrorMsg('');

      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'voice',
        audioBase64: base64Audio,
        audioMimeType: Platform.OS === 'ios' ? 'audio/mp4' : 'audio/mp4',
        categories,
        incomeGroups,
        defaultAuthor
      });

      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('ШІ не знайшов суми витрат у записі. Спробуйте сказати чіткіше, наприклад: «Продукти АТБ 450 гривень».');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка розпізнавання голосу.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePickImage = async (useCamera = false) => {
    setErrorMsg('');
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }
    if (!ImagePicker) {
      setErrorMsg('Модуль камери/галереї (expo-image-picker) недоступний.');
      return;
    }

    try {
      if (useCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.status !== 'granted') {
          setErrorMsg('Надайте дозвіл на використання камери.');
          return;
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libPerm.status !== 'granted') {
          setErrorMsg('Надайте дозвіл на доступ до галереї фото.');
          return;
        }
      }

      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true
      };

      const res = useCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      let base64Data = asset.base64;
      if (!base64Data && asset.uri && FileSystem) {
        base64Data = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64
        });
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      setSelectedImageUri(asset.uri);
      setSelectedImageBase64(base64Data);
      setSelectedImageMime(mimeType);

      // Одразу запускаємо аналіз фото через Gemini
      await runPhotoAnalysis(base64Data, mimeType, receiptSplitMode);
    } catch (err) {
      setErrorMsg('Помилка завантаження фото: ' + (err.message || ''));
    }
  };

  const runPhotoAnalysis = async (base64Data, mimeType, splitMode) => {
    if (!base64Data) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'photo',
        receiptSplitMode: splitMode,
        imageBase64: base64Data,
        imageMimeType: mimeType || 'image/jpeg',
        textInput,
        categories,
        incomeGroups,
        defaultAuthor
      });
      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('Не вдалося знайти суми на фото. Спробуйте зробити чіткіший знімок чека.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка аналізу фото.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeText = async () => {
    if (!textInput.trim()) {
      setErrorMsg('Введіть текст витрати, наприклад: «АТБ 650, кава 90, заправка 1500»');
      return;
    }
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'text',
        textInput,
        categories,
        incomeGroups,
        defaultAuthor
      });
      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('Не вдалося виділити суми з тексту. Вкажіть суму цифрами.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка аналізу тексту.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateParsedItem = (index, updates) => {
    setParsedItems(prev => prev.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const handleRemoveParsedItem = (index) => {
    setParsedItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleConfirmAll = () => {
    const valid = parsedItems.filter(i => Number(i.amount) > 0);
    if (valid.length === 0) return;
    onSaveTransactions && onSaveTransactions(valid);
    setParsedItems([]);
    setTranscript('');
    setSelectedImageUri(null);
    setSelectedImageBase64(null);
    setTextInput('');
    onClose && onClose();
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const totalParsedSum = parsedItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: cardBg,
              borderColor,
              borderTopWidth: 1,
              maxHeight: '90%'
            }
          ]}
        >
          {/* Індикатор шторки + Заголовок */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.subText, opacity: 0.3 }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary + '22', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="sparkles" size={18} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.fontBold, { color: theme.text, fontSize: 16 }]}>ШІ-Асистент витрат</Text>
                <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11 }]}>
                  Голосовий ввід, сканер чеків та смарт-розбір
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShowKeyInput(!showKeyInput)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: effectiveApiKey ? theme.income + '18' : theme.expense + '22'
                }}
              >
                <Ionicons
                  name="key-outline"
                  size={15}
                  color={effectiveApiKey ? theme.income : theme.expense}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Блок налаштування ключа Gemini API (якщо ще не введений або відкритий користувачем) */}
            {showKeyInput && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 12,
                    marginBottom: 14
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>
                    🔑 Ключ Google Gemini API (спільний для сім’ї)
                  </Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                    <Text style={[styles.fontBold, { color: theme.primary, fontSize: 11 }]}>Отримати безкоштовно ↗</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Вставте ключ один раз — він збережеться у хмарі Firebase і працюватиме на обох телефонах.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    placeholder="AIzaSy..."
                    placeholderTextColor={theme.subText}
                    value={tempApiKey}
                    onChangeText={setTempApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.fontSemi,
                      {
                        flex: 1,
                        backgroundColor: cardBg,
                        color: theme.text,
                        borderColor,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 12
                      }
                    ]}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      onSaveApiKey && onSaveApiKey(tempApiKey.trim());
                      setShowKeyInput(false);
                      setErrorMsg('');
                    }}
                    style={{
                      backgroundColor: theme.primary,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Перемикач режимів: Голос / Фото чека / Текст */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[
                { key: 'voice', label: 'Голосом', icon: 'mic' },
                { key: 'photo', label: 'По фото', icon: 'camera' },
                { key: 'text', label: 'Текстом', icon: 'chatbubble-ellipses' }
              ].map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      setActiveTab(tab.key);
                      setErrorMsg('');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 11,
                        backgroundColor: isActive ? theme.primary : theme.inputBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Ionicons name={tab.icon} size={16} color={isActive ? theme.primaryText : theme.text} />
                    <Text style={[styles.fontBold, { color: isActive ? theme.primaryText : theme.text, fontSize: 12 }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* РЕЖИМ 1: ГОЛОСОВЕ ДОДАВАННЯ */}
            {activeTab === 'voice' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 12, textAlign: 'center', marginBottom: 16 }]}>
                  {isRecording
                    ? 'Говоріть... Наприклад: «Заправив авто на 1200 грн і купив каву за 85 грн»'
                    : 'Натисніть на мікрофон і скажіть одну або кілька витрат чи доходів'}
                </Text>

                <View style={{ justifyContent: 'center', alignItems: 'center', marginVertical: 8 }}>
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      backgroundColor: isRecording ? theme.expense + '28' : theme.primary + '18',
                      transform: [{ scale: pulseAnim }]
                    }}
                  />
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={isRecording ? finishVoiceRecordingAndAnalyze : startVoiceRecording}
                    disabled={isAnalyzing}
                    style={{
                      width: 78,
                      height: 78,
                      borderRadius: 39,
                      backgroundColor: isRecording ? theme.expense : theme.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      elevation: 6
                    }}
                  >
                    <Ionicons
                      name={isRecording ? 'stop' : 'mic'}
                      size={34}
                      color={isRecording ? '#FFF' : theme.primaryText}
                    />
                  </TouchableOpacity>
                </View>

                {isRecording ? (
                  <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <Text style={[styles.fontBold, { color: theme.expense, fontSize: 16 }]}>
                      ● {formatTimer(recordingSeconds)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                      <TouchableOpacity
                        onPress={stopAndCleanupRecording}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 12,
                          backgroundColor: cardBg,
                          borderColor,
                          borderWidth: 1
                        }}
                      >
                        <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 12 }]}>Скасувати</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={finishVoiceRecordingAndAnalyze}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 12,
                          backgroundColor: theme.primary
                        }}
                      >
                        <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>
                          Розпізнати ✨
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={[styles.fontBold, { color: theme.primary, fontSize: 12, marginTop: 10 }]}>
                    Торкніться, щоб почати запис
                  </Text>
                )}
              </View>
            )}

            {/* РЕЖИМ 2: ДОДАВАННЯ ПО ФОТО ЧЕКА АБО СКРІНШОТУ */}
            {activeTab === 'photo' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 16,
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Як розпізнавати чек:
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setReceiptSplitMode('total');
                      if (selectedImageBase64) runPhotoAnalysis(selectedImageBase64, selectedImageMime, 'total');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: receiptSplitMode === 'total' ? theme.primary : cardBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.fontBold,
                        { color: receiptSplitMode === 'total' ? theme.primaryText : theme.text, fontSize: 11 }
                      ]}
                    >
                      🧾 Загальною сумою
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setReceiptSplitMode('items');
                      if (selectedImageBase64) runPhotoAnalysis(selectedImageBase64, selectedImageMime, 'items');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: receiptSplitMode === 'items' ? theme.primary : cardBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.fontBold,
                        { color: receiptSplitMode === 'items' ? theme.primaryText : theme.text, fontSize: 11 }
                      ]}
                    >
                      🛒 По позиціях/категоріях
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePickImage(true)}
                    disabled={isAnalyzing}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        backgroundColor: theme.primary,
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }
                    ]}
                  >
                    <Ionicons name="camera" size={26} color={theme.primaryText} />
                    <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>
                      Камера (Чек)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePickImage(false)}
                    disabled={isAnalyzing}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        backgroundColor: cardBg,
                        borderColor,
                        borderWidth: 1,
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }
                    ]}
                  >
                    <Ionicons name="images" size={26} color={theme.primary} />
                    <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>
                      Галерея / Скріншот
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedImageUri && (
                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Image
                      source={{ uri: selectedImageUri }}
                      style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: cardBg }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>Фото завантажено</Text>
                      <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11 }]}>
                        Ви можете перефотографувати або змінити режим розбору вище
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => runPhotoAnalysis(selectedImageBase64, selectedImageMime, receiptSplitMode)}
                      style={{
                        backgroundColor: theme.primary + '22',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 10
                      }}
                    >
                      <Ionicons name="refresh" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* РЕЖИМ 3: ТЕКСТОВИЙ СМАРТ-ВВІД */}
            {activeTab === 'text' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 14,
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Напишіть або надиктуйте клавіатурою кілька витрат у довільній формі:
                </Text>
                <TextInput
                  placeholder="Напр.: АТБ продукти 640, кава 85, таксі Uklon 190"
                  placeholderTextColor={theme.subText}
                  value={textInput}
                  onChangeText={setTextInput}
                  multiline
                  style={[
                    styles.fontSemi,
                    {
                      backgroundColor: cardBg,
                      color: theme.text,
                      borderColor,
                      borderWidth: 1,
                      borderRadius: 14,
                      padding: 12,
                      minHeight: 72,
                      fontSize: 13,
                      textAlignVertical: 'top',
                      marginBottom: 10
                    }
                  ]}
                />
                <TouchableOpacity
                  onPress={handleAnalyzeText}
                  disabled={isAnalyzing}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.primary,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8
                    }
                  ]}
                >
                  <Ionicons name="sparkles" size={16} color={theme.primaryText} />
                  <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 13 }]}>
                    Розібрати через ШІ
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Індикатор завантаження під час аналізу Gemini */}
            {isAnalyzing && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 16
                  }
                ]}
              >
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.fontBold, { color: theme.text, fontSize: 13, marginTop: 10 }]}>
                  ШІ аналізує та підбирає категорії...
                </Text>
              </View>
            )}

            {/* Повідомлення про помилку */}
            {!!errorMsg && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.expense + '18',
                    borderColor: theme.expense + '44',
                    borderWidth: 1,
                    padding: 12,
                    marginBottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8
                  }
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={theme.expense} />
                <Text style={[styles.fontSemi, { color: theme.expense, fontSize: 12, flex: 1 }]}>
                  {errorMsg}
                </Text>
              </View>
            )}

            {/* Розпізнаний текст / транскрипція */}
            {!!transcript && !isAnalyzing && (
              <View
                style={{
                  backgroundColor: theme.primary + '12',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Ionicons name="chatbubble-outline" size={15} color={theme.primary} />
                <Text style={[styles.fontSemi, { color: theme.text, fontSize: 11, flex: 1 }]}>
                  «{transcript}»
                </Text>
              </View>
            )}

            {/* СПИСОК РОЗПІЗНАНИХ ОПЕРАЦІЙ ДЛЯ ПЕРЕВІРКИ ТА ЗБЕРЕЖЕННЯ */}
            {parsedItems.length > 0 && !isAnalyzing && (
              <View style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.fontBold, { color: theme.text, fontSize: 14 }]}>
                    Розпізнані операції ({parsedItems.length}):
                  </Text>
                  <Text style={[styles.fontBold, { color: theme.primary, fontSize: 13 }]}>
                    Разом: {totalParsedSum.toLocaleString('uk-UA')} ₴
                  </Text>
                </View>

                {parsedItems.map((item, idx) => {
                  const isIncome = item.type === 'income';
                  const groupList = isIncome
                    ? incomeGroups.filter(g => !g.isHidden)
                    : categories.filter(c => !c.isHidden);
                  const parentGroup =
                    groupList.find(g => g.id === item.mainCategoryId || (g.items && g.items.includes(item.category))) ||
                    groupList[0];
                  const itemColor = parentGroup?.color || (isIncome ? theme.income : theme.primary);
                  const itemIcon = parentGroup?.icon || (isIncome ? 'wallet-outline' : 'pricetag-outline');
                  const isCatExpanded = expandedCatItemIdx === idx;

                  return (
                    <View
                      key={item.id || idx}
                      style={[
                        styles.card,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor,
                          borderWidth: 1,
                          padding: 12,
                          marginBottom: 10
                        }
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        {/* Іконка + Вибір підкатегорії */}
                        <TouchableOpacity
                          onPress={() => setExpandedCatItemIdx(isCatExpanded ? null : idx)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              backgroundColor: itemColor + '22',
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                          >
                            <Ionicons name={itemIcon} size={18} color={itemColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={[styles.fontBold, { color: theme.text, fontSize: 13 }]} numberOfLines={1}>
                                {item.category}
                              </Text>
                              <Ionicons name={isCatExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.subText} />
                            </View>
                            <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 10 }]}>
                              {parentGroup?.name || 'Категорія'} • Торкніться для зміни
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Поле суми */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TextInput
                            value={String(item.amount)}
                            keyboardType="numeric"
                            onChangeText={val => {
                              const num = parseFloat(val.replace(',', '.')) || 0;
                              handleUpdateParsedItem(idx, { amount: num });
                            }}
                            style={[
                              styles.fontBold,
                              {
                                backgroundColor: cardBg,
                                color: isIncome ? theme.income : theme.text,
                                borderColor,
                                borderWidth: 1,
                                borderRadius: 10,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                minWidth: 74,
                                textAlign: 'right',
                                fontSize: 14
                              }
                            ]}
                          />
                          <Text style={[styles.fontBold, { color: theme.subText, fontSize: 13 }]}>₴</Text>
                        </View>

                        {/* Видалити позицію */}
                        <TouchableOpacity
                          onPress={() => handleRemoveParsedItem(idx)}
                          style={{ padding: 6 }}
                        >
                          <Ionicons name="trash-outline" size={18} color={theme.expense} />
                        </TouchableOpacity>
                      </View>

                      {/* Розгорнутий вибір категорії, якщо користувач хоче підправити */}
                      {isCatExpanded && (
                        <View
                          style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTopWidth: 1,
                            borderTopColor: borderColor
                          }}
                        >
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            <TouchableOpacity
                              onPress={() => {
                                const firstExp = categories.filter(c => !c.isHidden)[0];
                                handleUpdateParsedItem(idx, {
                                  type: 'expense',
                                  mainCategoryId: firstExp?.id || 'food',
                                  category: firstExp?.items?.[0] || 'Продукти'
                                });
                              }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: !isIncome ? theme.expense : cardBg
                              }}
                            >
                              <Text style={[styles.fontBold, { color: !isIncome ? '#FFF' : theme.text, fontSize: 11 }]}>
                                Витрата
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                const firstInc = incomeGroups.filter(g => !g.isHidden)[0];
                                handleUpdateParsedItem(idx, {
                                  type: 'income',
                                  mainCategoryId: firstInc?.id || 'job',
                                  category: firstInc?.items?.[0] || 'Зарплата'
                                });
                              }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: isIncome ? theme.income : cardBg
                              }}
                            >
                              <Text style={[styles.fontBold, { color: isIncome ? '#FFF' : theme.text, fontSize: 11 }]}>
                                Дохід
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {groupList.map(grp =>
                              (grp.items || []).map(sub => {
                                const selected = item.category === sub;
                                return (
                                  <TouchableOpacity
                                    key={`${grp.id}_${sub}`}
                                    onPress={() => {
                                      handleUpdateParsedItem(idx, {
                                        mainCategoryId: grp.id,
                                        category: sub
                                      });
                                      setExpandedCatItemIdx(null);
                                    }}
                                    style={{
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      borderRadius: 10,
                                      backgroundColor: selected ? theme.primary : cardBg,
                                      borderColor,
                                      borderWidth: 1
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.fontSemi,
                                        { color: selected ? theme.primaryText : theme.text, fontSize: 11 }
                                      ]}
                                    >
                                      {sub}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })
                            )}
                          </View>
                        </View>
                      )}

                      {/* Нижній рядок: Коментар + Автор */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <TextInput
                          placeholder="Коментар (магазин, деталі)..."
                          placeholderTextColor={theme.subText}
                          value={item.note || ''}
                          onChangeText={val => handleUpdateParsedItem(idx, { note: val })}
                          style={[
                            styles.fontRegular,
                            {
                              flex: 1,
                              backgroundColor: cardBg,
                              color: theme.text,
                              borderColor,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              fontSize: 11
                            }
                          ]}
                        />
                        <TouchableOpacity
                          onPress={() =>
                            handleUpdateParsedItem(idx, {
                              author: item.author === 'Андрій' ? 'Людмила' : 'Андрій'
                            })
                          }
                          style={{
                            backgroundColor: cardBg,
                            borderColor,
                            borderWidth: 1,
                            borderRadius: 10,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Ionicons name="person-outline" size={12} color={theme.primary} />
                          <Text style={[styles.fontBold, { color: theme.primary, fontSize: 11 }]}>
                            {item.author}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleConfirmAll}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.primary,
                      paddingVertical: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                      marginTop: 6
                    }
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={20} color={theme.primaryText} />
                  <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 14 }]}>
                    Додати у бюджет ({parsedItems.length}) • {totalParsedSum.toLocaleString('uk-UA')} ₴
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fontRegular: { fontWeight: '400' },
  fontSemi: { fontWeight: '600' },
  fontBold: { fontWeight: '700' },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20
  },
  card: {
    borderRadius: 16
  }
});
```

---

## 9. Головний екран: 40% Дашборд-хаб, ШІ-віджет та список операцій (src/screens/CurrentMonthScreen.js)
**Файл:** `src/screens/CurrentMonthScreen.js`

```javascript
import React, { useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Плашки жорстко займають ~38-40% висоти екрану при початковому завантаженні
const HEADER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.38);
const SCROLL_DISTANCE = HEADER_HEIGHT - 30;

export default function CurrentMonthScreen({ 
  theme, 
  isLight, 
  bgColor, 
  cardBg, 
  borderColor, 
  hideBalance, 
  transactions = [], 
  categories = [], 
  incomeGroups = [], 
  showIcons = true, 
  globalUserFilter = 'all', 
  showBudgetWidget = true, 
  plannedIncome = 0, 
  categoryLimits = {}, 
  personalCategoryLimits = {}, 
  budgetMode = 'shared', 
  handleOpenEditModal, 
  promptDelete, 
  onNavigate,
  onOpenAI
}) {
  const now = new Date();
  const scrollY = useRef(new Animated.Value(0)).current;

  // Анімація двоступеневого скролу (нативні 60/120 fps без мерехтіння)
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, -SCROLL_DISTANCE],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE * 0.65, SCROLL_DISTANCE],
    outputRange: [1, 0.25, 0],
    extrapolate: 'clamp',
  });

  const headerScale = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  });

  // Фільтрація операцій поточного місяця
  const monthTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (globalUserFilter !== 'all' && t.author !== globalUserFilter) return false;
      if (t.rawDate) {
        const parts = t.rawDate.split('-');
        if (parts.length === 3) {
          return parseInt(parts[0], 10) === now.getFullYear() && parseInt(parts[1], 10) - 1 === now.getMonth();
        }
      }
      return true;
    });
  }, [transactions, globalUserFilter]);

  // Підрахунок доходів, витрат та балансу
  let totalIncome = 0;
  let totalExpense = 0;
  monthTransactions.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
  });
  const balance = totalIncome - totalExpense;

  // Розрахунок ліміту бюджету
  let actualLimit = plannedIncome || 0;
  if (actualLimit === 0) {
    const activeLimits = budgetMode === 'shared' 
      ? categoryLimits 
      : (personalCategoryLimits[globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'] || {});
    actualLimit = Object.values(activeLimits).reduce((a, b) => a + (Number(b) || 0), 0);
  }

  const budgetPercent = actualLimit > 0 ? (totalExpense / actualLimit) * 100 : 0;
  const isOverBudget = totalExpense > actualLimit && actualLimit > 0;
  const barColor = isOverBudget ? theme.expense : (budgetPercent > 80 ? '#F59E0B' : theme.primary);
  const remaining = actualLimit > 0 ? (actualLimit - totalExpense) : 0;

  // Побудова графіка тренду балансу (SVG Wave / Sparkline)
  const trendData = useMemo(() => {
    const chartW = showBudgetWidget ? 120 : 280;
    const chartH = 46;

    const sorted = [...monthTransactions]
      .filter(t => t.rawDate)
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));

    let points = [];
    if (sorted.length === 0) {
      points = [0, 10, 15, 25, 22, 35, 40];
    } else {
      let running = 0;
      sorted.forEach(t => {
        running += (t.type === 'income' ? t.amount : -t.amount);
        points.push(running);
      });
      if (points.length === 1) points = [0, points[0]];
      if (points.length > 10) {
        const step = (points.length - 1) / 9;
        const sampled = [];
        for (let i = 0; i < 9; i++) {
          sampled.push(points[Math.round(i * step)]);
        }
        sampled.push(points[points.length - 1]);
        points = sampled;
      }
    }

    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;
    const paddingY = 6;
    const usableH = chartH - paddingY * 2;
    const stepX = chartW / (points.length - 1);

    const coords = points.map((val, idx) => ({
      x: Math.round(idx * stepX),
      y: Math.round(chartH - paddingY - ((val - minVal) / range) * usableH),
    }));

    let linePath = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpX = Math.round((prev.x + curr.x) / 2);
      linePath += ` C ${cpX} ${prev.y}, ${cpX} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${chartH} L ${coords[0].x} ${chartH} Z`;
    const lastCoord = coords[coords.length - 1];

    return { chartW, chartH, linePath, areaPath, lastCoord };
  }, [monthTransactions, showBudgetWidget]);

  // Параметри кільцевої діаграми бюджету (Donut Chart)
  const donutSize = 74;
  const donutStroke = 8;
  const donutRadius = (donutSize - donutStroke) / 2;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const clampedPercent = Math.min(Math.max(budgetPercent, 0), 100);
  const strokeDashoffset = donutCircumference - (clampedPercent / 100) * donutCircumference;

  const getCatData = (mainCatId, subCat, type) => {
    if (type === 'income') return incomeGroups.find(g => g.id === mainCatId || (g.items && g.items.includes(subCat)));
    return categories.find(c => c.id === mainCatId || (c.items && c.items.includes(subCat)));
  };

  return (
    <View style={{ flex: 1 }}>
      
      {/* 40% ЕКРАНУ: ВЕЛИКИЙ ДАШБОРД-ХАБ (АКТИВНІ ПОРТАЛИ В АНАЛІТИКУ ТА БЮДЖЕТ) */}
      <Animated.View 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          height: HEADER_HEIGHT, 
          paddingHorizontal: 16, 
          paddingTop: 8,
          zIndex: 10,
          transform: [{ translateY: headerTranslateY }, { scale: headerScale }], 
          opacity: headerOpacity 
        }}
        pointerEvents="box-none"
      >
        <View style={{ flexDirection: 'row', gap: 12, height: HEADER_HEIGHT - 16 }}>
          
          {/* ПОРТАЛ 1: ПЛАШКА БАЛАНСУ -> Перехід в AnalyticsScreen */}
          <TouchableOpacity 
            activeOpacity={0.85} 
            onPress={() => onNavigate && onNavigate('analytics')} 
            style={[
              styles.premiumCard, 
              { 
                flex: showBudgetWidget ? 1 : 2, 
                backgroundColor: cardBg, 
                borderColor, 
                borderWidth: 1, 
                padding: 16, 
                justifyContent: 'space-between' 
              }
            ]}
          >
            {/* Заголовок плашки та індикатор переходу */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="wallet-outline" size={14} color={theme.primary} />
                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, textTransform: 'uppercase' }]}>
                  {showBudgetWidget ? 'Баланс' : 'Баланс за місяць'}
                </Text>
              </View>
              <View style={[styles.portalBadge, { backgroundColor: theme.primary + '18' }]}>
                <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 9 }]}>Аналітика</Text>
                <Ionicons name="arrow-forward" size={10} color={theme.primary} />
              </View>
            </View>

            {/* Основне значення балансу */}
            <View style={{ marginVertical: 4 }}>
              <Text 
                style={[
                  styles.fontJakartaBold, 
                  { 
                    color: balance >= 0 ? theme.text : theme.expense, 
                    fontSize: showBudgetWidget ? 24 : 30 
                  }
                ]} 
                numberOfLines={1} 
                adjustsFontSizeToFit
              >
                {hideBalance ? '••••••' : `${balance >= 0 ? '+' : ''}${balance.toLocaleString('uk-UA')} ₴`}
              </Text>
            </View>

            {/* ВІЗУАЛІЗАЦІЯ: SVG-лінія тренду (хвиля динаміки за місяць) */}
            <View style={{ alignItems: 'center', marginVertical: 2, overflow: 'hidden' }}>
              <Svg width={trendData.chartW} height={trendData.chartH} viewBox={`0 0 ${trendData.chartW} ${trendData.chartH}`}>
                <Defs>
                  <SvgLinearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={balance >= 0 ? theme.income : theme.expense} stopOpacity="0.4" />
                    <Stop offset="1" stopColor={balance >= 0 ? theme.income : theme.expense} stopOpacity="0.0" />
                  </SvgLinearGradient>
                </Defs>
                <Path d={trendData.areaPath} fill="url(#balanceGrad)" />
                <Path 
                  d={trendData.linePath} 
                  fill="none" 
                  stroke={balance >= 0 ? theme.income : theme.expense} 
                  strokeWidth="2.5" 
                  strokeLinecap="round" 
                />
                <Circle 
                  cx={trendData.lastCoord.x} 
                  cy={trendData.lastCoord.y} 
                  r="3.5" 
                  fill={balance >= 0 ? theme.income : theme.expense} 
                />
              </Svg>
            </View>
            
            {/* Міні-підсумки доходів та витрат */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 8 }}>
              <View>
                <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 9, marginBottom: 1 }]}>Дохід</Text>
                <Text style={[styles.fontJakartaBold, { color: theme.income, fontSize: 12 }]}>
                  {hideBalance ? '••••' : `+${totalIncome.toLocaleString('uk-UA')}`}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 9, marginBottom: 1 }]}>Витрати</Text>
                <Text style={[styles.fontJakartaBold, { color: theme.expense, fontSize: 12 }]}>
                  {hideBalance ? '••••' : `-${totalExpense.toLocaleString('uk-UA')}`}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* ПОРТАЛ 2: ПЛАШКА БЮДЖЕТУ -> Перехід в BudgetScreen */}
          {showBudgetWidget && (
            <TouchableOpacity 
              activeOpacity={0.85} 
              onPress={() => onNavigate && onNavigate('budget')} 
              style={[
                styles.premiumCard, 
                { 
                  flex: 1, 
                  backgroundColor: cardBg, 
                  borderColor, 
                  borderWidth: 1, 
                  padding: 16, 
                  justifyContent: 'space-between' 
                }
              ]}
            >
              {/* Заголовок плашки та індикатор переходу */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="pie-chart-outline" size={14} color={barColor} />
                  <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, textTransform: 'uppercase' }]}>
                    Бюджет
                  </Text>
                </View>
                <View style={[styles.portalBadge, { backgroundColor: barColor + '18' }]}>
                  <Text style={[styles.fontJakartaBold, { color: barColor, fontSize: 9 }]}>Бюджет</Text>
                  <Ionicons name="arrow-forward" size={10} color={barColor} />
                </View>
              </View>
              
              {/* ВІЗУАЛІЗАЦІЯ: Кільцева діаграма (Donut Chart) */}
              <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 2 }}>
                <View style={{ width: donutSize, height: donutSize, justifyContent: 'center', alignItems: 'center' }}>
                  <Svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
                    {/* Фонове кільце */}
                    <Circle
                      cx={donutSize / 2}
                      cy={donutSize / 2}
                      r={donutRadius}
                      stroke={theme.inputBg || '#2A2A2A'}
                      strokeWidth={donutStroke}
                      fill="none"
                    />
                    {/* Прогрес-кільце витрат */}
                    <Circle
                      cx={donutSize / 2}
                      cy={donutSize / 2}
                      r={donutRadius}
                      stroke={barColor}
                      strokeWidth={donutStroke}
                      fill="none"
                      strokeDasharray={donutCircumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                      transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                    />
                  </Svg>
                  {/* Відсоток у центрі кільця */}
                  <View style={[StyleSheet.absoluteFillObject, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={[styles.fontJakartaBold, { color: isOverBudget ? theme.expense : theme.text, fontSize: 13 }]}>
                      {actualLimit === 0 ? '—' : `${Math.round(budgetPercent)}%`}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Залишок / ліміт бюджету */}
              <View style={{ borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 9 }]}>
                    {isOverBudget ? 'Перевитрата:' : 'Залишок:'}
                  </Text>
                  <Text 
                    style={[
                      styles.fontJakartaBold, 
                      { 
                        color: isOverBudget ? theme.expense : theme.income, 
                        fontSize: 11 
                      }
                    ]} 
                    numberOfLines={1}
                  >
                    {hideBalance ? '••••' : (actualLimit === 0 ? 'Не вказано' : `${remaining.toLocaleString('uk-UA')} ₴`)}
                  </Text>
                </View>
                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 8, marginTop: 1, textAlign: 'right' }]} numberOfLines={1}>
                  {actualLimit === 0 ? 'Натисніть для налаштування' : `з ліміту ${actualLimit.toLocaleString('uk-UA')} ₴`}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* 60% ЕКРАНУ: ІМЕРСИВНИЙ СПИСОК ОПЕРАЦІЙ ЗІ ЗГОРТАННЯМ ПЛАШОК НА 100% */}
      <View style={{ flex: 1 }}>
        <Animated.ScrollView 
          showsVerticalScrollIndicator={false} 
          style={{ flex: 1 }} 
          contentContainerStyle={{ 
            paddingTop: HEADER_HEIGHT + 6, 
            paddingHorizontal: 16, 
            paddingBottom: 110 
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }], 
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
          {/* ШІ-ВІДЖЕТ ШВИДКОГО ДОДАВАННЯ: ГОЛОС / ФОТО ЧЕКА / ТЕКСТ */}
          <View
            style={[
              styles.premiumCard,
              {
                backgroundColor: cardBg,
                borderColor,
                borderWidth: 1,
                padding: 12,
                marginBottom: 14
              }
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={14} color={theme.primary} />
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 12 }]}>
                  ШІ-додавання витрат
                </Text>
              </View>
              <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 10 }]}>
                Голос • Чек • Текст
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onOpenAI && onOpenAI('voice')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: theme.primary
                }}
              >
                <Ionicons name="mic" size={16} color={theme.primaryText} />
                <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>
                  Голосом
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onOpenAI && onOpenAI('photo')}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: theme.inputBg,
                  borderColor,
                  borderWidth: 1
                }}
              >
                <Ionicons name="camera-outline" size={16} color={theme.primary} />
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 12 }]}>
                  По фото
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => onOpenAI && onOpenAI('text')}
                style={{
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  borderRadius: 14,
                  backgroundColor: theme.inputBg,
                  borderColor,
                  borderWidth: 1
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.primary} />
                <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 11 }]}>
                  Текст
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginLeft: 4 }}>
            <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14 }]}>
              Останні операції
            </Text>
            <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>
              {monthTransactions.length} {monthTransactions.length === 1 ? 'запис' : 'записів'}
            </Text>
          </View>

          {monthTransactions.length === 0 ? (
            <View style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 32, alignItems: 'center', marginTop: 10 }]}>
              <Ionicons name="receipt-outline" size={36} color={theme.subText} style={{ marginBottom: 8 }} />
              <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, marginBottom: 4 }]}>
                Немає операцій за цей місяць
              </Text>
              <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 12, textAlign: 'center' }]}>
                Торкніться значка «+» внизу, щоб додати першу витрату чи дохід
              </Text>
            </View>
          ) : (
            monthTransactions.map(item => {
              const parentCat = getCatData(item.mainCategoryId, item.category, item.type);
              const iconName = parentCat ? parentCat.icon : (item.type === 'expense' ? 'pricetag-outline' : 'wallet-outline');
              const baseColor = (parentCat && parentCat.color) ? parentCat.color : (item.type === 'income' ? theme.income : theme.expense);

              return (
                <TouchableOpacity 
                  key={item.id} 
                  activeOpacity={0.7} 
                  onPress={() => handleOpenEditModal && handleOpenEditModal(item)} 
                  style={[
                    styles.premiumCard, 
                    { 
                      backgroundColor: cardBg, 
                      borderColor, 
                      borderWidth: 1, 
                      paddingVertical: 14, 
                      paddingHorizontal: 14, 
                      marginBottom: 10, 
                      flexDirection: 'row', 
                      alignItems: 'center', 
                      justifyContent: 'space-between' 
                    }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    {showIcons && (
                      <View style={[styles.iconCircle, { backgroundColor: baseColor + '18' }]}>
                        <Ionicons name={iconName} size={20} color={baseColor} />
                      </View>
                    )}
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, marginBottom: 2 }]}>
                        {item.category}
                      </Text>
                      <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 10 }]} numberOfLines={1}>
                        {item.note ? `${item.note} • ` : ''}{item.author} • {item.date}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.fontJakartaBold, { color: item.type === 'income' ? theme.income : theme.text, fontSize: 15 }]}>
                    {hideBalance ? '••••' : `${item.type === 'income' ? '+' : '-'}${item.amount.toLocaleString('uk-UA')} ₴`}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </Animated.ScrollView>

        {/* Плавні маски градієнту зверху та знизу */}
        <LinearGradient 
          colors={[bgColor, bgColor + '00']} 
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16 }} 
          pointerEvents="none" 
        />
        <LinearGradient 
          colors={[bgColor + '00', bgColor]} 
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 }} 
          pointerEvents="none" 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaSemi: { fontWeight: '600' },
  fontJakartaBold: { fontWeight: '700' },
  premiumCard: { 
    borderRadius: 20, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 6, 
    elevation: 2 
  },
  portalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
```

---

## 10. Екран річної аналітики (src/screens/AnalyticsScreen.js)
**Файл:** `src/screens/AnalyticsScreen.js`

```javascript
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function AnalyticsScreen({ 
  theme, 
  isLight, 
  bgColor, 
  cardBg, 
  borderColor, 
  hideBalance, 
  transactions = [], 
  categories = [], 
  incomeGroups = [], 
  showIcons = true, 
  globalUserFilter = 'all', 
  onBack 
}) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Фільтруємо операції поточного року
  const yearTransactions = transactions.filter(t => {
    if (globalUserFilter !== 'all' && t.author !== globalUserFilter) return false;
    if (t.rawDate) {
      const parts = t.rawDate.split('-');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) === currentYear;
      }
    }
    return true;
  });

  let yearIncome = 0;
  let yearExpense = 0;
  yearTransactions.forEach(t => {
    if (t.type === 'income') yearIncome += t.amount;
    else yearExpense += t.amount;
  });
  const yearBalance = yearIncome - yearExpense;

  const bg = cardBg || theme.card;
  const border = borderColor || theme.border;

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 }}>
      {/* Верхня панель з кнопкою «Назад» */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {onBack ? (
          <TouchableOpacity 
            onPress={onBack} 
            style={[styles.backBtn, { backgroundColor: bg, borderColor: border, borderWidth: 1 }]}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 38 }} />}
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18 }]}>
          Аналітика за {currentYear} рік
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={[styles.card, { backgroundColor: bg, borderColor: border, padding: 16, marginBottom: 14 }]}>
        <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11, marginBottom: 4 }]}>Річний баланс</Text>
        <Text style={[styles.fontJakartaBold, { color: yearBalance >= 0 ? theme.income : theme.expense, fontSize: 26, marginBottom: 14 }]}>
          {hideBalance ? '••••••' : `${yearBalance.toLocaleString('uk-UA')} ₴`}
        </Text>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: border, paddingTop: 12 }}>
          <View>
            <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10, marginBottom: 2 }]}>Доходи за рік</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.income, fontSize: 14 }]}>
              {hideBalance ? '••••' : `+${yearIncome.toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10, marginBottom: 2 }]}>Витрати за рік</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.expense, fontSize: 14 }]}>
              {hideBalance ? '••••' : `-${yearExpense.toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: bg, borderColor: border, padding: 24, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="bar-chart-outline" size={36} color={theme.primary} style={{ marginBottom: 10 }} />
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, textAlign: 'center', marginBottom: 6 }]}>
          Розподіл витрат за категоріями
        </Text>
        <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
          Тут відображається деталізована статистика та графіки розподілу витрат і доходів за поточний рік.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaBold: { fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
```

---

## 11. Екран планування бюджету (src/screens/BudgetScreen.js)
**Файл:** `src/screens/BudgetScreen.js`

```javascript
import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function BudgetScreen({ 
  theme, 
  isLight, 
  bgColor, 
  cardBg, 
  borderColor, 
  hideBalance, 
  transactions = [], 
  categories = [], 
  showIcons = true, 
  globalUserFilter = 'all', 
  categoryLimits = {}, 
  personalCategoryLimits = {}, 
  plannedIncome = 0, 
  budgetMode = 'shared', 
  handleUpdateLimit, 
  handleUpdatePlannedIncome, 
  handleCopyLastMonthExpenses, 
  onBack, 
  updateSettings 
}) {
  const [editingCat, setEditingCat] = useState(null);
  const [limitInput, setLimitInput] = useState('');
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Фільтруємо витрати поточного місяця
  const monthExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    if (globalUserFilter !== 'all' && t.author !== globalUserFilter) return false;
    if (t.rawDate) {
      const parts = t.rawDate.split('-');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) - 1 === currentMonth;
      }
    }
    return true;
  });

  // Підрахунок витрат по категоріях
  const expenseByCat = {};
  monthExpenses.forEach(t => {
    expenseByCat[t.category] = (expenseByCat[t.category] || 0) + t.amount;
  });

  const activeLimits = budgetMode === 'shared' 
    ? categoryLimits 
    : (personalCategoryLimits[globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'] || {});

  const totalSpent = Object.values(expenseByCat).reduce((a, b) => a + b, 0);
  const totalLimit = Object.values(activeLimits).reduce((a, b) => a + (Number(b) || 0), 0);

  const startEditLimit = (catName, currentLim) => {
    setEditingCat(catName);
    setLimitInput(currentLim ? currentLim.toString() : '');
  };

  const saveLimit = (catName) => {
    if (handleUpdateLimit) {
      handleUpdateLimit(catName, limitInput);
    }
    setEditingCat(null);
    setLimitInput('');
  };

  const savePlannedIncome = () => {
    if (handleUpdatePlannedIncome) {
      handleUpdatePlannedIncome(incomeInput);
    }
    setEditingIncome(false);
    setIncomeInput('');
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 }}>
      
      {/* Верхня панель з кнопкою «Назад» */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <TouchableOpacity 
          onPress={onBack} 
          style={[styles.backBtn, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18 }]}>
          Планування Бюджету
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Перемикач режиму: Спільний / Особистий */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 12, marginBottom: 12 }]}>
        <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
          Режим бюджету:
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            onPress={() => updateSettings && updateSettings({ budgetMode: 'shared' })}
            style={[styles.modeChip, { flex: 1, backgroundColor: budgetMode === 'shared' ? theme.primary : theme.chipInactive }]}
          >
            <Text style={[styles.fontJakartaBold, { color: budgetMode === 'shared' ? theme.primaryText : theme.text, fontSize: 12 }]}>
              Спільний
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => updateSettings && updateSettings({ budgetMode: 'personal' })}
            style={[styles.modeChip, { flex: 1, backgroundColor: budgetMode === 'personal' ? theme.primary : theme.chipInactive }]}
          >
            <Text style={[styles.fontJakartaBold, { color: budgetMode === 'personal' ? theme.primaryText : theme.text, fontSize: 12 }]}>
              Особистий
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Зведена картка лімітів */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 16, marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>
            Загальний ліміт витрат
          </Text>
          <Text style={[styles.fontJakartaBold, { color: totalSpent > totalLimit && totalLimit > 0 ? theme.expense : theme.income, fontSize: 13 }]}>
            {totalSpent.toLocaleString('uk-UA')} / {totalLimit.toLocaleString('uk-UA')} ₴
          </Text>
        </View>
        <View style={{ height: 8, backgroundColor: theme.inputBg, borderRadius: 4, overflow: 'hidden', marginVertical: 6 }}>
          <View 
            style={{ 
              width: `${totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0}%`, 
              height: '100%', 
              backgroundColor: totalSpent > totalLimit && totalLimit > 0 ? theme.expense : theme.primary 
            }} 
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11 }]}>
            Залишок: {(Math.max(totalLimit - totalSpent, 0)).toLocaleString('uk-UA')} ₴
          </Text>
          <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11 }]}>
            {totalLimit > 0 ? `${Math.round((totalSpent / totalLimit) * 100)}%` : '0%'}
          </Text>
        </View>
      </View>

      {/* Запланований дохід */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 14, marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>Запланований дохід на місяць</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.income, fontSize: 16, marginTop: 2 }]}>
              {hideBalance ? '••••••' : `${(plannedIncome || 0).toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => { setEditingIncome(!editingIncome); setIncomeInput(plannedIncome ? plannedIncome.toString() : ''); }}
            style={[styles.editBtn, { backgroundColor: theme.primary + '20' }]}
          >
            <Ionicons name={editingIncome ? "close" : "pencil"} size={14} color={theme.primary} />
          </TouchableOpacity>
        </View>
        {editingIncome && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput 
              placeholder="Сума доходу (₴)"
              placeholderTextColor={theme.subText}
              keyboardType="numeric"
              value={incomeInput}
              onChangeText={setIncomeInput}
              style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, borderColor, color: theme.text }]}
            />
            <TouchableOpacity onPress={savePlannedIncome} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
              <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>OK</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Кнопка копіювання з минулого місяця */}
      {handleCopyLastMonthExpenses && (
        <TouchableOpacity 
          onPress={handleCopyLastMonthExpenses} 
          activeOpacity={0.7}
          style={[styles.copyBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
        >
          <Ionicons name="copy-outline" size={16} color={theme.primary} />
          <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>
            Скопіювати витрати минулого місяця як ліміти
          </Text>
        </TouchableOpacity>
      )}

      {/* Ліміти по категоріях */}
      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 15, marginBottom: 10, marginLeft: 2 }]}>
        Ліміти за категоріями
      </Text>

      {categories.map(cat => {
        const catSpent = expenseByCat[cat.name] || 0;
        const catLimit = activeLimits[cat.name] || 0;
        const percent = catLimit > 0 ? (catSpent / catLimit) * 100 : 0;
        const isEditing = editingCat === cat.name;

        return (
          <View key={cat.id || cat.name} style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 14, marginBottom: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {showIcons && (
                  <View style={[styles.iconBox, { backgroundColor: (cat.color || theme.primary) + '20' }]}>
                    <Ionicons name={cat.icon || 'pricetag-outline'} size={18} color={cat.color || theme.primary} />
                  </View>
                )}
                <View>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14 }]}>{cat.name}</Text>
                  <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>
                    Витрачено: {hideBalance ? '••••' : `${catSpent.toLocaleString('uk-UA')} ₴`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => isEditing ? setEditingCat(null) : startEditLimit(cat.name, catLimit)}
                style={[styles.editLimitBtn, { backgroundColor: theme.inputBg }]}
              >
                <Text style={[styles.fontJakartaBold, { color: catLimit > 0 ? theme.primary : theme.subText, fontSize: 12 }]}>
                  {catLimit > 0 ? `${catLimit.toLocaleString('uk-UA')} ₴` : '+ Ліміт'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Прогрес-бар */}
            <View style={{ height: 6, backgroundColor: theme.inputBg, borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
              <View 
                style={{ 
                  width: `${catLimit > 0 ? Math.min(percent, 100) : 0}%`, 
                  height: '100%', 
                  backgroundColor: catSpent > catLimit && catLimit > 0 ? theme.expense : (cat.color || theme.primary) 
                }} 
              />
            </View>

            {isEditing && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput 
                  placeholder="Вкажіть ліміт (₴)"
                  placeholderTextColor={theme.subText}
                  keyboardType="numeric"
                  value={limitInput}
                  onChangeText={setLimitInput}
                  style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, borderColor, color: theme.text }]}
                  autoFocus
                />
                <TouchableOpacity onPress={() => saveLimit(cat.name)} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>Зберегти</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaSemi: { fontWeight: '600' },
  fontJakartaBold: { fontWeight: '700' },
  card: { borderRadius: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modeChip: { paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  iconBox: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  editBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  editLimitBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  saveBtn: { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingVertical: 10, borderRadius: 12, marginBottom: 16 }
});
```

---

## 12. Головний файл додатку (App.js)
**Файл:** `App.js`

```javascript
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, 
  ScrollView, Platform, ActivityIndicator, Dimensions,
  Switch, useColorScheme, BackHandler, StatusBar, Animated, PanResponder, Easing, KeyboardAvoidingView, LayoutAnimation, Linking 
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';


let LocalAuthentication = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch (e) {}


import { collection, onSnapshot, addDoc, doc, deleteDoc, query, orderBy, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/services/firebase';
import { themes } from './src/theme/theme';
import { initialCategories, initialIncomeGroups, monthNames } from './src/constants';


import CurrentMonthScreen from './src/screens/CurrentMonthScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import AIAssistantModal from './src/components/AIAssistantModal';


const SCREEN_HEIGHT = Dimensions.get('window').height;


export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(true);
  const systemColorScheme = useColorScheme();
  const [selectedThemeMode, setSelectedThemeMode] = useState('system');
  const activeThemeKey = selectedThemeMode === 'system' ? (systemColorScheme === 'light' ? 'light' : 'dark') : selectedThemeMode;
  const theme = themes[activeThemeKey];


  const isLight = activeThemeKey === 'light';
  const bgColor = isLight ? '#F4F6F9' : theme.bg;
  const cardBg = isLight ? '#FFFFFF' : theme.card;
  const borderColor = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  
  const expenseBtnColor = isLight ? '#FF8A65' : '#E57373';
  const incomeBtnColor = isLight ? '#4DB6AC' : '#81C784';


  const [globalUserFilter, setGlobalUserFilter] = useState('all');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  
  const [showIcons, setShowIcons] = useState(true);
  const [hideBalanceDefault, setHideBalanceDefault] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [showBudgetWidget, setShowBudgetWidget] = useState(true); 
  
  const [uiSettingsCollapsed, setUiSettingsCollapsed] = useState(true);
  const [securitySettingsCollapsed, setSecuritySettingsCollapsed] = useState(true);
  const [categoriesSettingsCollapsed, setCategoriesSettingsCollapsed] = useState(true);
  const [aiSettingsCollapsed, setAiSettingsCollapsed] = useState(false);
  const [catSettingsTab, setCatSettingsTab] = useState('expense');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiInitialTab, setAiInitialTab] = useState('voice');


  const [categories, setCategories] = useState(initialCategories);
  const [incomeGroups, setIncomeGroups] = useState(initialIncomeGroups);
  const [newSubCatInputs, setNewSubCatInputs] = useState({});
  const [budgetMode, setBudgetMode] = useState('shared');
  const [plannedIncome, setPlannedIncome] = useState(0);
  const [categoryLimits, setCategoryLimits] = useState({});
  const [personalCategoryLimits, setPersonalCategoryLimits] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [currentScreen, setCurrentScreen] = useState('main'); 
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;


  const [showTransModal, setShowTransModal] = useState(false);
  const transSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const transBackdropOpacity = useRef(new Animated.Value(0)).current;


  const [showSettModal, setShowSettModal] = useState(false);
  const settSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const settBackdropOpacity = useRef(new Animated.Value(0)).current;


  const openTransModal = () => {
    setShowTransModal(true);
    Animated.parallel([
      Animated.timing(transSheetY, { toValue: 0, duration: 400, easing: Easing.out(Easing.exp), useNativeDriver: false }),
      Animated.timing(transBackdropOpacity, { toValue: 1, duration: 300, useNativeDriver: false })
    ]).start();
  };


  const closeTransModal = () => {
    Animated.parallel([
      Animated.timing(transSheetY, { toValue: SCREEN_HEIGHT, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(transBackdropOpacity, { toValue: 0, duration: 250, useNativeDriver: false })
    ]).start(() => setShowTransModal(false));
  };


  const openSettModal = () => {
    setShowSettModal(true);
    Animated.parallel([
      Animated.timing(settSheetY, { toValue: 0, duration: 400, easing: Easing.out(Easing.exp), useNativeDriver: false }),
      Animated.timing(settBackdropOpacity, { toValue: 1, duration: 300, useNativeDriver: false })
    ]).start();
  };


  const closeSettModal = () => {
    Animated.parallel([
      Animated.timing(settSheetY, { toValue: SCREEN_HEIGHT, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(settBackdropOpacity, { toValue: 0, duration: 250, useNativeDriver: false })
    ]).start(() => setShowSettModal(false));
  };


  const panResponderTrans = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: Animated.event([null, { dy: transSheetY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 1.5) { closeTransModal(); } 
        else { Animated.timing(transSheetY, { toValue: 0, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: false }).start(); }
      }
    })
  ).current;


  const panResponderSett = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: Animated.event([null, { dy: settSheetY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 1.5) { closeSettModal(); } 
        else { Animated.timing(settSheetY, { toValue: 0, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: false }).start(); }
      }
    })
  ).current;


  const navigateTo = (screen) => {
    if (currentScreen === screen) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setCurrentScreen(screen);
      scaleAnim.setValue(0.97);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: true })
      ]).start();
    });
  };


  useEffect(() => {
    const onBackPress = () => {
      if (showAIModal) { setShowAIModal(false); return true; }
      if (showTransModal) { closeTransModal(); return true; }
      if (showSettModal) { closeSettModal(); return true; }
      if (currentScreen !== 'main') { navigateTo('main'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [showAIModal, showTransModal, showSettModal, currentScreen]);


  useEffect(() => { setHideBalance(hideBalanceDefault); }, [hideBalanceDefault]);


  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);


  const [editingId, setEditingId] = useState(null);
  const [transType, setTransType] = useState('expense');
  const [amountInput, setAmountInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCatItem, setSelectedCatItem] = useState(null);
  const [selectedIncomeGroup, setSelectedIncomeGroup] = useState(null);
  const [author, setAuthor] = useState('Андрій');
  const [note, setNote] = useState('');
  const [transDateOption, setTransDateOption] = useState('today');
  const [customDate, setCustomDate] = useState('');


  const availableUsers = useMemo(() => {
    const set = new Set(['Андрій', 'Людмила']);
    transactions.forEach(t => { if (t.author) set.add(t.author); });
    return Array.from(set);
  }, [transactions]);


  const handleCycleUserFilter = () => {
    const list = ['all', ...availableUsers];
    setGlobalUserFilter(list[(list.indexOf(globalUserFilter) + 1) % list.length]);
  };


  const handleAuthenticate = async () => {
    if (!LocalAuthentication) { setIsLocked(false); return; }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Авторизація у додатку' });
        if (res.success) setIsLocked(false);
      } else { setIsLocked(false); }
    } catch (e) { setIsLocked(false); }
  };


  useEffect(() => {
    if (biometricsEnabled && LocalAuthentication) { setIsLocked(true); handleAuthenticate(); } 
    else { setIsLocked(false); }
  }, [biometricsEnabled]);


  const parseAmountExpression = (input) => {
    if (!input) return { total: 0, isValid: false, isExpression: false, expressionStr: '' };
    const parts = input.split('+').map(p => p.trim()).filter(p => p !== '');
    const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length === 0) return { total: 0, isValid: false, isExpression: false, expressionStr: '' };
    return { total: nums.reduce((a, c) => a + c, 0), isValid: true, isExpression: parts.length > 1, expressionStr: parts.join(' + ') };
  };
  const evaluatedAmount = parseAmountExpression(amountInput);


  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    const unsubCat = onSnapshot(doc(db, "settings", "categories"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let mergedCats = [...(data.categories || [])];
        initialCategories.forEach(initCat => { if (!mergedCats.some(c => c.name === initCat.name)) mergedCats.push(initCat); });
        
        let cleanCats = Array.from(new Map(mergedCats.map(item => [item.name, item])).values())
          .map(c => ({ ...c, items: Array.from(new Set(c.items)) }))
          .filter(c => c.name !== 'Домашні тварини'); 
        
        setCategories(cleanCats);


        let mergedInc = [...(data.incomeGroups || [])];
        initialIncomeGroups.forEach(initInc => { if (!mergedInc.some(i => i.name === initInc.name)) mergedInc.push(initInc); });
        setIncomeGroups(Array.from(new Map(mergedInc.map(item => [item.name, item])).values()));


        if (data.categoryLimits) setCategoryLimits(data.categoryLimits);
        if (data.personalCategoryLimits) setPersonalCategoryLimits(data.personalCategoryLimits);
        if (data.plannedIncome !== undefined) setPlannedIncome(data.plannedIncome);
        if (data.budgetMode) setBudgetMode(data.budgetMode);
        if (data.hideBalanceDefault !== undefined) setHideBalanceDefault(data.hideBalanceDefault);
        if (data.biometricsEnabled !== undefined) setBiometricsEnabled(data.biometricsEnabled);
        if (data.showBudgetWidget !== undefined) setShowBudgetWidget(data.showBudgetWidget);
        if (data.geminiApiKey !== undefined) setGeminiApiKey(data.geminiApiKey);
      } else {
        setCategories(initialCategories); setIncomeGroups(initialIncomeGroups);
      }
    }, () => {
      setCategories(initialCategories);
      setIncomeGroups(initialIncomeGroups);
    });
    return () => { clearTimeout(timer); unsubCat(); };
  }, []);


  useEffect(() => {
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, []);


  const updateSettings = async (updates) => {
    if (updates.plannedIncome !== undefined) setPlannedIncome(updates.plannedIncome);
    if (updates.showBudgetWidget !== undefined) setShowBudgetWidget(updates.showBudgetWidget);
    if (updates.hideBalanceDefault !== undefined) setHideBalanceDefault(updates.hideBalanceDefault);
    if (updates.biometricsEnabled !== undefined) setBiometricsEnabled(updates.biometricsEnabled);
    if (updates.budgetMode !== undefined) setBudgetMode(updates.budgetMode);
    if (updates.categoryLimits) setCategoryLimits(updates.categoryLimits);
    if (updates.personalCategoryLimits) setPersonalCategoryLimits(updates.personalCategoryLimits);
    if (updates.categories) setCategories(updates.categories);
    if (updates.incomeGroups) setIncomeGroups(updates.incomeGroups);
    if (updates.geminiApiKey !== undefined) setGeminiApiKey(updates.geminiApiKey);
    try {
      await setDoc(doc(db, "settings", "categories"), updates, { merge: true });
    } catch (e) {}
  };


  const toggleCategoryVisibility = (catId, type) => {
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, isHidden: !c.isHidden } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, isHidden: !g.isHidden } : g);
      updateSettings({ incomeGroups: updated });
    }
  };


  const handleUpdateLimit = (subItem, limitVal) => {
    const num = parseFloat(limitVal) || 0;
    if (budgetMode === 'shared') {
      const updated = { ...categoryLimits, [subItem]: num };
      updateSettings({ categoryLimits: updated });
    } else {
      const activeUser = globalUserFilter !== 'all' ? globalUserFilter : 'Андрій';
      const updatedPersonal = { ...personalCategoryLimits, [activeUser]: { ...(personalCategoryLimits[activeUser] || {}), [subItem]: num } };
      updateSettings({ personalCategoryLimits: updatedPersonal });
    }
  };


  const handleUpdatePlannedIncome = (val) => {
    const num = parseFloat(val) || 0;
    updateSettings({ plannedIncome: num });
  };


  const handleCopyLastMonthExpenses = async () => {
    const now = new Date();
    const lastMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthExpenses = transactions.filter(t => t.type === 'expense' && (budgetMode === 'shared' || t.author === globalUserFilter) && t.rawDate && parseInt(t.rawDate.split('-')[0], 10) === lastMonthYear && parseInt(t.rawDate.split('-')[1], 10) - 1 === lastMonthIdx);
    
    const newLimits = {};
    lastMonthExpenses.forEach(t => { newLimits[t.category] = (newLimits[t.category] || 0) + t.amount; });


    if (budgetMode === 'shared') {
      const updated = { ...categoryLimits, ...newLimits };
      updateSettings({ categoryLimits: updated });
    } else {
      const activeUser = globalUserFilter !== 'all' ? globalUserFilter : 'Андрій';
      const updatedPersonal = { ...personalCategoryLimits, [activeUser]: { ...(personalCategoryLimits[activeUser] || {}), ...newLimits } };
      updateSettings({ personalCategoryLimits: updatedPersonal });
    }
  };


  const handleAddSubCategory = (catId, type) => {
    const subName = (newSubCatInputs[catId] || '').trim();
    if (!subName) return;
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, items: [...c.items, subName] } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, items: [...g.items, subName] } : g);
      updateSettings({ incomeGroups: updated });
    }
    setNewSubCatInputs(prev => ({ ...prev, [catId]: '' }));
  };


  const handleDeleteSubCategory = (catId, subName, type) => {
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, items: c.items.filter(i => i !== subName) } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, items: g.items.filter(i => i !== subName) } : g);
      updateSettings({ incomeGroups: updated });
    }
  };


  const handleOpenAddModal = () => {
    setEditingId(null); setTransType('expense'); setAmountInput('');
    setSelectedCategory(null); setSelectedCatItem(null); setSelectedIncomeGroup(null);
    setAuthor(globalUserFilter !== 'all' ? globalUserFilter : 'Андрій');
    setNote(''); setTransDateOption('today'); setCustomDate(''); 
    openTransModal();
  };


  const handleOpenEditModal = (item) => {
    setEditingId(item.id); setTransType(item.type); setAmountInput(item.amount.toString());
    if (item.type === 'expense') {
      let foundCatId = item.mainCategoryId || categories.find(c => c.items.includes(item.category))?.id;
      if (foundCatId) setSelectedCategory(foundCatId);
    } else {
      let foundIncGrpId = item.mainCategoryId || incomeGroups.find(g => g.items.includes(item.category))?.id;
      if (foundIncGrpId) setSelectedIncomeGroup(foundIncGrpId);
    }
    setSelectedCatItem(item.category); setAuthor(item.author); setNote(item.note || '');
    setTransDateOption('custom'); setCustomDate(item.rawDate || ''); openTransModal();
  };


  const handleSave = async () => {
    if (!evaluatedAmount.isValid || !selectedCatItem) return;
    const numAmount = evaluatedAmount.total;
    let autoNote = note;
    if (evaluatedAmount.isExpression && !note.trim()) autoNote = `(${evaluatedAmount.expressionStr})`;
    
    let targetDate = new Date();
    if (transDateOption === 'yesterday') targetDate.setDate(targetDate.getDate() - 1);
    else if (transDateOption === 'custom' && customDate.trim() !== '') {
      const parsed = new Date(customDate);
      if (!isNaN(parsed.getTime())) targetDate = parsed;
    }
    const formattedDate = targetDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
    const rawDateStr = targetDate.toISOString().split('T')[0];
    const currentMainCatId = transType === 'expense' ? selectedCategory : selectedIncomeGroup;


    const data = { type: transType, amount: numAmount, category: selectedCatItem, mainCategoryId: currentMainCatId, author, note: autoNote, date: formattedDate, rawDate: rawDateStr };
    try {
      if (editingId) {
        setTransactions(prev => prev.map(t => t.id === editingId ? { ...t, ...data } : t));
        await updateDoc(doc(db, "transactions", editingId), data);
      } else {
        const tempId = 'local_' + Date.now();
        setTransactions(prev => [{ id: tempId, ...data, createdAt: Date.now() }, ...prev]);
        await addDoc(collection(db, "transactions"), { ...data, createdAt: Date.now() });
      }
    } catch (e) {}
    closeTransModal();
  };


  const handleOpenAIModal = (tab = 'voice') => {
    setAiInitialTab(tab);
    setShowAIModal(true);
  };


  const handleSaveAITransactions = async (itemsList = []) => {
    if (!Array.isArray(itemsList) || itemsList.length === 0) return;
    const baseNow = Date.now();
    for (let i = 0; i < itemsList.length; i++) {
      const item = itemsList[i];
      const numAmount = Number(item.amount) || 0;
      if (numAmount <= 0) continue;

      const targetDate = new Date();
      if (item.dateOffsetDays) {
        targetDate.setDate(targetDate.getDate() + Number(item.dateOffsetDays));
      }
      const formattedDate = targetDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
      const rawDateStr = targetDate.toISOString().split('T')[0];

      const data = {
        type: item.type === 'income' ? 'income' : 'expense',
        amount: numAmount,
        category: item.category || 'Продукти',
        mainCategoryId: item.mainCategoryId || 'food',
        author: item.author || (globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'),
        note: item.note || '',
        date: formattedDate,
        rawDate: rawDateStr
      };

      const createdAt = baseNow + i;
      const tempId = 'local_ai_' + createdAt;
      setTransactions(prev => [{ id: tempId, ...data, createdAt }, ...prev]);
      try {
        await addDoc(collection(db, "transactions"), { ...data, createdAt });
      } catch (e) {}
    }
  };


  const executeDelete = async () => {
    if (!itemToDelete) return;
    const idToRemove = itemToDelete;
    setTransactions(prev => prev.filter(t => t.id !== idToRemove));
    setDeleteModalVisible(false); setItemToDelete(null);
    try { await deleteDoc(doc(db, "transactions", idToRemove)); } catch (e) {}
  };


  if (loading || categories.length === 0) return <View style={[styles.container, styles.centerContent, { backgroundColor: bgColor }]}><ActivityIndicator size="large" color={theme.primary} /></View>;
  if (isLocked) return (
    <SafeAreaView style={[styles.container, styles.centerContent, { backgroundColor: bgColor }]}>
      <Ionicons name="lock-closed-outline" size={48} color={theme.primary} style={{ marginBottom: 12 }} />
      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 16, marginBottom: 20 }]}>Додаток заблоковано</Text>
      <TouchableOpacity style={[styles.btn3D, { backgroundColor: cardBg, width: 150, borderColor, borderWidth: 1 }]} onPress={handleAuthenticate}><Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 13 }]}>Розблокувати</Text></TouchableOpacity>
    </SafeAreaView>
  );


  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} backgroundColor={bgColor} translucent={true} />


        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 16, paddingTop: 6 }}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleCycleUserFilter} style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 }]}>
            <Ionicons name="person-circle-outline" size={16} color={theme.primary} />
            <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 13 }]}>{globalUserFilter === 'all' ? 'Усі' : globalUserFilter}</Text>
          </TouchableOpacity>


          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => handleOpenAIModal('voice')} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', width: 'auto', paddingHorizontal: 10, gap: 4 }]}>
              <Ionicons name="sparkles" size={15} color={theme.primary} />
              <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 11 }]}>ШІ</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setHideBalance(!hideBalance)} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name={hideBalance ? "eye-off" : "eye"} size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={openSettModal} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name="settings" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>


        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          {currentScreen === 'main' && (
            <CurrentMonthScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} incomeGroups={incomeGroups} showIcons={showIcons} globalUserFilter={globalUserFilter} showBudgetWidget={showBudgetWidget} plannedIncome={plannedIncome} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} budgetMode={budgetMode} handleOpenEditModal={handleOpenEditModal} promptDelete={(id) => {setItemToDelete(id); setDeleteModalVisible(true);}} onNavigate={navigateTo} onOpenAI={handleOpenAIModal} />
          )}
          {currentScreen === 'analytics' && (
            <AnalyticsScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} showIcons={showIcons} globalUserFilter={globalUserFilter} onBack={() => navigateTo('main')} />
          )}
          {currentScreen === 'budget' && (
            <BudgetScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} showIcons={showIcons} globalUserFilter={globalUserFilter} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} plannedIncome={plannedIncome} budgetMode={budgetMode} handleUpdateLimit={handleUpdateLimit} handleUpdatePlannedIncome={handleUpdatePlannedIncome} handleCopyLastMonthExpenses={handleCopyLastMonthExpenses} onBack={() => navigateTo('main')} updateSettings={updateSettings} />
          )}
        </Animated.View>


        {/* Плаваючі кнопки швидкого доступу: Голос/Фото ШІ + Ручне додавання */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.fab3D,
            {
              bottom: 90,
              width: 48,
              height: 48,
              borderRadius: 24,
              right: 24,
              backgroundColor: cardBg,
              borderColor: theme.primary,
              borderWidth: 1.5
            }
          ]}
          onPress={() => handleOpenAIModal('voice')}
        >
          <Ionicons name="mic" size={22} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.9} style={[styles.fab3D, { backgroundColor: theme.primary }]} onPress={handleOpenAddModal}>
          <Ionicons name="add" size={28} color={theme.primaryText} />
        </TouchableOpacity>


        {showTransModal && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { zIndex: 10, justifyContent: 'flex-end' }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: transBackdropOpacity }]} />
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeTransModal} />
            
            <Animated.View style={[styles.glassModal, { backgroundColor: cardBg, height: '85%', transform: [{ translateY: transSheetY }] }]}>
              <View {...panResponderTrans.panHandlers} style={{ alignItems: 'center', paddingVertical: 12, marginTop: -5 }}>
                <View style={{ width: 40, height: 4, backgroundColor: theme.subText, opacity: 0.3, borderRadius: 2 }} />
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                {!editingId && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.premiumCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary + '18', borderColor: theme.primary + '44', borderWidth: 1, paddingVertical: 9 }]}
                      onPress={() => { closeTransModal(); setTimeout(() => handleOpenAIModal('voice'), 250); }}
                    >
                      <Ionicons name="mic" size={15} color={theme.primary} />
                      <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>Додати голосом</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.premiumCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary + '18', borderColor: theme.primary + '44', borderWidth: 1, paddingVertical: 9 }]}
                      onPress={() => { closeTransModal(); setTimeout(() => handleOpenAIModal('photo'), 250); }}
                    >
                      <Ionicons name="camera" size={15} color={theme.primary} />
                      <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>Сканувати чек</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={{ flexDirection: 'row', width: '100%', gap: 10, marginBottom: 16 }}>
                  <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: transType === 'expense' ? expenseBtnColor : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTransType('expense'); setSelectedCategory(null); setSelectedCatItem(null); }}>
                    <Text style={[styles.fontJakartaBold, { color: transType === 'expense' ? (isLight ? '#FFF' : '#000') : theme.text, fontSize: 13 }]}>Витрата</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: transType === 'income' ? incomeBtnColor : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTransType('income'); setSelectedIncomeGroup(null); setSelectedCatItem(null); }}>
                    <Text style={[styles.fontJakartaBold, { color: transType === 'income' ? (isLight ? '#FFF' : '#000') : theme.text, fontSize: 13 }]}>Дохід</Text>
                  </TouchableOpacity>
                </View>


                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput placeholder="Сума (напр. 150)" placeholderTextColor={theme.subText} keyboardType="numeric" value={amountInput} onChangeText={setAmountInput} style={[styles.input3D, styles.fontJakartaBold, { flex: 1, color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, padding: 12, fontSize: 16 }]} />
                    <TouchableOpacity style={[styles.btn3D, { backgroundColor: theme.primary, width: 46, height: 46 }]} onPress={() => setAmountInput(prev => prev + '+')}><Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 22 }]}>+</Text></TouchableOpacity>
                  </View>
                  {evaluatedAmount.isExpression && <Text style={[styles.fontJakartaSemi, { color: theme.primary, fontSize: 12, marginTop: 4 }]}>Разом: = {evaluatedAmount.total.toLocaleString('uk-UA')} ₴</Text>}
                </View>


                {transType === 'expense' ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Головна категорія:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {categories.filter(c => !c.isHidden).map(cat => {
                        const isSelected = selectedCategory === cat.id;
                        if (selectedCategory && !isSelected) return null; 


                        return (
                          <View key={cat.id} style={{ width: isSelected ? '100%' : 'auto' }}>
                            <TouchableOpacity 
                              style={[styles.premiumCard, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isSelected ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]} 
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                if (isSelected) { setSelectedCategory(null); setSelectedCatItem(null); } 
                                else { setSelectedCategory(cat.id); setSelectedCatItem(cat.items[0]); }
                              }}
                            >
                              {showIcons && <Ionicons name={cat.icon} size={14} color={isSelected ? theme.primaryText : theme.text} />}
                              <Text style={[styles.fontJakartaSemi, { color: isSelected ? theme.primaryText : theme.text, fontSize: 12 }]}>{cat.name}</Text>
                              {isSelected && <Ionicons name="close-circle" size={16} color={theme.primaryText} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>


                            {isSelected && (
                              <View style={{ marginTop: 12, padding: 12, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)', borderRadius: 16, borderColor, borderWidth: 1 }}>
                                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 10 }]}>Оберіть підкатегорію:</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {cat.items.map(item => (
                                    <TouchableOpacity key={item} style={[styles.premiumCard, { backgroundColor: selectedCatItem === item ? theme.primary : theme.inputBg, borderColor, borderWidth: selectedCatItem === item ? 0 : 1, paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => setSelectedCatItem(item)}>
                                      <Text style={[styles.fontJakarta, { color: selectedCatItem === item ? theme.primaryText : theme.text, fontSize: 12 }]}>{item}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Джерело доходу:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {incomeGroups.filter(g => !g.isHidden).map(grp => {
                        const isSelected = selectedIncomeGroup === grp.id;
                        if (selectedIncomeGroup && !isSelected) return null; 


                        return (
                          <View key={grp.id} style={{ width: isSelected ? '100%' : 'auto' }}>
                            <TouchableOpacity 
                              style={[styles.premiumCard, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isSelected ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]} 
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                if (isSelected) { setSelectedIncomeGroup(null); setSelectedCatItem(null); } 
                                else { setSelectedIncomeGroup(grp.id); setSelectedCatItem(grp.items[0]); }
                              }}
                            >
                              <Text style={[styles.fontJakartaSemi, { color: isSelected ? theme.primaryText : theme.text, fontSize: 12 }]}>{grp.name}</Text>
                              {isSelected && <Ionicons name="close-circle" size={16} color={theme.primaryText} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>


                            {isSelected && (
                              <View style={{ marginTop: 12, padding: 12, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)', borderRadius: 16, borderColor, borderWidth: 1 }}>
                                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 10 }]}>Уточніть джерело:</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {grp.items.map(item => (
                                    <TouchableOpacity key={item} style={[styles.premiumCard, { backgroundColor: selectedCatItem === item ? theme.primary : theme.inputBg, borderColor, borderWidth: selectedCatItem === item ? 0 : 1, paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => setSelectedCatItem(item)}>
                                      <Text style={[styles.fontJakarta, { color: selectedCatItem === item ? theme.primaryText : theme.text, fontSize: 12 }]}>{item}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}


                <TextInput placeholder="Коментар (необов'язково)" placeholderTextColor={theme.subText} value={note} onChangeText={setNote} style={[styles.input3D, styles.fontJakarta, { color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, padding: 12, fontSize: 13, marginBottom: 20 }]} />


                <View style={{ flexDirection: 'row', gap: 10, marginBottom: editingId ? 10 : 0 }}>
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.chipInactive, borderColor, borderWidth: 1, flex: 1, alignItems: 'center', paddingVertical: 12 }]} onPress={closeTransModal}><Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Скасувати</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.primary, borderColor, borderWidth: 1, flex: 1, alignItems: 'center', paddingVertical: 12 }]} onPress={handleSave}><Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 13 }]}>Зберегти</Text></TouchableOpacity>
                </View>


                {editingId && (
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: expenseBtnColor, borderColor, borderWidth: 1, width: '100%', alignItems: 'center', paddingVertical: 12 }]} onPress={() => { setItemToDelete(editingId); setDeleteModalVisible(true); closeTransModal(); }}>
                    <Text style={[styles.fontJakartaBold, { color: isLight ? '#FFF' : '#000', fontSize: 13 }]}>🗑 Видалити цю операцію</Text>
                  </TouchableOpacity>
                )}


              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        )}


        {showSettModal && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { zIndex: 10, justifyContent: 'flex-end' }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: settBackdropOpacity }]} />
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSettModal} />
            
            <Animated.View style={[styles.glassModal, { backgroundColor: cardBg, height: '85%', transform: [{ translateY: settSheetY }] }]}>
              <View {...panResponderSett.panHandlers} style={{ alignItems: 'center', paddingVertical: 12, marginTop: -5 }}>
                <View style={{ width: 40, height: 4, backgroundColor: theme.subText, opacity: 0.3, borderRadius: 2 }} />
              </View>


              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18, marginBottom: 14 }]}>Налаштування</Text>


                <TouchableOpacity activeOpacity={0.7} onPress={() => setAiSettingsCollapsed(!aiSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={15} color={theme.primary} />
                    <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>ШІ-Асистент (Голос та Фото чеків)</Text>
                  </View>
                  <Ionicons name={aiSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!aiSettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>Ключ Google Gemini API:</Text>
                      <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                        <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 11 }]}>Отримати ключ ↗</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      placeholder="Вставте ключ AIzaSy..."
                      placeholderTextColor={theme.subText}
                      value={geminiApiKey}
                      onChangeText={(val) => updateSettings({ geminiApiKey: val.trim() })}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input3D, styles.fontJakartaSemi, { color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, marginBottom: 6 }]}
                    />
                    <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10 }]}>
                      Ключ автоматично синхронізується через Firebase між обома телефонами сім’ї.
                    </Text>
                  </View>
                )}


                <TouchableOpacity activeOpacity={0.7} onPress={() => setUiSettingsCollapsed(!uiSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Інтерфейс</Text>
                  <Ionicons name={uiSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!uiSettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>Показувати Віджет Бюджету</Text>
                      <Switch value={showBudgetWidget} onValueChange={(val) => updateSettings({ showBudgetWidget: val })} trackColor={{ true: theme.primary }} />
                    </View>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Тема оформлення:</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[{ key: 'dark', label: 'Темна', icon: 'moon' }, { key: 'light', label: 'Світла', icon: 'sunny' }, { key: 'system', label: 'Авто', icon: 'options' }].map(item => (
                        <TouchableOpacity key={item.key} style={[styles.premiumCard, { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: selectedThemeMode === item.key ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setSelectedThemeMode(item.key)}>
                          <Ionicons name={item.icon} size={14} color={selectedThemeMode === item.key ? theme.primaryText : theme.text} />
                          <Text style={[styles.fontJakartaSemi, { color: selectedThemeMode === item.key ? theme.primaryText : theme.text, fontSize: 11 }]}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}


                <TouchableOpacity activeOpacity={0.7} onPress={() => setSecuritySettingsCollapsed(!securitySettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Безпека та Приватність</Text>
                  <Ionicons name={securitySettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!securitySettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>Face ID / Відбиток</Text>
                      <Switch value={biometricsEnabled} onValueChange={(val) => updateSettings({ biometricsEnabled: val })} trackColor={{ true: theme.primary }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12, marginBottom: 2 }]}>Приховувати баланс при вході</Text>
                      </View>
                      <Switch value={hideBalanceDefault} onValueChange={(val) => updateSettings({ hideBalanceDefault: val })} trackColor={{ true: theme.primary }} />
                    </View>
                  </View>
                )}


                <TouchableOpacity activeOpacity={0.7} onPress={() => setCategoriesSettingsCollapsed(!categoriesSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Управління категоріями</Text>
                  <Ionicons name={categoriesSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!categoriesSettingsCollapsed && (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: catSettingsTab === 'expense' ? theme.primary : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setCatSettingsTab('expense')}>
                        <Text style={[styles.fontJakartaBold, { color: catSettingsTab === 'expense' ? theme.primaryText : theme.text, fontSize: 13 }]}>Витрати</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: catSettingsTab === 'income' ? theme.primary : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setCatSettingsTab('income')}>
                        <Text style={[styles.fontJakartaBold, { color: catSettingsTab === 'income' ? theme.primaryText : theme.text, fontSize: 13 }]}>Доходи</Text>
                      </TouchableOpacity>
                    </View>


                    {(catSettingsTab === 'expense' ? categories : incomeGroups).map(grp => (
                      <View key={grp.id} style={[styles.premiumCard, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1, marginBottom: 14, padding: 14 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons name={grp.icon} size={20} color={grp.color} />
                            <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, textDecorationLine: grp.isHidden ? 'line-through' : 'none', opacity: grp.isHidden ? 0.5 : 1 }]}>{grp.name}</Text>
                          </View>
                          <TouchableOpacity onPress={() => toggleCategoryVisibility(grp.id, catSettingsTab)}>
                            <Ionicons name={grp.isHidden ? "eye-off" : "eye"} size={22} color={grp.isHidden ? theme.subText : theme.primary} />
                          </TouchableOpacity>
                        </View>
                        {!grp.isHidden && (
                          <View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {grp.items.map(item => (
                                <View key={item} style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10 }]}>
                                  <Text style={[styles.fontJakarta, { color: theme.text, fontSize: 12 }]}>{item}</Text>
                                  <TouchableOpacity onPress={() => handleDeleteSubCategory(grp.id, item, catSettingsTab)}>
                                    <Ionicons name="close-circle" size={16} color={theme.expense} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                              <TextInput 
                                placeholder="Нова підкатегорія..." 
                                placeholderTextColor={theme.subText}
                                value={newSubCatInputs[grp.id] || ''}
                                onChangeText={(val) => setNewSubCatInputs(prev => ({...prev, [grp.id]: val}))}
                                style={[styles.input3D, styles.fontJakartaSemi, { flex: 1, color: theme.text, backgroundColor: cardBg, borderColor, borderWidth: 1, paddingHorizontal: 12, height: 38, fontSize: 12 }]} 
                              />
                              <TouchableOpacity style={[styles.btn3D, { backgroundColor: theme.primary, width: 38, height: 38 }]} onPress={() => handleAddSubCategory(grp.id, catSettingsTab)}>
                                <Ionicons name="add" size={20} color={theme.primaryText} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}


                <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.primary, borderColor, borderWidth: 1, alignItems: 'center', marginTop: 24, paddingVertical: 12 }]} onPress={closeSettModal}>
                  <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 13 }]}>Зберегти та Закрити</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        )}


        <AIAssistantModal
          visible={showAIModal}
          onClose={() => setShowAIModal(false)}
          initialTab={aiInitialTab}
          theme={theme}
          isLight={isLight}
          cardBg={cardBg}
          borderColor={borderColor}
          categories={categories}
          incomeGroups={incomeGroups}
          defaultAuthor={globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'}
          geminiApiKey={geminiApiKey}
          onSaveApiKey={(key) => updateSettings({ geminiApiKey: key })}
          onSaveTransactions={handleSaveAITransactions}
        />


        <Modal visible={deleteModalVisible} animationType="fade" transparent={true} onRequestClose={() => setDeleteModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <View style={[styles.glassModal, { backgroundColor: cardBg, width: '100%', alignItems: 'center', padding: 20, borderRadius: 24, position: 'relative' }]}>
              <Ionicons name="trash" size={24} color={expenseBtnColor} style={{ marginBottom: 10 }} />
              <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 15, marginBottom: 6 }]}>Видалити операцію?</Text>
              <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 12, textAlign: 'center', marginBottom: 20 }]}>Цю дію неможливо скасувати.</Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity style={[styles.premiumCard, { flex: 1, backgroundColor: theme.chipInactive, alignItems: 'center', paddingVertical: 10 }]} onPress={() => setDeleteModalVisible(false)}><Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Скасувати</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.premiumCard, { flex: 1, backgroundColor: expenseBtnColor, alignItems: 'center', paddingVertical: 10 }]} onPress={executeDelete}><Text style={[styles.fontJakartaBold, { color: isLight ? '#FFF' : '#000', fontSize: 13 }]}>Видалити</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>


      </SafeAreaView>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaSemi: { fontWeight: '600' },
  fontJakartaBold: { fontWeight: '700' },
  container: { flex: 1 },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  
  premiumCard: { 
    borderRadius: 16, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 
  },
  btn3D: { 
    borderRadius: 14, justifyContent: 'center', alignItems: 'center', width: 38, height: 38, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 
  },
  input3D: { 
    borderRadius: 14, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 
  },
  fab3D: { 
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, 
    justifyContent: 'center', alignItems: 'center', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 
  },
  glassModal: { 
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 20, 
    position: 'absolute', bottom: 0, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 
  },
});
```

---

