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
