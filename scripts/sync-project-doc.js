#!/usr/bin/env node
/**
 * Скрипт автоматичної синхронізації всього коду проєкту у єдиний файл PROJECT_FULL_CODE.md
 * Запуск: node scripts/sync-project-doc.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT_DIR, 'PROJECT_FULL_CODE.md');

const FILES_TO_INCLUDE = [
  { relPath: 'package.json', lang: 'json', title: '1. Конфігурація залежностей (package.json)' },
  { relPath: 'app.json', lang: 'json', title: '2. Конфігурація Expo та дозволів Android/iOS (app.json)' },
  { relPath: 'index.js', lang: 'javascript', title: '3. Точка входу додатку (index.js)' },
  { relPath: 'src/services/firebase.js', lang: 'javascript', title: '4. Підключення Firebase Firestore (src/services/firebase.js)' },
  { relPath: 'src/services/ai.js', lang: 'javascript', title: '5. ШІ-сервіс Google Gemini для голосу, фото чеків і тексту (src/services/ai.js)' },
  { relPath: 'src/theme/theme.js', lang: 'javascript', title: '6. Теми оформлення (src/theme/theme.js)' },
  { relPath: 'src/constants.js', lang: 'javascript', title: '7. Категорії витрат, доходів та константи (src/constants.js)' },
  { relPath: 'src/components/AIAssistantModal.js', lang: 'javascript', title: '8. Модальне вікно ШІ-Асистента (src/components/AIAssistantModal.js)' },
  { relPath: 'src/screens/CurrentMonthScreen.js', lang: 'javascript', title: '9. Головний екран: 40% Дашборд-хаб, ШІ-віджет та список операцій (src/screens/CurrentMonthScreen.js)' },
  { relPath: 'src/screens/AnalyticsScreen.js', lang: 'javascript', title: '10. Екран річної аналітики та ШІ-Аналітика (src/screens/AnalyticsScreen.js)' },
  { relPath: 'src/screens/BudgetScreen.js', lang: 'javascript', title: '11. Екран планування бюджету (src/screens/BudgetScreen.js)' },
  { relPath: 'App.js', lang: 'javascript', title: '12. Головний файл додатку (App.js)' },
  { relPath: 'plugins/withAndroidAIWidget.js', lang: 'javascript', title: '13. Нативний віджет для робочого столу Android (plugins/withAndroidAIWidget.js)' },
  { relPath: 'plugins/withNotificationListener.js', lang: 'javascript', title: '14. Нативний сервіс перехоплення сповіщень Google Wallet та банків (plugins/withNotificationListener.js)' },
  { relPath: 'src/services/walletListener.js', lang: 'javascript', title: '15. Клієнтський сервіс взаємодії з буфером Google Wallet (src/services/walletListener.js)' },
  { relPath: 'src/components/PendingTransactionsModal.js', lang: 'javascript', title: '16. Модальне вікно підтвердження оплат Google Wallet (src/components/PendingTransactionsModal.js)' },
  { relPath: 'src/components/FamilyInviteModal.js', lang: 'javascript', title: '17. Модальне вікно управління сім\'єю та запрошення (src/components/FamilyInviteModal.js)' }
];

function generateFullProjectDoc() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const nowStr = new Date().toISOString().split('T')[0];

  let md = `# Повний код проєкту «Наші Гроші» (v${pkg.version})\n\n`;
  md += `> Автоматично згенеровано: ${nowStr} через \`node scripts/sync-project-doc.js\`\n`;
  md += `> Цей файл містить актуальний вихідний код усіх модулів додатку (включно з Firebase синхронізацією та ШІ-асистентом голосу і фото чеків).\n\n`;
  md += `---\n\n`;

  for (const item of FILES_TO_INCLUDE) {
    const fullPath = path.join(ROOT_DIR, item.relPath);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    md += `## ${item.title}\n`;
    md += `**Файл:** \`${item.relPath}\`\n\n`;
    md += `\`\`\`${item.lang}\n${content.trim()}\n\`\`\`\n\n---\n\n`;
  }

  fs.writeFileSync(OUTPUT_FILE, md, 'utf8');
  console.log(`✅ Файл проєкту успішно оновлено: ${OUTPUT_FILE} (${Math.round(md.length / 1024)} KB)`);
}

generateFullProjectDoc();
