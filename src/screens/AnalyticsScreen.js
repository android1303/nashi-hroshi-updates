import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { askAIAnalytics } from '../services/ai';

let Audio = null;
try { Audio = require('expo-av').Audio; } catch (e) {}
let FileSystem = null;
try { FileSystem = require('expo-file-system'); } catch (e) {}

const QUICK_CHIPS = [
  '☕ Скільки на каву та кафе?',
  '🛒 Скільки на продукти?',
  '⛽ Витрати на авто та пальне',
  '🏆 Топ-5 найбільших витрат',
  '👥 Хто скільки витратив?'
];

const CATEGORY_COLORS = [
  '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0',
  '#00BCD4', '#FF5722', '#3F51B5', '#009688', '#FFC107'
];

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
  geminiApiKey = '',
  onBack
}) {
  const currentYearStr = new Date().getFullYear().toString();

  // Визначення доступних років та дефолтного року (з найбільшою кількістю операцій)
  const { availableYears, defaultYear } = useMemo(() => {
    const counts = {};
    transactions.forEach(t => {
      if (t.date && t.date.length >= 4) {
        const y = t.date.substring(0, 4);
        counts[y] = (counts[y] || 0) + 1;
      }
    });
    if (!counts[currentYearStr]) {
      counts[currentYearStr] = 0;
    }
    const years = Object.keys(counts).sort((a, b) => b.localeCompare(a));
    let bestYear = currentYearStr;
    let maxCount = -1;
    years.forEach(y => {
      if (counts[y] > maxCount) {
        maxCount = counts[y];
        bestYear = y;
      }
    });
    return { availableYears: years, defaultYear: bestYear };
  }, [transactions, currentYearStr]);

  const [selectedYear, setSelectedYear] = useState(defaultYear);

  // Стан ШІ-Аналітика
  const [questionInput, setQuestionInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiReport, setAiReport] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef(null);

  // Фільтрація транзакцій за вибраним роком (або всіма) та глобальним фільтром автора
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchYear = selectedYear === 'all' ? true : (t.date && t.date.startsWith(selectedYear));
      const matchUser = globalUserFilter === 'all' ? true : t.author === globalUserFilter;
      return matchYear && matchUser;
    });
  }, [transactions, selectedYear, globalUserFilter]);

  // Річний баланс
  const { yearlyIncome, yearlyExpense, netBalance } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') inc += amt;
      else exp += amt;
    });
    return { yearlyIncome: inc, yearlyExpense: exp, netBalance: inc - exp };
  }, [filteredTransactions]);

  // Допоміжна функція для пошуку іконки категорії
  const getCategoryIcon = (catName) => {
    if (!catName) return 'pricetag-outline';
    for (const group of categories) {
      if (group.name === catName && group.icon) return group.icon;
      if (Array.isArray(group.subcategories)) {
        const sub = group.subcategories.find(s => (typeof s === 'object' ? s.name === catName : s === catName));
        if (sub) {
          return (typeof sub === 'object' && sub.icon) ? sub.icon : (group.icon || 'pricetag-outline');
        }
      }
    }
    return 'pricetag-outline';
  };

  // Реальний розподіл витрат за категоріями
  const categoryBreakdown = useMemo(() => {
    const map = {};
    filteredTransactions.forEach(t => {
      if (t.type === 'income') return;
      const cat = t.category || t.group || 'Інше';
      const amt = Number(t.amount) || 0;
      if (!map[cat]) {
        map[cat] = { name: cat, amount: 0, count: 0, icon: getCategoryIcon(cat) };
      }
      map[cat].amount += amt;
      map[cat].count += 1;
    });
    const list = Object.values(map).sort((a, b) => b.amount - a.amount);
    return list.map((item, idx) => ({
      ...item,
      percent: yearlyExpense > 0 ? Math.round((item.amount / yearlyExpense) * 1000) / 10 : 0,
      color: CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
    }));
  }, [filteredTransactions, yearlyExpense, categories]);

  const formatMoney = (val) => {
    if (hideBalance) return '•••• ₴';
    const num = Number(val) || 0;
    return `${num.toLocaleString('uk-UA')} ₴`;
  };

  const resetAudioMode = async () => {
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });
    } catch (e) {}
  };

  const stopAndCleanupRecording = async () => {
    setIsRecording(false);
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) {
      try {
        await rec.stopAndUnloadAsync();
      } catch (e) {}
    }
    await resetAudioMode();
  };

  useEffect(() => {
    return () => {
      stopAndCleanupRecording();
    };
  }, []);

  // Запит до ШІ-Аналітика
  const handleAskAI = async (customQuestion = null, audioBase64 = null, mimeType = 'audio/mp4') => {
    const q = customQuestion !== null ? customQuestion : questionInput.trim();
    if (!q && !audioBase64) return;

    if (customQuestion !== null) {
      setQuestionInput(customQuestion);
    }

    setAiLoading(true);
    setAiError('');
    try {
      const result = await askAIAnalytics({
        question: q,
        audioBase64,
        mimeType,
        transactions: filteredTransactions.length > 0 ? filteredTransactions : transactions,
        categories,
        apiKey: geminiApiKey
      });
      setAiReport(result);
      if (result?.questionRecognized && audioBase64) {
        setQuestionInput(result.questionRecognized);
      }
    } catch (err) {
      setAiError(err?.message || 'Не вдалося отримати відповідь від ШІ-Аналітика.');
    } finally {
      setAiLoading(false);
    }
  };

  // Запис голосу через expo-av
  const handleToggleVoice = async () => {
    if (!Audio) {
      setAiError('Модуль запису звуку (expo-av) недоступний на цьому пристрої.');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      const rec = recordingRef.current;
      recordingRef.current = null;
      let uri = null;
      try {
        if (rec) {
          await rec.stopAndUnloadAsync();
          uri = rec.getURI();
        }
      } catch (e) {
        setAiError('Помилка зупинки запису: ' + (e?.message || ''));
      } finally {
        await resetAudioMode();
      }

      if (uri && FileSystem) {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType?.Base64 || 'base64'
          });
          try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}
          const lowerUri = uri.toLowerCase();
          const detectedMime = lowerUri.endsWith('.3gp') || lowerUri.endsWith('.3gpp')
            ? 'audio/3gpp'
            : (lowerUri.endsWith('.aac') ? 'audio/aac' : 'audio/mp4');
          await handleAskAI('', base64, detectedMime);
        } catch (readErr) {
          setAiError('Не вдалося прочитати аудіозапис: ' + (readErr?.message || ''));
        }
      }
    } else {
      await stopAndCleanupRecording();
      try {
        setAiError('');
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status !== 'granted') {
          setAiError('Немає дозволу на використання мікрофона.');
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
        // Невелика пауза для звільнення нативного MediaRecorder на Android
        await new Promise(r => setTimeout(r, 120));

        const preset = Audio.RecordingOptionsPresets?.LOW_QUALITY || Audio.RecordingOptionsPresets?.HIGH_QUALITY;
        const { recording } = await Audio.Recording.createAsync(preset);

        recordingRef.current = recording;
        setIsRecording(true);
      } catch (e) {
        await stopAndCleanupRecording();
        setAiError('Не вдалося почати запис: ' + (e?.message || ''));
        setIsRecording(false);
      }
    }
  };

  const textColor = theme?.text || (isLight ? '#1A1A1A' : '#FFFFFF');
  const subTextColor = theme?.subText || (isLight ? '#666666' : '#AAAAAA');
  const accentColor = theme?.accent || '#4CAF50';

  return (
    <ScrollView style={[styles.container, { backgroundColor: bgColor }]} contentContainerStyle={styles.contentContainer}>
      {/* Шапка та перемикач року */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={textColor} />
            </TouchableOpacity>
          )}
          <Text style={[styles.screenTitle, { color: textColor }]}>Аналітика бюджету</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearTabsScroll} contentContainerStyle={styles.yearTabsContainer}>
        {availableYears.map(yr => {
          const active = selectedYear === yr;
          return (
            <TouchableOpacity
              key={yr}
              onPress={() => setSelectedYear(yr)}
              style={[
                styles.yearTab,
                { backgroundColor: active ? accentColor : cardBg, borderColor: active ? accentColor : borderColor }
              ]}
            >
              <Text style={[styles.yearTabText, { color: active ? '#FFFFFF' : textColor }]}>{yr} рік</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => setSelectedYear('all')}
          style={[
            styles.yearTab,
            { backgroundColor: selectedYear === 'all' ? accentColor : cardBg, borderColor: selectedYear === 'all' ? accentColor : borderColor }
          ]}
        >
          <Text style={[styles.yearTabText, { color: selectedYear === 'all' ? '#FFFFFF' : textColor }]}>Весь час</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* БЛОК 1: Картка «🤖 ШІ-Аналітик бюджету» */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: textColor }]}>🤖 ШІ-Аналітик бюджету</Text>
          {isRecording && (
            <View style={styles.recordingBadge}>
              <Text style={styles.recordingBadgeText}>● Запис...</Text>
            </View>
          )}
        </View>
        <Text style={[styles.cardSubtitle, { color: subTextColor }]}>
          Запитайте текстом або голосом про будь-які витрати, товари чи категорії
        </Text>

        {/* Поле вводу + кнопки 🎙 та ✨ */}
        <View style={styles.inputRow}>
          <TextInput
            value={questionInput}
            onChangeText={setQuestionInput}
            placeholder="Напр.: Скільки витрачено за місяць на каву?"
            placeholderTextColor={subTextColor}
            style={[
              styles.questionInput,
              { color: textColor, borderColor, backgroundColor: isLight ? '#F5F7FA' : '#1E1E1E' }
            ]}
            onSubmitEditing={() => handleAskAI()}
          />
          <TouchableOpacity
            onPress={handleToggleVoice}
            style={[
              styles.iconActionBtn,
              { backgroundColor: isRecording ? '#E53935' : (isLight ? '#EFEFEF' : '#2C2C2C'), borderColor }
            ]}
            disabled={aiLoading}
          >
            <Text style={styles.btnEmoji}>{isRecording ? '⏹' : '🎙'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleAskAI()}
            style={[styles.iconActionBtn, { backgroundColor: accentColor, borderColor: accentColor }]}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.btnEmoji}>✨</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Швидкі чіпи-запити */}
        <View style={styles.chipsWrap}>
          {QUICK_CHIPS.map((chip, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => handleAskAI(chip)}
              disabled={aiLoading}
              style={[
                styles.chipBtn,
                { backgroundColor: isLight ? '#F0F4F8' : '#252830', borderColor }
              ]}
            >
              <Text style={[styles.chipText, { color: textColor }]}>{chip}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Помилка ШІ */}
        {!!aiError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#E53935" />
            <Text style={styles.errorText}>{aiError}</Text>
          </View>
        )}

        {/* Стан завантаження */}
        {aiLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={accentColor} />
            <Text style={[styles.loadingText, { color: subTextColor }]}>Аналізую транзакції...</Text>
          </View>
        )}

        {/* Результат звіту aiReport */}
        {!aiLoading && aiReport && (
          <View style={[styles.reportCard, { backgroundColor: isLight ? '#F8FAFC' : '#1B1E24', borderColor }]}>
            {!!aiReport.questionRecognized && (
              <Text style={[styles.recognizedQuery, { color: subTextColor }]}>
                Запит: «{aiReport.questionRecognized}»
              </Text>
            )}

            <View style={styles.reportHeaderRow}>
              <Text style={[styles.reportHeadline, { color: textColor }]}>
                {aiReport.headline || 'Результат аналізу'}
              </Text>
              <View style={[styles.reportTotalBadge, { backgroundColor: accentColor }]}>
                <Text style={styles.reportTotalText}>
                  {hideBalance ? '•••• ₴' : `${(Number(aiReport.totalAmount) || 0).toLocaleString('uk-UA')} ₴`}
                </Text>
                <Text style={styles.reportCountText}>
                  {aiReport.operationsCount || 0} оп.
                </Text>
              </View>
            </View>

            {!!aiReport.details && (
              <Text style={[styles.reportDetails, { color: textColor }]}>
                {aiReport.details}
              </Text>
            )}

            {/* Список знайдених операцій */}
            {Array.isArray(aiReport.matchedItems) && aiReport.matchedItems.length > 0 && (
              <View style={[styles.matchedList, { borderTopColor: borderColor }]}>
                <Text style={[styles.matchedTitle, { color: subTextColor }]}>
                  Знайдені операції ({aiReport.matchedItems.length}):
                </Text>
                {aiReport.matchedItems.map((item, i) => (
                  <View key={i} style={[styles.matchedItemRow, { borderBottomColor: borderColor }]}>
                    <View style={styles.matchedLeft}>
                      <Text style={[styles.matchedCategory, { color: textColor }]} numberOfLines={1}>
                        {item.category || 'Без категорії'}
                        {item.note ? ` — ${item.note}` : ''}
                      </Text>
                      <Text style={[styles.matchedMeta, { color: subTextColor }]}>
                        {item.date || '—'} {item.author ? `• ${item.author}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.matchedAmount, { color: textColor }]}>
                      {formatMoney(item.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Порада з іконкою лампочки */}
            {!!aiReport.tip && (
              <View style={[styles.tipBox, { backgroundColor: isLight ? '#FFF8E1' : '#2C2612' }]}>
                <Ionicons name="bulb-outline" size={20} color="#FFA000" style={styles.tipIcon} />
                <Text style={[styles.tipText, { color: isLight ? '#5D4037' : '#FFE082' }]}>
                  {aiReport.tip}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* БЛОК 2: Картка Річного балансу */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <Text style={[styles.cardTitle, { color: textColor }]}>
          📊 Баланс ({selectedYear === 'all' ? 'Весь час' : `${selectedYear} рік`})
        </Text>

        <View style={styles.balanceGrid}>
          <View style={[styles.balanceItem, { backgroundColor: isLight ? '#E8F5E9' : '#142918' }]}>
            <Text style={[styles.balanceLabel, { color: subTextColor }]}>Доходи</Text>
            <Text style={[styles.balanceValue, { color: '#4CAF50' }]}>
              +{formatMoney(yearlyIncome)}
            </Text>
          </View>

          <View style={[styles.balanceItem, { backgroundColor: isLight ? '#FFEBEE' : '#2D1618' }]}>
            <Text style={[styles.balanceLabel, { color: subTextColor }]}>Витрати</Text>
            <Text style={[styles.balanceValue, { color: '#F44336' }]}>
              -{formatMoney(yearlyExpense)}
            </Text>
          </View>
        </View>

        <View style={[styles.netBalanceRow, { borderTopColor: borderColor }]}>
          <Text style={[styles.netBalanceLabel, { color: textColor }]}>Чистий баланс:</Text>
          <Text
            style={[
              styles.netBalanceValue,
              { color: netBalance >= 0 ? '#4CAF50' : '#F44336' }
            ]}
          >
            {netBalance >= 0 ? '+' : ''}{formatMoney(netBalance)}
          </Text>
        </View>
      </View>

      {/* БЛОК 3: Реальний розподіл витрат за категоріями */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { color: textColor }]}>
            🗂 Розподіл витрат за категоріями
          </Text>
          <Text style={[styles.totalCategoriesCount, { color: subTextColor }]}>
            {categoryBreakdown.length} кат.
          </Text>
        </View>

        {categoryBreakdown.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="pie-chart-outline" size={36} color={subTextColor} />
            <Text style={[styles.emptyText, { color: subTextColor }]}>
              Немає витрат за вибраний період
            </Text>
          </View>
        ) : (
          categoryBreakdown.map((cat, idx) => (
            <View key={cat.name + idx} style={styles.categoryItem}>
              <View style={styles.categoryTopRow}>
                <View style={styles.categoryNameWrap}>
                  {showIcons && (
                    <View style={[styles.categoryIconCircle, { backgroundColor: cat.color + '22' }]}>
                      <Ionicons name={cat.icon || 'pricetag-outline'} size={16} color={cat.color} />
                    </View>
                  )}
                  <Text style={[styles.categoryName, { color: textColor }]} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <Text style={[styles.categoryOpsCount, { color: subTextColor }]}>
                    ({cat.count})
                  </Text>
                </View>

                <View style={styles.categoryRightWrap}>
                  <Text style={[styles.categoryAmount, { color: textColor }]}>
                    {formatMoney(cat.amount)}
                  </Text>
                  <Text style={[styles.categoryPercent, { color: cat.color }]}>
                    {cat.percent}%
                  </Text>
                </View>
              </View>

              {/* Кольоровий прогрес-бар */}
              <View style={[styles.progressTrack, { backgroundColor: isLight ? '#E2E8F0' : '#2D3139' }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${Math.min(Math.max(cat.percent, 2), 100)}%`,
                      backgroundColor: cat.color
                    }
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  contentContainer: {
    padding: 14,
    paddingBottom: 40
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  backBtn: {
    marginRight: 10,
    padding: 4
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: 'bold'
  },
  yearTabsScroll: {
    marginBottom: 14
  },
  yearTabsContainer: {
    flexDirection: 'row',
    gap: 8
  },
  yearTab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8
  },
  yearTabText: {
    fontSize: 13,
    fontWeight: '600'
  },
  card: {
    padding: 15,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  cardSubtitle: {
    fontSize: 12,
    marginBottom: 12
  },
  recordingBadge: {
    backgroundColor: '#E53935',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10
  },
  recordingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold'
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  questionInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14
  },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  btnEmoji: {
    fontSize: 18
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 4
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500'
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    gap: 6
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    flex: 1
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8
  },
  loadingText: {
    fontSize: 13
  },
  reportCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1
  },
  recognizedQuery: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 6
  },
  reportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8
  },
  reportHeadline: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1
  },
  reportTotalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'flex-end'
  },
  reportTotalText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  reportCountText: {
    color: '#E8F5E9',
    fontSize: 10,
    marginTop: 1
  },
  reportDetails: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 10
  },
  matchedList: {
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4
  },
  matchedTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6
  },
  matchedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  matchedLeft: {
    flex: 1,
    marginRight: 8
  },
  matchedCategory: {
    fontSize: 13,
    fontWeight: '500'
  },
  matchedMeta: {
    fontSize: 11,
    marginTop: 2
  },
  matchedAmount: {
    fontSize: 13,
    fontWeight: 'bold'
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 10
  },
  tipIcon: {
    marginRight: 8
  },
  tipText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 17
  },
  balanceGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 12
  },
  balanceItem: {
    flex: 1,
    padding: 12,
    borderRadius: 10
  },
  balanceLabel: {
    fontSize: 12,
    marginBottom: 4
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  netBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10
  },
  netBalanceLabel: {
    fontSize: 14,
    fontWeight: '600'
  },
  netBalanceValue: {
    fontSize: 16,
    fontWeight: 'bold'
  },
  totalCategoriesCount: {
    fontSize: 12
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8
  },
  emptyText: {
    fontSize: 13
  },
  categoryItem: {
    marginTop: 12
  },
  categoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  categoryNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  categoryIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 1
  },
  categoryOpsCount: {
    fontSize: 12,
    marginLeft: 4
  },
  categoryRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  categoryPercent: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right'
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    borderRadius: 3
  }
});
