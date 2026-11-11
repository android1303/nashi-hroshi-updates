# Контекст та Архітектурна Карта проєкту «Наші Гроші» (v1.0.5)

> **Призначення цього файлу**: Компактна карта проєкту для економії токенів ШІ-моделей. Читайте цей файл першим замість сканування всього репозиторію.

---

## 1. Огляд проєкту
**«Наші Гроші» (`nashi-hroshi`)** — мобільний додаток (React Native + Expo SDK 51) для обліку сімейного бюджету двох користувачів (**«Андрій»** та **«Людмила»**) з реальним часом синхронізації через **Firebase Firestore** та вбудованим мультимодальним **ШІ-асистентом (Google Gemini)** для додавання витрат голосом, по фото чеків/скріншотів і текстом.

- **Версія**: `1.0.5` (`versionCode: 5`)
- **Пакет Android**: `com.android1303.nashihroshi`
- **Firebase проєкт**: `first-apk-469d4`
- **Автозбірка APK**: GitHub Actions (`.github/workflows/build-apk.yml`) при пуші тегу `v*` публікує `app-release.apk` у GitHub Releases.

---

## 2. Карта файлів та відповідальності (Індекс для Архітектора та Молодших моделей)

| Файл | Роль у системі | Ключові функції / секції | Рівень складності правок |
|------|----------------|--------------------------|--------------------------|
| [`index.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/index.js) | Точка входу Expo | `registerRootComponent(App)` | 🟢 Junior (`flash_lite`) |
| [`App.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/App.js) | Головний хаб стану, Firebase-синхронізація, навігація, модалки | Рядки 29–80: Стан додатку та тем<br>Рядки 146–175: Навігація `navigateTo` та `BackHandler`<br>Рядки 232–302: Firestore `onSnapshot` (`settings/categories`, `transactions`) та `updateSettings`<br>Рядки 395–475: `handleSave`, `handleOpenAIModal`, `handleSaveAITransactions`<br>Рядки 478–525: Рендер екранів та плаваючих кнопок (`🎙` ШІ + `+`)<br>Рядки 526–685: Модалка ручного додавання операції (`showTransModal`)<br>Рядки 688–885: Модалка Налаштувань (`showSettModal` + секція ключа Gemini API) | 🔴 Senior (`pro`) для логіки синхронізації; 🟢 Junior (`flash`) для UI |
| [`src/services/ai.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/services/ai.js) | Мультимодальний сервіс Google Gemini (`gemini-2.0-flash` / `gemini-1.5-flash`) | `normalizeTransactionItem()` — прив'язка відповіді ШІ до реальних категорій додатку<br>`buildSystemPrompt()` — генерація промпту з актуальними категоріями сім'ї<br>`analyzeTransactionsWithAI()` — відправка аудіо (`base64`), фото чека (`base64`) або тексту в Gemini REST API | 🔴 Senior (`pro`) |
| [`src/components/AIAssistantModal.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/components/AIAssistantModal.js) | Модальне вікно ШІ-асистента (3 вкладки: Голос, Фото чека, Текст) | Запис голосу через `expo-av` (`Audio.Recording`) з таймером і пульсацією<br>Сканер чеків через `expo-image-picker` (Камера / Галерея) у 2 режимах: «Загальною сумою» або «По позиціях»<br>Попередній перегляд, редагування та масове збереження розпізнаних транзакцій<br>Вбудоване збереження ключа `geminiApiKey` у Firebase | 🟡 Середній (`flash` / `pro`) |
| [`src/screens/CurrentMonthScreen.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/screens/CurrentMonthScreen.js) | Головний екран поточного місяця | Рядки 186–371: **40% Дашборд-хаб** (Плашка Балансу з SVG-хвилею тренду + Плашка Бюджету з SVG Donut Chart) — активні портали навігації<br>Рядки 375–388: Двоступеневий плавний скрол (`Animated.event`, `useNativeDriver: true`)<br>Рядки 390–480: **ШІ-віджет швидкого додавання** (`🎙 Голосом`, `📷 По фото`, `💬 Текст`)<br>Рядки 482–555: Список останніх операцій | 🟢 Junior (`flash`) для верстки; 🔴 Senior (`pro`) для SVG-графіків |
| [`src/screens/AnalyticsScreen.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/screens/AnalyticsScreen.js) | Річна аналітика та статистика | Вибір року, загальний річний баланс, деталізація витрат і доходів по категоріях та підкатегоріях з прогрес-барами | 🟢 Junior (`flash`) |
| [`src/screens/BudgetScreen.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/screens/BudgetScreen.js) | Планування бюджету та лімітів | Перемикач «Спільний» / «Особистий» бюджет, плановий дохід, ліміти по підкатегоріях, копіювання витрат минулого місяця | 🟢 Junior (`flash`) |
| [`src/services/firebase.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/services/firebase.js) | Підключення Firebase Firestore | Ініціалізація `app` та експорт `db = getFirestore(app)` для `first-apk-469d4` | 🟢 Junior (`flash_lite`) |
| [`src/constants.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/constants.js) | Базові категорії та місяці | `initialCategories`, `initialIncomeGroups`, `monthNames` | 🟢 Junior (`flash_lite`) |
| [`src/theme/theme.js`](file:///home/antigravity/android1303/nashi-hroshi-updates/src/theme/theme.js) | Палітра кольорів | `themes.dark` (OLED `#141218`) та `themes.light` | 🟢 Junior (`flash_lite`) |

---

## 3. Структура даних у Firebase Firestore

1. **Колекція `transactions`** (документи транзакцій):
   ```json
   {
     "type": "expense | income",
     "amount": 1200,
     "category": "Пальне/Заправка",
     "mainCategoryId": "auto",
     "author": "Андрій | Людмила",
     "note": "ОККО",
     "date": "08 лист.",
     "rawDate": "2026-11-08",
     "createdAt": 1762636800000
   }
   ```
2. **Документ `settings/categories`** (спільні сімейні налаштування):
   - `categories`: масив груп витрат із підкатегоріями
   - `incomeGroups`: масив груп доходів
   - `categoryLimits`: спільні ліміти `{ [subCategory]: number }`
   - `personalCategoryLimits`: особисті ліміти `{ "Андрій": {...}, "Людмила": {...} }`
   - `plannedIncome`: число
   - `budgetMode`: `"shared" | "personal"`
   - `geminiApiKey`: спільний ключ Google Gemini API (синхронізується між телефонами)

---

## 4. Протокол роботи («Архітектор → Молодша модель»)

> 🛑 **ГОЛОВНЕ ПРАВИЛО (Confirmation-First Policy):**
> Якщо користувач запитує аналіз («зроби аналіз», «чому не працює», «завдання архітектору»):
> 1. Архітектор проводить ретельний аналіз;
> 2. Формує висновки та пропонує конкретні варіанти рішень;
> 3. **СТРОГО ЗУПИНЯЄТЬСЯ І ЧЕКАЄ ПІДТВЕРДЖЕННЯ**. Будь-які зміни в коді, коміти або збірки виконуються **ТІЛЬКИ ПІСЛЯ ПРЯМОГО ПІДТВЕРДЖЕННЯ** користувача («роби», «підтверджую»). Жодних дій без згоди!

Щоб не витрачати дорогі токени старших моделей (Claude / Argon / Pro) на рутинний код і читання всього проєкту:
1. **Старша модель (Архітектор)** читає **лише [`CONTEXT.md`](file:///home/antigravity/android1303/nashi-hroshi-updates/CONTEXT.md)** і конкретний цільовий діапазон рядків.
2. Архітектор формує чітке ТЗ (які саме файли і рядки змінити) та розділяє задачі:
   - **`[SENIOR / pro]`** — архітектурні рішення, складна логіка стану, мультимодальний ШІ.
   - **`[JUNIOR / flash | flash_lite]`** — верстка компонентів, зміна кольорів/відступів, додавання полів, прості правки за готовим ТЗ.
3. Використовуйте скрипт `node scripts/architect-router.js "ваша задача"` або вбудовану навичку **`architect-router`** у чаті.
