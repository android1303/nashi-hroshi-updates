// Сервіс для роботи з непідтвердженими платежами Google Wallet та банківських сповіщень
import { Linking, Platform } from 'react-native';

let FileSystem = null;
try {
  FileSystem = require('expo-file-system');
} catch (e) {}

const PENDING_FILE = 'pending_wallet_notifications.json';

function getPendingFileUri() {
  if (!FileSystem || !FileSystem.documentDirectory) return null;
  return FileSystem.documentDirectory + PENDING_FILE;
}

/**
 * Читає список непідтверджених платежів, перехоплених нативним слухачем
 */
export async function getPendingWalletPayments() {
  try {
    const uri = getPendingFileUri();
    if (!uri || !FileSystem) return [];

    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) return [];

    const content = await FileSystem.readAsStringAsync(uri);
    if (!content || !content.trim()) return [];

    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Видаляє один підтверджений або відхилений платіж
 */
export async function removePendingPayment(paymentId) {
  try {
    const list = await getPendingWalletPayments();
    const updated = list.filter(p => p.id !== paymentId);

    const uri = getPendingFileUri();
    if (uri && FileSystem) {
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(updated));
    }
    return updated;
  } catch (e) {
    return [];
  }
}

/**
 * Очищає всі непідтверджені платежі (наприклад, після «Підтвердити всі»)
 */
export async function clearAllPendingPayments() {
  try {
    const uri = getPendingFileUri();
    if (uri && FileSystem) {
      await FileSystem.writeAsStringAsync(uri, JSON.stringify([]));
    }
  } catch (e) {}
}

/**
 * Додає тестовий платіж (для перевірки роботи UI без відвідування магазину)
 */
export async function addTestPayment({
  amount = 185.50,
  merchant = 'Сільпо',
  category = 'Продукти'
} = {}) {
  try {
    const list = await getPendingWalletPayments();
    const newPayment = {
      id: 'test_' + Date.now(),
      timestamp: Date.now(),
      packageName: 'com.google.android.apps.walletnfcrel',
      amount: Number(amount) || 185.50,
      merchant: merchant || 'Сільпо',
      rawText: `Оплата ${amount} ₴ в ${merchant}. Картка *1234`,
      suggestedCategory: category || 'Продукти'
    };

    list.unshift(newPayment);

    const uri = getPendingFileUri();
    if (uri && FileSystem) {
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(list));
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * Відкриває системний екран Android «Доступ до сповіщень»
 */
export async function openNotificationSettings() {
  if (Platform.OS !== 'android') return;
  try {
    const canOpen = await Linking.canOpenURL('nashihroshi://open-notification-settings');
    if (canOpen) {
      await Linking.openURL('nashihroshi://open-notification-settings');
      return;
    }
  } catch (e) {}

  // Резервний варіант: загальні налаштування додатку
  try {
    await Linking.openSettings();
  } catch (e) {}
}
