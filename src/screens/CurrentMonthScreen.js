import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput,
  ActivityIndicator,
  ScrollView,
  Animated, 
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { analyzeTransactionsWithAI } from '../services/ai';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Плашки жорстко займають ~38-40% висоти екрану при початковому завантаженні
const HEADER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.38);

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
  onOpenAI,
  geminiApiKey = '',
  defaultAuthor = 'Андрій',
  onSaveAITransactions
}) {
  const now = new Date();

  // Вбудований стан ШІ на головному екрані (Голос / Фото / Скріншот / Текст)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingRef = useRef(null);
  const timerRef = useRef(null);

  const [showInlineText, setShowInlineText] = useState(false);
  const [inlineText, setInlineText] = useState('');
  const [receiptSplitMode, setReceiptSplitMode] = useState('total'); // 'total' | 'items'
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiTranscript, setAiTranscript] = useState('');
  const [parsedItems, setParsedItems] = useState([]);

  const effectiveApiKey = (geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

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
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
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

  const handleInlineVoiceToggle = async () => {
    setAiError('');
    if (!Audio) {
      setAiError('Модуль запису звуку (expo-av) недоступний.');
      return;
    }

    if (isRecording) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      const rec = recordingRef.current;
      recordingRef.current = null;
      let uri = null;
      try {
        if (rec) {
          uri = rec.getURI();
          await rec.stopAndUnloadAsync();
          if (!uri) {
            uri = rec.getURI();
          }
        }
      } catch (e) {
        setAiError('Помилка зупинки запису: ' + (e?.message || ''));
      } finally {
        await resetAudioMode();
      }

      if (!uri) {
        setAiError('Не вдалося отримати аудіозапис. Спробуйте ще раз.');
        return;
      }
      if (!effectiveApiKey) {
        setAiError('Спочатку вкажіть ключ Gemini API у Налаштуваннях (⚙️).');
        return;
      }

      setAiLoading(true);
      try {
        const base64Audio = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64'
        });
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch (e) {}

        const lowerUri = uri.toLowerCase();
        const detectedMime = lowerUri.endsWith('.aac') ? 'audio/aac' : 'audio/m4a';

        const result = await analyzeTransactionsWithAI({
          apiKey: effectiveApiKey,
          mode: 'voice',
          audioBase64: base64Audio,
          audioMimeType: detectedMime,
          categories,
          incomeGroups,
          defaultAuthor
        });

        setAiTranscript(result.transcript || '');
        setParsedItems(result.transactions || []);
        if (!result.transactions || result.transactions.length === 0) {
          setAiError('Не знайдено суми у записі. Скажіть чіткіше, напр.: «АТБ 450 гривень».');
        }
      } catch (err) {
        setAiError(err?.message || 'Помилка розпізнавання голосу.');
      } finally {
        setAiLoading(false);
      }
    } else {
      await stopAndCleanupRecording();
      try {
        const perm = await Audio.requestPermissionsAsync();
        if (perm.status !== 'granted') {
          setAiError('Надайте дозвіл на використання мікрофона.');
          return;
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false
        });
        await new Promise(r => setTimeout(r, 120));

        // Пресет AAC/M4A 16 кГц, сумісний з Google Gemini API (вага ~20 КБ за 5 сек)
        const geminiPreset = {
          isMeteringEnabled: true,
          android: {
            extension: '.m4a',
            outputFormat: Audio.AndroidOutputFormat?.MPEG_4 ?? 2,
            audioEncoder: Audio.AndroidAudioEncoder?.AAC ?? 3,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000
          },
          ios: {
            extension: '.m4a',
            outputFormat: Audio.IOSOutputFormat?.MPEG4AAC ?? 'aac ',
            audioQuality: Audio.IOSAudioQuality?.MEDIUM ?? 64,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 32000
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 32000
          }
        };

        const { recording } = await Audio.Recording.createAsync(geminiPreset);

        recordingRef.current = recording;
        setIsRecording(true);
        setRecordingSeconds(0);
        timerRef.current = setInterval(() => {
          setRecordingSeconds(prev => prev + 1);
        }, 1000);
      } catch (err) {
        await stopAndCleanupRecording();
        setAiError('Не вдалося почати запис: ' + (err?.message || ''));
      }
    }
  };

  const handleInlinePickImage = async (useCamera = false) => {
    setAiError('');
    if (!ImagePicker) {
      setAiError('Модуль камери/галереї недоступний.');
      return;
    }

    try {
      if (useCamera) {
        let camPerm = await ImagePicker.getCameraPermissionsAsync();
        if (camPerm.status !== 'granted') {
          camPerm = await ImagePicker.requestCameraPermissionsAsync();
        }
        if (camPerm.status !== 'granted') {
          setAiError('Надайте дозвіл на використання камери.');
          return;
        }
      }

      // Запуск камери/галереї без блокуючого base64: true
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions?.Images || 'Images',
        allowsEditing: false,
        quality: 0.8
      };

      let res = null;
      if (useCamera) {
        res = await ImagePicker.launchCameraAsync(pickerOptions);
      } else {
        try {
          res = await ImagePicker.launchImageLibraryAsync(pickerOptions);
        } catch (galleryErr) {
          const libPerm = await ImagePicker.getMediaLibraryPermissionsAsync();
          if (libPerm.status !== 'granted') {
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          }
          res = await ImagePicker.launchImageLibraryAsync(pickerOptions);
        }
      }

      if (!res || res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      let base64Data = null;
      let mimeType = 'image/jpeg';

      // Нативно змінюємо роздільну здатність до макс. 1024px та стискаємо JPEG (0.65):
      // Важкі 50МП фото та PNG-скріншоти (6-8 МБ) зменшуються до ~70-90 КБ за 30 мс,
      // що усуває зависання UI (лаги) і забезпечує передачу за 0.1 сек замість 20+ сек.
      if (ImageManipulator && ImageManipulator.manipulateAsync && asset.uri) {
        try {
          const manip = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: 1024 } }],
            { compress: 0.65, format: ImageManipulator.SaveFormat?.JPEG || 'jpeg', base64: true }
          );
          if (manip && manip.base64) {
            base64Data = manip.base64;
            mimeType = 'image/jpeg';
          }
          if (manip && manip.uri) {
            try { await FileSystem.deleteAsync(manip.uri, { idempotent: true }); } catch (e) {}
          }
        } catch (manipErr) {
          // Fallback до прямого читання
        }
      }

      if (!base64Data && asset.uri && FileSystem) {
        base64Data = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64'
        });
        if (asset.mimeType && asset.mimeType.includes('/')) {
          mimeType = asset.mimeType.toLowerCase();
        } else if (asset.uri) {
          const u = asset.uri.toLowerCase();
          if (u.endsWith('.png')) mimeType = 'image/png';
          else if (u.endsWith('.webp')) mimeType = 'image/webp';
        }
      }

      // Видаляємо тимчасовий кеш фото після зчитування Base64
      if (asset.uri && FileSystem) {
        try { await FileSystem.deleteAsync(asset.uri, { idempotent: true }); } catch (e) {}
      }

      if (!base64Data) {
        setAiError('Не вдалося прочитати зображення.');
        return;
      }

      if (!effectiveApiKey) {
        setAiError('Спочатку вкажіть ключ Gemini API у Налаштуваннях (⚙️).');
        return;
      }

      let mimeType = 'image/jpeg';
      if (asset.mimeType && asset.mimeType.includes('/')) {
        mimeType = asset.mimeType.toLowerCase();
      } else if (asset.uri) {
        const u = asset.uri.toLowerCase();
        if (u.endsWith('.png')) mimeType = 'image/png';
        else if (u.endsWith('.webp')) mimeType = 'image/webp';
      }
      if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

      setAiLoading(true);
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'photo',
        receiptSplitMode,
        imageBase64: base64Data,
        imageMimeType: mimeType,
        categories,
        incomeGroups,
        defaultAuthor
      });

      setAiTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setAiError('Не вдалося знайти суми на зображенні. Спробуйте інше фото або скріншот.');
      }
    } catch (err) {
      setAiError(err?.message || 'Помилка обробки фото.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleInlineAnalyzeText = async () => {
    if (!inlineText.trim()) {
      setAiError('Введіть витрату, напр.: «АТБ 540, кава 85»');
      return;
    }
    if (!effectiveApiKey) {
      setAiError('Спочатку вкажіть ключ Gemini API у Налаштуваннях (⚙️).');
      return;
    }

    setAiLoading(true);
    setAiError('');
    try {
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'text',
        textInput: inlineText.trim(),
        categories,
        incomeGroups,
        defaultAuthor
      });
      setAiTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (result.transactions && result.transactions.length > 0) {
        setInlineText('');
        setShowInlineText(false);
      } else {
        setAiError('Не вдалося виділити суму з тексту.');
      }
    } catch (err) {
      setAiError(err?.message || 'Помилка аналізу тексту.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirmInlineItems = () => {
    const valid = parsedItems.filter(i => Number(i.amount) > 0);
    if (valid.length === 0) return;
    if (onSaveAITransactions) {
      onSaveAITransactions(valid);
    }
    setParsedItems([]);
    setAiTranscript('');
    setAiError('');
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

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
      
      {/* ІМЕРСИВНИЙ СПИСОК З КАРТКАМИ БАЛАНСУ, БЮДЖЕТУ ТА ШІ-ВІДЖЕТОМ */}
      <View style={{ flex: 1 }}>
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          style={{ flex: 1 }} 
          contentContainerStyle={{ 
            paddingTop: 8, 
            paddingHorizontal: 16, 
            paddingBottom: 110 
          }}
        >
          {/* 40% ЕКРАНУ: ВЕЛИКИЙ ДАШБОРД-ХАБ (АКТИВНІ ПОРТАЛИ В АНАЛІТИКУ ТА БЮДЖЕТ) */}
          <View 
            style={{ 
              height: HEADER_HEIGHT - 16, 
              marginBottom: 14
            }}
          >
            <View style={{ flexDirection: 'row', gap: 12, flex: 1 }}>
              
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
          </View>

          {/* ПРЯМИЙ ШІ-ВІДЖЕТ НА ГОЛОВНОМУ ЕКРАНІ: ГОЛОС / ФОТО / СКРІНШОТ / ТЕКСТ */}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={15} color={theme.primary} />
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>
                  ШІ-додавання витрат
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReceiptSplitMode(prev => (prev === 'total' ? 'items' : 'total'))}
                style={{
                  backgroundColor: theme.inputBg,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  borderColor,
                  borderWidth: 1
                }}
              >
                <Text style={[styles.fontJakartaSemi, { color: theme.primary, fontSize: 10 }]}>
                  {receiptSplitMode === 'total' ? '🧾 Чек: Разом' : '🛒 Чек: Позиції'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 4 ПРЯМІ АКТИВНІ КНОПКИ НА ГОЛОВНОМУ ЕКРАНІ (БЕЗ МОДАЛОК) */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleInlineVoiceToggle}
                disabled={aiLoading && !isRecording}
                style={{
                  flex: 1.15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  paddingVertical: 11,
                  borderRadius: 14,
                  backgroundColor: isRecording ? theme.expense : theme.primary
                }}
              >
                <Ionicons
                  name={isRecording ? 'stop' : 'mic'}
                  size={16}
                  color={isRecording ? '#FFF' : theme.primaryText}
                />
                <Text style={[styles.fontJakartaBold, { color: isRecording ? '#FFF' : theme.primaryText, fontSize: 11 }]}>
                  {isRecording ? `Стоп ${formatTimer(recordingSeconds)}` : 'Голос'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInlinePickImage(true)}
                disabled={aiLoading}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 11,
                  borderRadius: 14,
                  backgroundColor: theme.inputBg,
                  borderColor,
                  borderWidth: 1
                }}
              >
                <Ionicons name="camera-outline" size={16} color={theme.primary} />
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 11 }]}>
                  Фото
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => handleInlinePickImage(false)}
                disabled={aiLoading}
                style={{
                  flex: 1.15,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 11,
                  borderRadius: 14,
                  backgroundColor: theme.inputBg,
                  borderColor,
                  borderWidth: 1
                }}
              >
                <Ionicons name="images-outline" size={15} color={theme.primary} />
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 11 }]}>
                  Скріншот
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowInlineText(!showInlineText)}
                disabled={aiLoading}
                style={{
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  paddingVertical: 11,
                  borderRadius: 14,
                  backgroundColor: showInlineText ? theme.primary + '28' : theme.inputBg,
                  borderColor: showInlineText ? theme.primary : borderColor,
                  borderWidth: 1
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={15} color={theme.primary} />
                <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 11 }]}>
                  Текст
                </Text>
              </TouchableOpacity>
            </View>

            {/* Активний індикатор запису голосу прямо в картці */}
            {isRecording && (
              <View
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 14,
                  backgroundColor: theme.expense + '18',
                  borderColor: theme.expense + '44',
                  borderWidth: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.expense, fontSize: 12 }]}>
                    ● Запис голосу: {formatTimer(recordingSeconds)}
                  </Text>
                  <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10, marginTop: 2 }]}>
                    Скажіть витрату та натисніть «Розпізнати»
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={stopAndCleanupRecording}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: cardBg,
                      borderColor,
                      borderWidth: 1
                    }}
                  >
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleInlineVoiceToggle}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 10,
                      backgroundColor: theme.primary
                    }}
                  >
                    <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 11 }]}>
                      Розпізнати ✨
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Вбудоване текстове поле (як в Аналітиці) */}
            {showInlineText && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <TextInput
                  placeholder="Напр.: АТБ 640, кава 85, таксі 190"
                  placeholderTextColor={theme.subText}
                  value={inlineText}
                  onChangeText={setInlineText}
                  onSubmitEditing={handleInlineAnalyzeText}
                  style={[
                    styles.fontJakartaSemi,
                    {
                      flex: 1,
                      backgroundColor: theme.inputBg,
                      color: theme.text,
                      borderColor,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      fontSize: 12
                    }
                  ]}
                />
                <TouchableOpacity
                  onPress={handleInlineAnalyzeText}
                  disabled={aiLoading}
                  style={{
                    backgroundColor: theme.primary,
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>✨</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Індикатор обробки ШІ */}
            {aiLoading && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 6 }}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>
                  ШІ розпізнає та підбирає категорію...
                </Text>
              </View>
            )}

            {/* Повідомлення про помилку */}
            {!!aiError && (
              <View
                style={{
                  marginTop: 10,
                  padding: 10,
                  borderRadius: 12,
                  backgroundColor: theme.expense + '18',
                  borderColor: theme.expense + '44',
                  borderWidth: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Ionicons name="alert-circle-outline" size={16} color={theme.expense} />
                <Text style={[styles.fontJakartaSemi, { color: theme.expense, fontSize: 11, flex: 1 }]}>
                  {aiError}
                </Text>
              </View>
            )}

            {/* Розпізнані ШІ операції для миттєвого збереження */}
            {parsedItems.length > 0 && !aiLoading && (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: borderColor, paddingTop: 10 }}>
                {!!aiTranscript && (
                  <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                    Розпізнано: «{aiTranscript}»
                  </Text>
                )}
                {parsedItems.map((item, idx) => (
                  <View
                    key={item.id || idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: theme.inputBg,
                      borderRadius: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      marginBottom: 6,
                      borderColor,
                      borderWidth: 1
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 12 }]}>
                        {item.category}
                      </Text>
                      <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10 }]}>
                        {item.note ? `${item.note} • ` : ''}{item.author}
                      </Text>
                    </View>
                    <Text style={[styles.fontJakartaBold, { color: item.type === 'income' ? theme.income : theme.text, fontSize: 13, marginRight: 8 }]}>
                      {item.amount} ₴
                    </Text>
                    <TouchableOpacity
                      onPress={() => setParsedItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ padding: 4 }}
                    >
                      <Ionicons name="close-circle" size={18} color={theme.expense} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => { setParsedItems([]); setAiTranscript(''); }}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: theme.inputBg,
                      borderColor,
                      borderWidth: 1,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 12 }]}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmInlineItems}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 12,
                      backgroundColor: theme.primary,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Ionicons name="checkmark-circle" size={17} color={theme.primaryText} />
                    <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>
                      Додати у бюджет ({parsedItems.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
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
        </ScrollView>

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
