// Сервіс ШІ-асистента (Google Gemini Multimodal API) для розпізнавання голосу, фото чеків, тексту та аналітики

const DEFAULT_FALLBACK_GEMINI_KEY = '';

// Актуальні офіційні безкоштовні моделі Google AI Studio (v1beta API) станом на листопад 2026
// (gemini-3.6-flash вилучено, оскільки Google заблокував її для нових/неактивних проєктів 19.11.2026)
const PREFERRED_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

let cachedWorkingModel = null;

/**
 * Універсальний стабільний пресет запису голосу AAC/M4A для Android, iOS та Web.
 * 44100 Hz / 64 kbps mono стабільно підтримується усіма апаратними енкодерами Android
 * без помилок MediaRecorder.stop() (~40 КБ за 5 сек аудіо).
 */
export function getGeminiRecordingPreset(Audio) {
  return {
    isMeteringEnabled: false,
    android: {
      extension: '.m4a',
      outputFormat: Audio?.AndroidOutputFormat?.MPEG_4 ?? 2,
      audioEncoder: Audio?.AndroidAudioEncoder?.AAC ?? 3,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 64000
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio?.IOSOutputFormat?.MPEG4AAC ?? 'aac ',
      audioQuality: Audio?.IOSAudioQuality?.MEDIUM ?? 64,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 64000
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 64000
    }
  };
}

function normalizeAudioMime(mime) {
  let clean = String(mime || 'audio/m4a').trim().toLowerCase();
  if (!clean || clean === 'audio/mp4' || clean.includes('3gp')) {
    clean = 'audio/m4a';
  }
  return clean;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Підбір оптимального thinkingConfig для моделей Gemini 3.x / 4.x
 * щоб уникати зайвих 15-20 сек роздумів на простих задачах витягання JSON.
 */
function getThinkingConfigForModel(modelName) {
  const n = String(modelName || '').toLowerCase();
  if (n.includes('3.5-flash-lite') || n.includes('3.1-flash-lite')) {
    return { thinkingLevel: 'minimal' };
  }
  if (n.includes('3.8-flash') || n.includes('3.5-flash') || n.includes('gemini-4') || n.includes('3.1-pro')) {
    return { thinkingLevel: 'low' };
  }
  return null;
}

/**
 * Безпечне витягання тексту відповіді з candidates, ігноруючи службові thought-частини Gemini 3.x
 */
function extractTextFromGeminiResponse(resData) {
  const parts = resData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return '';

  const nonThoughtText = parts
    .filter(p => !p.thought && typeof p.text === 'string' && p.text.trim().length > 0)
    .map(p => p.text)
    .join('\n')
    .trim();

  if (nonThoughtText) return nonThoughtText;

  return parts
    .filter(p => typeof p.text === 'string' && p.text.trim().length > 0)
    .map(p => p.text)
    .join('\n')
    .trim();
}

/**
 * Надійний парсер JSON-відповіді (знімає markdown-обгортки та витягує JSON-блок при наявності зайвого тексту)
 */
function parseGeminiJsonText(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!cleaned) {
    throw new Error('ШІ повернув порожню відповідь.');
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      return JSON.parse(objMatch[0]);
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      return JSON.parse(arrMatch[0]);
    }
    throw new Error('Не вдалося розібрати відповідь ШІ.');
  }
}

/**
 * fetch з таймаутом через AbortController для захисту від нескінченного зависання на Android
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 22000) {
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
      const timeoutErr = new Error(`Час очікування Gemini API вичерпано (${Math.round(timeoutMs / 1000)} сек). Перевірте інтернет-з'єднання і спробуйте знову.`);
      timeoutErr.isTimeout = true;
      throw timeoutErr;
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
    const rawBody = await res.text();
    const data = rawBody ? JSON.parse(rawBody) : null;
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
          name.includes('3.6-flash') ||
          name.includes('2.5-flash') ||
          name.includes('2.5-pro') ||
          name.includes('2.0-flash')
        ) {
          return false;
        }
        return name.includes('gemini');
      })
      .map(m => m.name.replace(/^models\//, ''));

    // Сортуємо: найвищий пріоритет офіційно рекомендованим безкоштовним flash-lite та flash
    supported.sort((a, b) => {
      const score = (n) => {
        if (n === 'gemini-3.5-flash-lite') return 220;
        if (n === 'gemini-3.1-flash-lite') return 200;
        if (n === 'gemini-3.8-flash') return 180;
        if (n === 'gemini-flash-latest') return 150;
        if (n.includes('3.5-flash')) return 130;
        if (n.includes('3.1-flash-lite')) return 120;
        if (n.includes('3.8-flash')) return 110;
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
 * Єдине відмовостійке ядро виклику Gemini API з поверненням розпарсеного JSON:
 * - Автоматичний короткий retry (1.2 сек) при тимчасовому 503/502/504
 * - Плавний перехід на резервну безкоштовну модель при 429 (ліміти окремі на модель!), 503, 404 або таймауті
 * - Фільтрація thought-блоків Gemini 3.x та безпечний парсинг відповіді
 */
async function callGeminiJSON({ cleanKey, parts, timeoutMs = 22000 }) {
  const candidateModels = cachedWorkingModel
    ? [cachedWorkingModel, ...PREFERRED_GEMINI_MODELS.filter(m => m !== cachedWorkingModel)]
    : [...PREFERRED_GEMINI_MODELS];
  const initialModels = candidateModels.slice(0, 3);

  let lastError = null;
  let suggestedReplacementModel = null;
  let sawRateLimit = false;
  let sawTimeout = false;

  const tryGenerateWithList = async (modelList) => {
    for (const modelName of modelList) {
      const generationConfig = {
        responseMimeType: 'application/json'
      };
      const thinkingConfig = getThinkingConfigForModel(modelName);
      if (thinkingConfig) {
        generationConfig.thinkingConfig = thinkingConfig;
      }

      const payloadStr = JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig
      });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;

      // До 2 спроб на тій самій моделі, якщо Google тимчасово віддав 503/502/504
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetchWithTimeout(
            url,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payloadStr
            },
            timeoutMs
          );

          const rawBody = await response.text();
          let resData = null;
          try {
            resData = rawBody ? JSON.parse(rawBody) : null;
          } catch (jsonBodyErr) {
            resData = null;
          }

          if (!response.ok) {
            const errMsg = resData?.error?.message || `HTTP ${response.status}`;
            const errMsgLower = errMsg.toLowerCase();

            // 1. Невірний або недійсний API ключ — фатальна помилка, миттєво зупиняємось
            if (
              response.status === 401 ||
              response.status === 403 ||
              (response.status === 400 &&
                (errMsgLower.includes('api key') ||
                  errMsgLower.includes('api_key') ||
                  errMsgLower.includes('key not valid') ||
                  errMsgLower.includes('unauthenticated')))
            ) {
              cachedWorkingModel = null;
              const authErr = new Error('Невірний або недійсний Gemini API ключ. Перевірте його у Налаштуваннях додатку (⚙️).');
              authErr.isFatal = true;
              throw authErr;
            }

            // 2. Занадто великий розмір файлу — фатальна помилка
            if (
              response.status === 400 &&
              (errMsgLower.includes('payload') ||
                errMsgLower.includes('size') ||
                errMsgLower.includes('too large'))
            ) {
              const sizeErr = new Error('Розмір файлу занадто великий для обробки. Зробіть фото ближче або оберіть менший файл.');
              sizeErr.isFatal = true;
              throw sizeErr;
            }

            // 3. Тимчасове перевантаження серверів Google (500/502/503/504) — 1 повтор через 1.2 сек, далі запасна модель
            if (response.status === 503 || response.status === 502 || response.status === 504 || response.status === 500) {
              lastError = new Error('Сервери Google Gemini тимчасово перевантажені. Спробуйте ще раз.');
              if (attempt === 0) {
                await sleep(1200);
                continue;
              }
              cachedWorkingModel = null;
              break;
            }

            // 4. Ліміт конкретної моделі (429 / quota) — переходимо на іншу безкоштовну модель (у кожної свій ліміт!)
            if (response.status === 429 || errMsgLower.includes('quota') || errMsgLower.includes('resource_exhausted')) {
              sawRateLimit = true;
              cachedWorkingModel = null;
              lastError = new Error('Перевищено ліміт запитів Gemini API (безкоштовний тариф). Зачекайте 10–15 секунд і спробуйте знову.');
              break;
            }

            // 5. Модель недоступна / застаріла (404 / deprecated) — шукаємо заміну
            const isDeprecatedOrUnavailable =
              response.status === 404 ||
              errMsgLower.includes('no longer available') ||
              errMsgLower.includes('not available to new users') ||
              errMsgLower.includes('deprecated') ||
              errMsgLower.includes('not found') ||
              errMsgLower.includes('update your code to use');

            if (isDeprecatedOrUnavailable) {
              cachedWorkingModel = null;
              const recMatch = errMsg.match(/models\/([a-zA-Z0-9.-]+)/);
              if (recMatch && recMatch[1] && recMatch[1] !== modelName) {
                suggestedReplacementModel = recMatch[1];
              }
              lastError = new Error(errMsg);
              break;
            }

            // Інша помилка конкретної моделі (наприклад, непідтриманий thinkingLevel) — переходимо до наступної
            lastError = new Error(`Помилка Gemini API: ${errMsg}`);
            break;
          }

          if (!resData) {
            lastError = new Error('Сервер Gemini повернув порожню або пошкоджену відповідь.');
            if (attempt === 0) {
              await sleep(1000);
              continue;
            }
            break;
          }

          const rawText = extractTextFromGeminiResponse(resData);
          if (!rawText) {
            lastError = new Error('ШІ повернув порожню відповідь.');
            break;
          }

          const parsed = parseGeminiJsonText(rawText);
          cachedWorkingModel = modelName;
          return parsed;
        } catch (err) {
          if (err.isFatal) {
            throw err;
          }
          lastError = err;
          if (err.isTimeout) {
            sawTimeout = true;
            cachedWorkingModel = null;
            // Переходимо до наступної швидкої моделі замість миттєвої відмови
            break;
          }
          // Мережева помилка (наприклад, короткий обрив зв'язку) — 1 повтор на тій самій моделі
          if (attempt === 0 && (err.message?.includes('Network request failed') || err.name === 'TypeError')) {
            await sleep(1000);
            continue;
          }
          break;
        }
      }
    }
    return null;
  };

  // Спроба 1: актуальний ланцюжок безкоштовних моделей (до 3 моделей)
  const firstResult = await tryGenerateWithList(initialModels);
  if (firstResult) return firstResult;

  // Спроба 2: якщо Google вказав рекомендовану заміну в тексті помилки
  if (suggestedReplacementModel && !initialModels.includes(suggestedReplacementModel)) {
    const suggestedResult = await tryGenerateWithList([suggestedReplacementModel]);
    if (suggestedResult) return suggestedResult;
  }

  // Спроба 3: динамічний пошук доступних моделей через ListModels API
  const discovered = await discoverAvailableModels(cleanKey);
  const newModels = discovered
    .filter(m => !initialModels.includes(m) && m !== suggestedReplacementModel)
    .slice(0, 1);

  if (newModels.length > 0) {
    const thirdResult = await tryGenerateWithList(newModels);
    if (thirdResult) return thirdResult;
  }

  if (sawRateLimit) {
    throw new Error('Перевищено ліміт запитів Gemini API (безкоштовний тариф). Будь ласка, зачекайте 10–15 секунд і спробуйте знову.');
  }
  if (sawTimeout) {
    throw new Error(`Час очікування Gemini API вичерпано (${Math.round(timeoutMs / 1000)} сек). Перевірте інтернет-з'єднання і спробуйте знову.`);
  }

  throw lastError || new Error('Не вдалося з’єднатися з Gemini AI. Перевірте інтернет-з’єднання і спробуйте знову.');
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
 * Основна функція виклику Gemini API для розпізнавання голосу, фото чеків/скріншотів і тексту
 */
export async function analyzeTransactionsWithAI({
  apiKey,
  mode = 'voice', // 'voice' | 'photo' | 'text'
  receiptSplitMode = 'total', // 'total' | 'items'
  audioBase64,
  audioMimeType = 'audio/m4a',
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
        mimeType: normalizeAudioMime(audioMimeType),
        data: audioBase64
      }
    });
    parts.push({
      text: 'Розпізнай це голосове повідомлення про витрати/доходи та поверни JSON.'
    });
  } else if (mode === 'photo' && imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMimeType || 'image/jpeg',
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

  const parsed = await callGeminiJSON({
    cleanKey,
    parts,
    timeoutMs: 22000
  });

  const rawList = Array.isArray(parsed)
    ? parsed
    : (Array.isArray(parsed?.transactions) ? parsed.transactions : []);

  const normalizedTransactions = rawList
    .map(item => normalizeTransactionItem(item, categories, incomeGroups, defaultAuthor))
    .filter(item => item.amount > 0);

  return {
    transcript: parsed?.transcript || '',
    transactions: normalizedTransactions
  };
}

/**
 * ШІ-Аналітик: відповідає на будь-які запитання по транзакціях (напр. "Скільки витрачено за місяць на каву?")
 */
export async function askAIAnalytics({
  apiKey,
  question = '',
  audioBase64 = null,
  audioMimeType = 'audio/m4a',
  mimeType,
  transactions = [],
  categories = [],
  incomeGroups = []
}) {
  const effectiveAudioMime = normalizeAudioMime(mimeType || audioMimeType);
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

  return await callGeminiJSON({
    cleanKey,
    parts,
    timeoutMs: 25000
  });
}
