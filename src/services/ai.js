// Сервіс ШІ-асистента (Google Gemini Multimodal API) для розпізнавання голосу, фото чеків та тексту

const DEFAULT_FALLBACK_GEMINI_KEY = '';

const PREFERRED_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite'
];

let cachedWorkingModel = null;

/**
 * Автоматичний пошук доступних моделей для ключа користувача через ListModels API
 */
async function discoverAvailableModels(cleanKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];

    // Фільтруємо моделі, які підтримують generateContent і не є вузькоспеціалізованими (tts, image-generation, embedding)
    const supported = models
      .filter(m => {
        const methods = m.supportedGenerationMethods || [];
        const name = (m.name || '').toLowerCase();
        if (!methods.includes('generateContent')) return false;
        if (
          name.includes('embedding') ||
          name.includes('aqa') ||
          name.includes('tts') ||
          name.includes('imagen') ||
          name.includes('image') ||
          name.includes('thinking') ||
          name.includes('audio-dialog') ||
          name.includes('robotics') ||
          name.includes('computer-use') ||
          name.includes('transcribe') ||
          name.includes('deep-research') ||
          name.includes('antigravity') ||
          name.includes('lyria') ||
          name.includes('banana')
        ) {
          return false;
        }
        return name.includes('gemini');
      })
      .map(m => m.name.replace(/^models\//, ''));

    // Сортуємо: спочатку нові моделі серії 3.5 / 3.8 flash-lite та flash, які гарантовано доступні новим користувачам
    supported.sort((a, b) => {
      const score = (n) => {
        if (n === 'gemini-3.5-flash-lite') return 110;
        if (n === 'gemini-3.8-flash') return 105;
        if (n === 'gemini-flash-lite-latest') return 100;
        if (n === 'gemini-flash-latest') return 95;
        if (n.includes('3.8-flash')) return 92;
        if (n.includes('3.7-flash')) return 90;
        if (n.includes('3.6-flash')) return 88;
        if (n.includes('3.5-flash')) return 85;
        if (n.includes('3.1-flash')) return 80;
        if (n.includes('flash')) return 60;
        if (n.includes('pro')) return 40;
        return 10;
      };
      return score(b) - score(a);
    });

    return supported;
  } catch (e) {
    return [];
  }
}

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
 * Основна функція виклику Gemini API з автовизначенням доступної моделі (gemini-3.5-flash-lite / gemini-3.8-flash)
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
  const cleanKey = String(
    apiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || DEFAULT_FALLBACK_GEMINI_KEY || ''
  ).trim();
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

  // Спочатку пробуємо швидкі моделі серії 3.5-flash-lite / 3.8-flash
  let modelsToTry = cachedWorkingModel
    ? [cachedWorkingModel, ...PREFERRED_GEMINI_MODELS.filter(m => m !== cachedWorkingModel)]
    : [...PREFERRED_GEMINI_MODELS];

  let lastError = null;

  const tryGenerateWithList = async (modelList) => {
    for (const modelName of modelList) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json'
            }
          })
        });

        const resData = await response.json();

        if (!response.ok) {
          const errMsg = resData?.error?.message || `HTTP ${response.status}`;
          if (response.status === 404 || response.status === 503 || response.status === 429) {
            lastError = new Error(errMsg);
            continue;
          }
          if (response.status === 400 && errMsg.toLowerCase().includes('api key')) {
            throw new Error('Невірний Gemini API ключ. Перевірте його у Налаштуваннях.');
          }
          lastError = new Error(`Помилка Gemini API: ${errMsg}`);
          continue;
        }

        const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!rawText) {
          lastError = new Error('ШІ повернув порожню відповідь.');
          continue;
        }

        cachedWorkingModel = modelName;

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
        if (err.message && (err.message.includes('API ключ') || err.message === 'MISSING_API_KEY')) {
          throw err;
        }
      }
    }
    return null;
  };

  // Спроба 1: пріоритетний список моделей (gemini-3.5-flash-lite, gemini-3.8-flash тощо)
  const firstResult = await tryGenerateWithList(modelsToTry);
  if (firstResult) return firstResult;

  // Спроба 2: якщо Google змінив назви моделей — автоматично опитуємо ListModels API
  const discovered = await discoverAvailableModels(cleanKey);
  const newModels = discovered.filter(m => !modelsToTry.includes(m));
  if (newModels.length > 0) {
    const secondResult = await tryGenerateWithList(newModels);
    if (secondResult) return secondResult;
  }

  throw lastError || new Error('Не вдалося з’єднатися з Gemini AI.');
}

/**
 * ШІ-Аналітик: відповідає на будь-які запитання по транзакціях (напр. "Скільки витрачено за місяць на каву?")
 */
export async function askAIAnalytics({
  apiKey,
  question = '',
  audioBase64 = null,
  audioMimeType = 'audio/mp4',
  transactions = [],
  categories = [],
  incomeGroups = []
}) {
  const cleanKey = String(
    apiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || DEFAULT_FALLBACK_GEMINI_KEY || ''
  ).trim();
  if (!cleanKey) {
    throw new Error('Вкажіть ключ Gemini API у Налаштуваннях додатку.');
  }

  // Формуємо компактний дамп операцій для економії токенів
  const compactTx = transactions.slice(0, 400).map(t => ({
    d: t.rawDate || t.date || '',
    t: t.type === 'income' ? 'inc' : 'exp',
    a: Number(t.amount) || 0,
    c: t.category || '',
    n: t.note || '',
    u: t.author || ''
  }));

  const nowStr = new Date().toISOString().split('T')[0];

  const prompt = `Ти — персональний фінансовий ШІ-аналітик сімейного бюджету «Наші Гроші».
Поточна дата: ${nowStr}.
Ось список операцій сім'ї (d = дата YYYY-MM-DD, t = exp (витрата) або inc (дохід), a = сума в грн, c = категорія, n = коментар/деталі, u = хто вніс):
${JSON.stringify(compactTx)}

ЗАВДАННЯ:
Проаналізуй запитання користувача (текстове або голосове) та дай точну, дружню і структуровану відповідь українською мовою на основі реальних цифр зі списку операцій.
- Враховуй як назву категорії (c), так і коментарі (n). Наприклад, якщо питають про "каву", шукай і в коментарях ("кава", "латте", "кав'ярня"), і в категорії "Ресторани/Кафе".
- Якщо в базі основні операції за інший місяць (наприклад, серпень 2026), обов'язково вкажи це і порахуй суму за наявними даними.

Поверни СТРОГО валідний JSON такого формату:
{
  "questionRecognized": "Текст запитання користувача",
  "headline": "Короткий головний висновок з цифрою (напр.: На каву та кафе витрачено 450 ₴)",
  "totalAmount": 450,
  "operationsCount": 3,
  "details": "Детальне пояснення по датах, категоріях або авторах (Андрій / Людмила)",
  "matchedItems": [
    { "date": "2026-08-09", "category": "Ресторани/Кафе", "note": "Кава", "amount": 50, "author": "Андрій" }
  ],
  "tip": "Коротка корисна порада або спостереження на 1 речення"
}`;

  const parts = [{ text: prompt }];
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: audioMimeType,
        data: audioBase64
      }
    });
    parts.push({ text: 'Розпізнай голосове запитання користувача та поверни JSON-звіт аналітики.' });
  } else {
    parts.push({ text: `Запитання користувача: "${question.trim()}"` });
  }

  let modelsToTry = cachedWorkingModel
    ? [cachedWorkingModel, ...PREFERRED_GEMINI_MODELS.filter(m => m !== cachedWorkingModel)]
    : [...PREFERRED_GEMINI_MODELS];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        const errMsg = resData?.error?.message || `HTTP ${response.status}`;
        if (response.status === 404 || response.status === 503 || response.status === 429) {
          lastError = new Error(errMsg);
          continue;
        }
        throw new Error(errMsg);
      }

      const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!rawText) continue;

      cachedWorkingModel = modelName;
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      return JSON.parse(cleaned);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Не вдалося сформувати ШІ-звіт.');
}

