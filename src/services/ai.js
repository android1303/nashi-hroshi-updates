// Сервіс ШІ-асистента (Google Gemini Multimodal API) для розпізнавання голосу, фото чеків та тексту

const DEFAULT_FALLBACK_GEMINI_KEY = '';

// Актуальні офіційні моделі Google AI Studio (v1beta API) для нових та існуючих ключів
const PREFERRED_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

let cachedWorkingModel = null;

/**
 * fetch з таймаутом через AbortController для захисту від нескінченного зависання на Android
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 16000) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch (e) {}
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError' || (err.message && err.message.toLowerCase().includes('abort'))) {
      throw new Error(`Час очікування Gemini API вичерпано (${Math.round(timeoutMs / 1000)} сек). Перевірте інтернет-з'єднання і спробуйте знову.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Автоматичний пошук доступних моделей для ключа користувача через ListModels API
 */
async function discoverAvailableModels(cleanKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return [];
    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models : [];

    // Фільтруємо моделі, які підтримують generateContent, не є спец-моделями і не закриті Google для нових ключів
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
          name.includes('banana') ||
          name.includes('2.5-flash') ||
          name.includes('2.5-pro') ||
          name.includes('2.0-flash')
        ) {
          return false;
        }
        return name.includes('gemini');
      })
      .map(m => m.name.replace(/^models\//, ''));

    // Сортуємо: найвищий пріоритет офіційно рекомендованим flash-lite та flash
    supported.sort((a, b) => {
      const score = (n) => {
        if (n === 'gemini-3.5-flash-lite') return 200;
        if (n === 'gemini-3.6-flash') return 180;
        if (n === 'gemini-3.8-flash') return 160;
        if (n === 'gemini-flash-latest') return 140;
        if (n.includes('3.5-flash')) return 120;
        if (n.includes('3.6-flash')) return 110;
        if (n.includes('3.8-flash')) return 100;
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
        : `Це фото чека, квитанції або скріншот екрану / шторки сповіщень телефону (Google Гаманець / Google Pay, Monobank, Приват24, Raiffeisen, Sense, ПУМБ тощо).
   ПРАВИЛА РОЗПІЗНАВАННЯ СУМ:
   - СУМА ПЛАТЕЖУ: Витягуй СТРОГО те число, яке безпосередньо супроводжується грошовим знаком або позначенням валюти («грн», «грн.», «₴», «UAH»). Наприклад: «224,00 грн.» -> amount: 224; «150,50 ₴» -> amount: 150.5.
   - ЗАБОРОНА СКЛЕЮВАННЯ НОМЕРІВ ТОРГОВИХ ТОЧОК: Цифри у назвах закладів, номери терміналів або ресторанів (наприклад, «MCDONALDS 050», «АТБ-1044», «Сільпо 12», «АЗС №14») — це НОМЕР ТОРГОВОЇ ТОЧКИ, а НЕ сума! КАТЕГОРИЧНО ЗАБОРОНЕНО склеювати ці цифри з сумою платежу (приклад: для рядків «MCDONALDS 050» та «224,00 грн.» сума — це 224, а НЕ 50224!). У поле "note" запиши "McDonald's" або "McDonald's #050".
   - СЛУЖБОВІ ДАНІ: Маски номерів карток («••7021», «*7021»), час («20 хв тому»), відсотки батареї («74%») чи час («14:08») відкидай і ніколи не додавай до суми.
   - АНТИДУБЛЮВАННЯ: Якщо на скріншоті шторки сповіщень є кілька пуш-повідомлень про ОДНУ І ТУ САМУ оплату (наприклад, пуш від Google Гаманець «MCDONALDS 050 224,00 грн.» і нижче пуш від банку «224,00 ₴ оплата в MCDONALDS»), поверни ТІЛЬКИ ОДНУ операцію на 224 грн у категорію "Ресторани/Кафе", note: "McDonald's".`)
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

  // Спочатку пробуємо перевірені швидкі моделі (не більше 2, щоб уникнути вичерпання квоти)
  const candidateModels = cachedWorkingModel
    ? [cachedWorkingModel, ...PREFERRED_GEMINI_MODELS.filter(m => m !== cachedWorkingModel)]
    : [...PREFERRED_GEMINI_MODELS];
  const modelsToTry = candidateModels.slice(0, 2);

  let lastError = null;

  const tryGenerateWithList = async (modelList) => {
    for (const modelName of modelList) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.15,
              responseMimeType: 'application/json'
            }
          })
        }, 16000);

        const resData = await response.json();

        if (!response.ok) {
          const errMsg = resData?.error?.message || `HTTP ${response.status}`;
          const errMsgLower = errMsg.toLowerCase();

          // 1. Перевищення ліміту безкоштовного тарифу (15 RPM) — миттєво зупиняємо цикл
          if (response.status === 429 || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted')) {
            cachedWorkingModel = null;
            throw new Error('Перевищено хвилинний ліміт запитів Gemini API (15 запитів/хв для безкоштовного тарифу). Будь ласка, зачекайте 10–15 секунд і спробуйте знову.');
          }

          // 2. Невірний або прострочений API ключ — миттєво зупиняємось
          if (
            response.status === 401 ||
            response.status === 403 ||
            (response.status === 400 && (errMsgLower.includes('api key') || errMsgLower.includes('api_key') || errMsgLower.includes('key not valid') || errMsgLower.includes('unauthenticated')))
          ) {
            cachedWorkingModel = null;
            throw new Error('Невірний або недійсний Gemini API ключ. Перевірте його у Налаштуваннях додатку (⚙️).');
          }

          // 3. Занадто великий розмір зображення
          if (
            response.status === 400 &&
            (errMsgLower.includes('payload') ||
              errMsgLower.includes('size') ||
              errMsgLower.includes('limit') ||
              errMsgLower.includes('too large'))
          ) {
            throw new Error('Розмір файлу занадто великий для обробки. Зробіть фото ближче або оберіть файл меншого розміру.');
          }

          // 4. Тимчасові помилки окремої моделі або застарілі моделі (404, 503 чи deprecated) — переходимо до запасної
          const isDeprecatedOrUnavailable =
            response.status === 404 ||
            response.status === 503 ||
            errMsgLower.includes('no longer available') ||
            errMsgLower.includes('not available to new users') ||
            errMsgLower.includes('deprecated') ||
            errMsgLower.includes('not found') ||
            errMsgLower.includes('update your code to use');

          if (isDeprecatedOrUnavailable) {
            cachedWorkingModel = null;
            // Якщо Google вказав актуальну модель у тексті помилки (наприклад: "use models/gemini-3.5-flash-lite")
            const recMatch = errMsg.match(/models\/([a-zA-Z0-9.-]+)/);
            if (recMatch && recMatch[1] && recMatch[1] !== modelName) {
              suggestedReplacementModel = recMatch[1];
            }
            lastError = new Error(errMsg);
            continue;
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
        // Фатальні помилки прокидаємо одразу без марних повторів
        if (
          err.message && (
            err.message.includes('хвилинний ліміт') ||
            err.message.includes('API ключ') ||
            err.message === 'MISSING_API_KEY' ||
            err.message.includes('Час очікування') ||
            err.message.includes('Розмір файлу')
          )
        ) {
          throw err;
        }
      }
    }
    return null;
  };

  let suggestedReplacementModel = null;

  // Спроба 1: пріоритетні моделі (максимум 2 запити)
  const firstResult = await tryGenerateWithList(modelsToTry);
  if (firstResult) return firstResult;

  // Спроба 2: якщо Google прямо вказав робочу модель у тексті відповіді — негайно викликаємо її
  if (suggestedReplacementModel && !modelsToTry.includes(suggestedReplacementModel)) {
    const suggestedResult = await tryGenerateWithList([suggestedReplacementModel]);
    if (suggestedResult) return suggestedResult;
  }

  // Спроба 3: якщо моделі не підійшли — перевіряємо ListModels і пробуємо лише одну найкращу модель
  const discovered = await discoverAvailableModels(cleanKey);
  const newModels = discovered.filter(m => !modelsToTry.includes(m) && m !== suggestedReplacementModel).slice(0, 1);
  if (newModels.length > 0) {
    const secondResult = await tryGenerateWithList(newModels);
    if (secondResult) return secondResult;
  }

  throw lastError || new Error('Не вдалося з’єднатися з Gemini AI. Перевірте з’єднання.');
}

/**
 * ШІ-Аналітик: відповідає на будь-які запитання по транзакціях (напр. "Скільки витрачено за місяць на каву?")
 */
export async function askAIAnalytics({
  apiKey,
  question = '',
  audioBase64 = null,
  audioMimeType = 'audio/mp4',
  mimeType,
  transactions = [],
  categories = [],
  incomeGroups = []
}) {
  const effectiveAudioMime = mimeType || audioMimeType || 'audio/mp4';
  const cleanKey = String(
    apiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || DEFAULT_FALLBACK_GEMINI_KEY || ''
  ).trim();
  if (!cleanKey) {
    throw new Error('Вкажіть ключ Gemini API у Налаштуваннях додатку (⚙️).');
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
        mimeType: effectiveAudioMime,
        data: audioBase64
      }
    });
    parts.push({ text: 'Розпізнай голосове запитання користувача та поверни JSON-звіт аналітики.' });
  } else {
    parts.push({ text: `Запитання користувача: "${question.trim()}"` });
  }

  const candidateModels = cachedWorkingModel
    ? [cachedWorkingModel, ...PREFERRED_GEMINI_MODELS.filter(m => m !== cachedWorkingModel)]
    : [...PREFERRED_GEMINI_MODELS];
  const modelsToTry = candidateModels.slice(0, 2);

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }, 16000);

      const resData = await response.json();
      if (!response.ok) {
        const errMsg = resData?.error?.message || `HTTP ${response.status}`;
        const errMsgLower = errMsg.toLowerCase();

        if (response.status === 429 || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted')) {
          cachedWorkingModel = null;
          throw new Error('Перевищено хвилинний ліміт запитів Gemini API (15 запитів/хв для безкоштовного тарифу). Будь ласка, зачекайте 10–15 секунд і спробуйте знову.');
        }

        if (
          response.status === 401 ||
          response.status === 403 ||
          (response.status === 400 && (errMsgLower.includes('api key') || errMsgLower.includes('api_key') || errMsgLower.includes('key not valid') || errMsgLower.includes('unauthenticated')))
        ) {
          cachedWorkingModel = null;
          throw new Error('Невірний або недійсний Gemini API ключ. Перевірте його у Налаштуваннях додатку (⚙️).');
        }

        // Тимчасові помилки окремої моделі або застарілі моделі (404, 503 чи deprecated)
        const isDeprecatedOrUnavailable =
          response.status === 404 ||
          response.status === 503 ||
          errMsgLower.includes('no longer available') ||
          errMsgLower.includes('not available to new users') ||
          errMsgLower.includes('deprecated') ||
          errMsgLower.includes('not found') ||
          errMsgLower.includes('update your code to use');

        if (isDeprecatedOrUnavailable) {
          cachedWorkingModel = null;
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
      if (
        err.message && (
          err.message.includes('хвилинний ліміт') ||
          err.message.includes('API ключ') ||
          err.message === 'MISSING_API_KEY' ||
          err.message.includes('Час очікування')
        )
      ) {
        throw err;
      }
    }
  }

  throw lastError || new Error('Не вдалося сформувати ШІ-звіт.');
}

