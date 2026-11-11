#!/usr/bin/env node
/**
 * Маршрутизатор задач «Архітектор -> Молодша модель» (Confirmation-First & економія токенів)
 *
 * ГОЛОВНЕ ПРАВИЛО:
 * Якщо користувач запитує аналіз — проводиться аналіз, надаються висновки та варіанти дій,
 * але БЕЗПОСЕРЕДНІ ЗМІНИ КОДУ ТА ЗБІРКИ ВИКОНУЮТЬСЯ ТІЛЬКИ ПІСЛЯ ПРЯМОГО ПІДТВЕРДЖЕННЯ КОРИСТУВАЧА.
 *
 * Як працює:
 * 1. Приймає опис задачі від користувача:
 *    node scripts/architect-router.js "опис вашої задачі"
 * 2. За ключовими словами визначає, які модулі проєкту задіяні, і класифікує підзадачі:
 *    - [SENIOR / АРХІТЕКТОР (Claude / Argon / Pro)]: складна бізнес-логіка, Firebase, мультимодальний ШІ, архітектура.
 *    - [JUNIOR / ВИКОНАВЕЦЬ (Flash / Haiku / Mini)]: верстка, стилі, кнопки, прості зміни за готовим ТЗ.
 * 3. Вирізає ТІЛЬКИ потрібні ділянки коду (замість відправки всіх ~2200 рядків проєкту) і зберігає
 *    готовий компактний промпт у файл `LAST_TASK_PROMPT.md` (та виводить у консоль).
 * 4. Якщо заданий ключ GEMINI_API_KEY, може викликати старшу модель для побудови ТЗ
 *    і після схвалення передати виконання молодшій моделі (`gemini-2.0-flash`).
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

const MODULE_MAP = [
  {
    id: 'ai',
    keywords: ['ші', 'ai', 'голос', 'мікрофон', 'чек', 'фото', 'камер', 'gemini', 'розпізн', 'аудіо', 'скрін'],
    files: ['src/services/ai.js', 'src/components/AIAssistantModal.js'],
    tier: 'SENIOR (Pro / Claude / Argon) — для промптів і логіки API; JUNIOR (Flash) — для UI модалки',
    recommendedSubagentModel: 'pro'
  },
  {
    id: 'dashboard',
    keywords: ['головн', 'дашборд', 'плашк', 'баланс', 'хвил', 'donut', 'кільц', 'скрол', 'список', 'віджет'],
    files: ['src/screens/CurrentMonthScreen.js'],
    tier: 'JUNIOR (Flash) — для верстки карток і кнопок; SENIOR (Pro) — тільки при зміні SVG-математики',
    recommendedSubagentModel: 'flash'
  },
  {
    id: 'budget',
    keywords: ['бюджет', 'ліміт', 'планов', 'спільн', 'особист', 'минул'],
    files: ['src/screens/BudgetScreen.js'],
    tier: 'JUNIOR (Flash / Flash-Lite) — типова логіка форм та списків лімітів',
    recommendedSubagentModel: 'flash'
  },
  {
    id: 'analytics',
    keywords: ['аналітик', 'рік', 'річн', 'статистик', 'відсотк', 'діаграм'],
    files: ['src/screens/AnalyticsScreen.js'],
    tier: 'JUNIOR (Flash / Flash-Lite) — відображення агрегованої статистики',
    recommendedSubagentModel: 'flash'
  },
  {
    id: 'core_sync',
    keywords: ['firebase', 'синхрон', 'налаштуван', 'біометр', 'категорі', 'видален', 'модалк'],
    files: ['App.js', 'src/services/firebase.js'],
    tier: 'SENIOR (Pro) — для синхронізації Firestore; JUNIOR (Flash) — для секцій налаштувань',
    recommendedSubagentModel: 'pro'
  },
  {
    id: 'constants_theme',
    keywords: ['колір', 'темна', 'світла', 'тема', 'іконк', 'назв', 'місяц', 'категор'],
    files: ['src/theme/theme.js', 'src/constants.js'],
    tier: 'JUNIOR (Flash-Lite) — проста зміна констант або кольорів',
    recommendedSubagentModel: 'flash_lite'
  }
];

function analyzeTask(taskQuery) {
  const qLower = (taskQuery || '').toLowerCase();
  let matched = MODULE_MAP.filter(m => m.keywords.some(k => qLower.includes(k)));

  if (matched.length === 0) {
    matched = [MODULE_MAP[1], MODULE_MAP[4]]; // За замовчуванням CurrentMonthScreen + App.js
  }

  const targetFiles = Array.from(new Set(matched.flatMap(m => m.files)));
  const needsSenior = matched.some(m => m.recommendedSubagentModel === 'pro');

  return {
    taskQuery,
    needsSenior,
    recommendedPrimaryModel: needsSenior ? 'pro (Старша модель -> розбиває ТЗ для Flash)' : 'flash (Молодша модель напряму)',
    matchedModules: matched,
    targetFiles
  };
}

function buildCompactPrompt(analysis) {
  const contextFile = path.join(ROOT_DIR, 'CONTEXT.md');
  const contextContent = fs.existsSync(contextFile) ? fs.readFileSync(contextFile, 'utf8') : '';

  let out = `# 🎯 ЗАВДАННЯ З ОПТИМІЗАЦІЄЮ ТОКЕНІВ\n\n`;
  out += `**Запит користувача:** "${analysis.taskQuery}"\n`;
  out += `**Рекомендований маршрут моделей:** ${analysis.recommendedPrimaryModel}\n`;
  out += `**Задіяні файли (${analysis.targetFiles.length} замість усього проєкту):** ${analysis.targetFiles.join(', ')}\n\n`;

  out += `---\n\n`;
  out += `## 🧠 КРОК 1: Інструкція для Старшої моделі (Архітектора — Claude / Argon / Pro)\n`;
  out += `1. НЕ переписуй файли повністю — проаналізуй лише наведені нижче цільові файли.\n`;
  out += `2. Сформуй висновки та коротке покрокове ТЗ з варіантами дій.\n`;
  out += `3. 🛑 ЗАЛІЗНЕ ПРАВИЛО: зупинись після аналізу та плану дій. Виконуй будь-які зміни коду ТІЛЬКИ після прямого підтвердження користувача («роби», «підтверджую»). Жодних дій без згоди!\n\n`;

  out += `---\n\n`;
  out += `## ⚡ КРОК 2: Локальний контекст ТІЛЬКИ потрібних файлів (для Молодшої моделі)\n\n`;

  for (const relFile of analysis.targetFiles) {
    const absPath = path.join(ROOT_DIR, relFile);
    if (!fs.existsSync(absPath)) continue;
    const lines = fs.readFileSync(absPath, 'utf8').split('\n');
    const numberedPreview = lines
      .slice(0, 180)
      .map((line, idx) => `${idx + 1}: ${line}`)
      .join('\n');

    out += `### Файл: \`${relFile}\` (всього рядків: ${lines.length})\n`;
    out += `\`\`\`javascript\n${numberedPreview}\n${lines.length > 180 ? '// ... (решта рядків файла за індексом CONTEXT.md)' : ''}\n\`\`\`\n\n`;
  }

  return out;
}

if (require.main === module) {
  const userQuery = process.argv.slice(2).join(' ').trim() || 'Покращити інтерфейс головного екрану та ШІ-віджета';
  const analysis = analyzeTask(userQuery);
  const promptText = buildCompactPrompt(analysis);

  const outPath = path.join(ROOT_DIR, 'LAST_TASK_PROMPT.md');
  fs.writeFileSync(outPath, promptText, 'utf8');

  console.log('====================================================');
  console.log('🤖 АРХІТЕКТОР-МАРШРУТИЗАТОР (ЕКОНОМІЯ ТОКЕНІВ)');
  console.log('====================================================');
  console.log(`📌 Задача: ${analysis.taskQuery}`);
  console.log(`🧭 Маршрут: ${analysis.recommendedPrimaryModel}`);
  console.log(`📂 Вибрані файли: ${analysis.targetFiles.join(', ')}`);
  console.log(`💾 Згенеровано компактний промпт: ${outPath}`);
  console.log('====================================================');
}

module.exports = { analyzeTask, buildCompactPrompt };
