import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Platform,
  KeyboardAvoidingView,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { analyzeTransactionsWithAI } from '../services/ai';

let Audio = null;
try {
  Audio = require('expo-av').Audio;
} catch (e) {}

let ImagePicker = null;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {}

let FileSystem = null;
try {
  FileSystem = require('expo-file-system');
} catch (e) {}

export default function AIAssistantModal({
  visible,
  onClose,
  initialTab = 'voice', // 'voice' | 'photo' | 'text'
  theme,
  isLight,
  cardBg,
  borderColor,
  categories = [],
  incomeGroups = [],
  defaultAuthor = 'Андрій',
  geminiApiKey = '',
  onSaveApiKey,
  onSaveTransactions
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [receiptSplitMode, setReceiptSplitMode] = useState('total'); // 'total' | 'items'

  // Стан запису голосу
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingRef = useRef(null);
  const timerRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Стан фото
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState(null);
  const [selectedImageMime, setSelectedImageMime] = useState('image/jpeg');

  // Стан текстового вводу
  const [textInput, setTextInput] = useState('');

  // Стан ШІ-обробки та результатів
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [transcript, setTranscript] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [expandedCatItemIdx, setExpandedCatItemIdx] = useState(null);

  // Стан вводу API-ключа, якщо він ще не заданий
  const [tempApiKey, setTempApiKey] = useState(geminiApiKey || '');
  const [showKeyInput, setShowKeyInput] = useState(false);

  const effectiveApiKey = (geminiApiKey || process.env.EXPO_PUBLIC_GEMINI_API_KEY || '').trim();

  useEffect(() => {
    if (visible) {
      setActiveTab(initialTab || 'voice');
      setErrorMsg('');
      setTempApiKey(geminiApiKey || '');
      setShowKeyInput(!effectiveApiKey);
    } else {
      stopAndCleanupRecording();
    }
    return () => {
      stopAndCleanupRecording();
    };
  }, [visible, initialTab, geminiApiKey]);

  // Пульсація мікрофона під час запису
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.22,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

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

  const startVoiceRecording = async () => {
    setErrorMsg('');
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }
    if (!Audio) {
      setErrorMsg('Модуль запису звуку (expo-av) недоступний на цьому пристрої.');
      return;
    }

    // Завжди очищаємо попередній запис перед створенням нового
    await stopAndCleanupRecording();

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== 'granted') {
        setErrorMsg('Надайте дозвіл на використання мікрофона в налаштуваннях телефону.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });

      // Коротка пауза для звільнення нативного MediaRecorder на Android
      await new Promise(r => setTimeout(r, 120));

      const preset = Audio.RecordingOptionsPresets?.LOW_QUALITY || Audio.RecordingOptionsPresets?.HIGH_QUALITY;
      const { recording } = await Audio.Recording.createAsync(preset);

      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      await stopAndCleanupRecording();
      setErrorMsg('Не вдалося почати запис голосу: ' + (err.message || ''));
    }
  };

  const finishVoiceRecordingAndAnalyze = async () => {
    const rec = recordingRef.current;
    if (!rec) return;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    recordingRef.current = null;

    let uri = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch (err) {
      setErrorMsg('Не вдалося зупинити запис: ' + (err.message || ''));
    } finally {
      await resetAudioMode();
    }

    if (!uri) return;

    setIsAnalyzing(true);
    setErrorMsg('');

    try {
      if (!FileSystem) {
        throw new Error('Модуль читання файлів недоступний.');
      }
      const base64Audio = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType?.Base64 || 'base64'
      });

      // Очищаємо тимчасовий файл у кеші, щоб наступні записи стартували миттєво
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (e) {}

      if (!base64Audio || base64Audio.length < 50) {
        throw new Error('Запис порожній або занадто короткий. Скажіть витрату чіткіше.');
      }

      const lowerUri = uri.toLowerCase();
      const detectedMime = lowerUri.endsWith('.3gp') || lowerUri.endsWith('.3gpp')
        ? 'audio/3gpp'
        : (lowerUri.endsWith('.aac') ? 'audio/aac' : 'audio/mp4');

      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'voice',
        audioBase64: base64Audio,
        audioMimeType: detectedMime,
        categories,
        incomeGroups,
        defaultAuthor
      });

      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('ШІ не знайшов суми витрат у записі. Спробуйте сказати чіткіше, наприклад: «Продукти АТБ 450 гривень».');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка розпізнавання голосу.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePickImage = async (useCamera = false) => {
    setErrorMsg('');
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }
    if (!ImagePicker) {
      setErrorMsg('Модуль камери/галереї (expo-image-picker) недоступний.');
      return;
    }

    try {
      if (useCamera) {
        const camPerm = await ImagePicker.requestCameraPermissionsAsync();
        if (camPerm.status !== 'granted') {
          setErrorMsg('Надайте дозвіл на використання камери.');
          return;
        }
      } else {
        const libPerm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (libPerm.status !== 'granted') {
          setErrorMsg('Надайте дозвіл на доступ до галереї фото.');
          return;
        }
      }

      // quality: 0.25 зменшує розмір фото з 12-50МП камери до ~120-250 КБ,
      // щоб React Native OkHttp не зависав під час відправки Base64 у Gemini
      const pickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions?.Images || 'Images',
        allowsEditing: false,
        quality: 0.25,
        base64: true
      };

      const res = useCamera
        ? await ImagePicker.launchCameraAsync(pickerOptions)
        : await ImagePicker.launchImageLibraryAsync(pickerOptions);

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const asset = res.assets[0];
      let base64Data = asset.base64;
      if (!base64Data && asset.uri && FileSystem) {
        base64Data = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType?.Base64 || 'base64'
        });
      }

      if (!base64Data) {
        setErrorMsg('Не вдалося отримати дані зображення.');
        return;
      }

      let mimeType = 'image/jpeg';
      if (asset.mimeType && asset.mimeType.includes('/')) {
        mimeType = asset.mimeType.toLowerCase();
      } else if (asset.uri) {
        const u = asset.uri.toLowerCase();
        if (u.endsWith('.png')) mimeType = 'image/png';
        else if (u.endsWith('.webp')) mimeType = 'image/webp';
        else mimeType = 'image/jpeg';
      }
      if (mimeType === 'image/jpg') mimeType = 'image/jpeg';

      setSelectedImageUri(asset.uri);
      setSelectedImageBase64(base64Data);
      setSelectedImageMime(mimeType);

      // Одразу запускаємо аналіз фото через Gemini
      await runPhotoAnalysis(base64Data, mimeType, receiptSplitMode);
    } catch (err) {
      setErrorMsg('Помилка завантаження фото: ' + (err.message || ''));
      setIsAnalyzing(false);
    }
  };

  const runPhotoAnalysis = async (base64Data, mimeType, splitMode) => {
    if (!base64Data) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'photo',
        receiptSplitMode: splitMode,
        imageBase64: base64Data,
        imageMimeType: mimeType || 'image/jpeg',
        categories,
        incomeGroups,
        defaultAuthor
      });
      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('Не вдалося знайти суми на фото. Спробуйте зробити чіткіший знімок чека.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка аналізу фото.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeText = async () => {
    if (!textInput.trim()) {
      setErrorMsg('Введіть текст витрати, наприклад: «АТБ 650, кава 90, заправка 1500»');
      return;
    }
    if (!effectiveApiKey) {
      setShowKeyInput(true);
      setErrorMsg('Спочатку вкажіть безкоштовний ключ Gemini API вище.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg('');
    try {
      const result = await analyzeTransactionsWithAI({
        apiKey: effectiveApiKey,
        mode: 'text',
        textInput,
        categories,
        incomeGroups,
        defaultAuthor
      });
      setTranscript(result.transcript || '');
      setParsedItems(result.transactions || []);
      if (!result.transactions || result.transactions.length === 0) {
        setErrorMsg('Не вдалося виділити суми з тексту. Вкажіть суму цифрами.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Помилка аналізу тексту.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpdateParsedItem = (index, updates) => {
    setParsedItems(prev => prev.map((item, idx) => (idx === index ? { ...item, ...updates } : item)));
  };

  const handleRemoveParsedItem = (index) => {
    setParsedItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleConfirmAll = () => {
    const valid = parsedItems.filter(i => Number(i.amount) > 0);
    if (valid.length === 0) return;
    onSaveTransactions && onSaveTransactions(valid);
    setParsedItems([]);
    setTranscript('');
    setSelectedImageUri(null);
    setSelectedImageBase64(null);
    setTextInput('');
    onClose && onClose();
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const totalParsedSum = parsedItems.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: cardBg,
              borderColor,
              borderTopWidth: 1,
              maxHeight: '90%'
            }
          ]}
        >
          {/* Індикатор шторки + Заголовок */}
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: theme.subText, opacity: 0.3 }} />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary + '22', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="sparkles" size={18} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.fontBold, { color: theme.text, fontSize: 16 }]}>ШІ-Асистент витрат</Text>
                <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11 }]}>
                  Голосовий ввід, сканер чеків та смарт-розбір
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShowKeyInput(!showKeyInput)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: effectiveApiKey ? theme.income + '18' : theme.expense + '22'
                }}
              >
                <Ionicons
                  name="key-outline"
                  size={15}
                  color={effectiveApiKey ? theme.income : theme.expense}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.inputBg, justifyContent: 'center', alignItems: 'center' }}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            {/* Блок налаштування ключа Gemini API (якщо ще не введений або відкритий користувачем) */}
            {showKeyInput && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 12,
                    marginBottom: 14
                  }
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>
                    🔑 Ключ Google Gemini API (спільний для сім’ї)
                  </Text>
                  <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                    <Text style={[styles.fontBold, { color: theme.primary, fontSize: 11 }]}>Отримати безкоштовно ↗</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Вставте ключ один раз — він збережеться у хмарі Firebase і працюватиме на обох телефонах.
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    placeholder="AIzaSy..."
                    placeholderTextColor={theme.subText}
                    value={tempApiKey}
                    onChangeText={setTempApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.fontSemi,
                      {
                        flex: 1,
                        backgroundColor: cardBg,
                        color: theme.text,
                        borderColor,
                        borderWidth: 1,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        fontSize: 12
                      }
                    ]}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      onSaveApiKey && onSaveApiKey(tempApiKey.trim());
                      setShowKeyInput(false);
                      setErrorMsg('');
                    }}
                    style={{
                      backgroundColor: theme.primary,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Перемикач режимів: Голос / Фото чека / Текст */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[
                { key: 'voice', label: 'Голосом', icon: 'mic' },
                { key: 'photo', label: 'По фото', icon: 'camera' },
                { key: 'text', label: 'Текстом', icon: 'chatbubble-ellipses' }
              ].map(tab => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      setActiveTab(tab.key);
                      setErrorMsg('');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        paddingVertical: 11,
                        backgroundColor: isActive ? theme.primary : theme.inputBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Ionicons name={tab.icon} size={16} color={isActive ? theme.primaryText : theme.text} />
                    <Text style={[styles.fontBold, { color: isActive ? theme.primaryText : theme.text, fontSize: 12 }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* РЕЖИМ 1: ГОЛОСОВЕ ДОДАВАННЯ */}
            {activeTab === 'voice' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 12, textAlign: 'center', marginBottom: 16 }]}>
                  {isRecording
                    ? 'Говоріть... Наприклад: «Заправив авто на 1200 грн і купив каву за 85 грн»'
                    : 'Натисніть на мікрофон і скажіть одну або кілька витрат чи доходів'}
                </Text>

                <View style={{ justifyContent: 'center', alignItems: 'center', marginVertical: 8 }}>
                  <Animated.View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      width: 96,
                      height: 96,
                      borderRadius: 48,
                      backgroundColor: isRecording ? theme.expense + '28' : theme.primary + '18',
                      transform: [{ scale: pulseAnim }]
                    }}
                  />
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={isRecording ? finishVoiceRecordingAndAnalyze : startVoiceRecording}
                    disabled={isAnalyzing}
                    style={{
                      width: 78,
                      height: 78,
                      borderRadius: 39,
                      backgroundColor: isRecording ? theme.expense : theme.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                      elevation: 6
                    }}
                  >
                    {isAnalyzing ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons
                        name={isRecording ? 'stop' : 'mic'}
                        size={34}
                        color={isRecording ? '#FFF' : theme.primaryText}
                      />
                    )}
                  </TouchableOpacity>
                </View>

                {isRecording ? (
                  <View style={{ alignItems: 'center', marginTop: 10 }}>
                    <Text style={[styles.fontBold, { color: theme.expense, fontSize: 16 }]}>
                      ● {formatTimer(recordingSeconds)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
                      <TouchableOpacity
                        onPress={stopAndCleanupRecording}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 12,
                          backgroundColor: cardBg,
                          borderColor,
                          borderWidth: 1
                        }}
                      >
                        <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 12 }]}>Скасувати</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={finishVoiceRecordingAndAnalyze}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 12,
                          backgroundColor: theme.primary
                        }}
                      >
                        <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>
                          Розпізнати ✨
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <Text style={[styles.fontBold, { color: theme.primary, fontSize: 12, marginTop: 10 }]}>
                    Торкніться, щоб почати запис
                  </Text>
                )}
              </View>
            )}

            {/* РЕЖИМ 2: ДОДАВАННЯ ПО ФОТО ЧЕКА АБО СКРІНШОТУ */}
            {activeTab === 'photo' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 16,
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Як розпізнавати чек:
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setReceiptSplitMode('total');
                      if (selectedImageBase64) runPhotoAnalysis(selectedImageBase64, selectedImageMime, 'total');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: receiptSplitMode === 'total' ? theme.primary : cardBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.fontBold,
                        { color: receiptSplitMode === 'total' ? theme.primaryText : theme.text, fontSize: 11 }
                      ]}
                    >
                      🧾 Загальною сумою
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setReceiptSplitMode('items');
                      if (selectedImageBase64) runPhotoAnalysis(selectedImageBase64, selectedImageMime, 'items');
                    }}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        paddingVertical: 8,
                        alignItems: 'center',
                        backgroundColor: receiptSplitMode === 'items' ? theme.primary : cardBg,
                        borderColor,
                        borderWidth: 1
                      }
                    ]}
                  >
                    <Text
                      style={[
                        styles.fontBold,
                        { color: receiptSplitMode === 'items' ? theme.primaryText : theme.text, fontSize: 11 }
                      ]}
                    >
                      🛒 По позиціях/категоріях
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePickImage(true)}
                    disabled={isAnalyzing}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        backgroundColor: theme.primary,
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }
                    ]}
                  >
                    <Ionicons name="camera" size={26} color={theme.primaryText} />
                    <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 12 }]}>
                      Камера (Чек)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handlePickImage(false)}
                    disabled={isAnalyzing}
                    style={[
                      styles.card,
                      {
                        flex: 1,
                        backgroundColor: cardBg,
                        borderColor,
                        borderWidth: 1,
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }
                    ]}
                  >
                    <Ionicons name="images" size={26} color={theme.primary} />
                    <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>
                      Галерея / Скріншот
                    </Text>
                  </TouchableOpacity>
                </View>

                {selectedImageUri && (
                  <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Image
                      source={{ uri: selectedImageUri }}
                      style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: cardBg }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fontBold, { color: theme.text, fontSize: 12 }]}>Фото завантажено</Text>
                      <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 11 }]}>
                        Ви можете перефотографувати або змінити режим розбору вище
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => runPhotoAnalysis(selectedImageBase64, selectedImageMime, receiptSplitMode)}
                      style={{
                        backgroundColor: theme.primary + '22',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 10
                      }}
                    >
                      <Ionicons name="refresh" size={18} color={theme.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* РЕЖИМ 3: ТЕКСТОВИЙ СМАРТ-ВВІД */}
            {activeTab === 'text' && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 14,
                    marginBottom: 16
                  }
                ]}
              >
                <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
                  Напишіть або надиктуйте клавіатурою кілька витрат у довільній формі:
                </Text>
                <TextInput
                  placeholder="Напр.: АТБ продукти 640, кава 85, таксі Uklon 190"
                  placeholderTextColor={theme.subText}
                  value={textInput}
                  onChangeText={setTextInput}
                  multiline
                  style={[
                    styles.fontSemi,
                    {
                      backgroundColor: cardBg,
                      color: theme.text,
                      borderColor,
                      borderWidth: 1,
                      borderRadius: 14,
                      padding: 12,
                      minHeight: 72,
                      fontSize: 13,
                      textAlignVertical: 'top',
                      marginBottom: 10
                    }
                  ]}
                />
                <TouchableOpacity
                  onPress={handleAnalyzeText}
                  disabled={isAnalyzing}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.primary,
                      paddingVertical: 12,
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: 8
                    }
                  ]}
                >
                  <Ionicons name="sparkles" size={16} color={theme.primaryText} />
                  <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 13 }]}>
                    Розібрати через ШІ
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Індикатор завантаження під час аналізу Gemini */}
            {isAnalyzing && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor,
                    borderWidth: 1,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 16
                  }
                ]}
              >
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.fontBold, { color: theme.text, fontSize: 13, marginTop: 10 }]}>
                  ШІ аналізує та підбирає категорії...
                </Text>
              </View>
            )}

            {/* Повідомлення про помилку */}
            {!!errorMsg && (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.expense + '18',
                    borderColor: theme.expense + '44',
                    borderWidth: 1,
                    padding: 12,
                    marginBottom: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8
                  }
                ]}
              >
                <Ionicons name="alert-circle" size={18} color={theme.expense} />
                <Text style={[styles.fontSemi, { color: theme.expense, fontSize: 12, flex: 1 }]}>
                  {errorMsg}
                </Text>
              </View>
            )}

            {/* Розпізнаний текст / транскрипція */}
            {!!transcript && !isAnalyzing && (
              <View
                style={{
                  backgroundColor: theme.primary + '12',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Ionicons name="chatbubble-outline" size={15} color={theme.primary} />
                <Text style={[styles.fontSemi, { color: theme.text, fontSize: 11, flex: 1 }]}>
                  «{transcript}»
                </Text>
              </View>
            )}

            {/* СПИСОК РОЗПІЗНАНИХ ОПЕРАЦІЙ ДЛЯ ПЕРЕВІРКИ ТА ЗБЕРЕЖЕННЯ */}
            {parsedItems.length > 0 && !isAnalyzing && (
              <View style={{ marginTop: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.fontBold, { color: theme.text, fontSize: 14 }]}>
                    Розпізнані операції ({parsedItems.length}):
                  </Text>
                  <Text style={[styles.fontBold, { color: theme.primary, fontSize: 13 }]}>
                    Разом: {totalParsedSum.toLocaleString('uk-UA')} ₴
                  </Text>
                </View>

                {parsedItems.map((item, idx) => {
                  const isIncome = item.type === 'income';
                  const groupList = isIncome
                    ? incomeGroups.filter(g => !g.isHidden)
                    : categories.filter(c => !c.isHidden);
                  const parentGroup =
                    groupList.find(g => g.id === item.mainCategoryId || (g.items && g.items.includes(item.category))) ||
                    groupList[0];
                  const itemColor = parentGroup?.color || (isIncome ? theme.income : theme.primary);
                  const itemIcon = parentGroup?.icon || (isIncome ? 'wallet-outline' : 'pricetag-outline');
                  const isCatExpanded = expandedCatItemIdx === idx;

                  return (
                    <View
                      key={item.id || idx}
                      style={[
                        styles.card,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor,
                          borderWidth: 1,
                          padding: 12,
                          marginBottom: 10
                        }
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        {/* Іконка + Вибір підкатегорії */}
                        <TouchableOpacity
                          onPress={() => setExpandedCatItemIdx(isCatExpanded ? null : idx)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}
                        >
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 10,
                              backgroundColor: itemColor + '22',
                              justifyContent: 'center',
                              alignItems: 'center'
                            }}
                          >
                            <Ionicons name={itemIcon} size={18} color={itemColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={[styles.fontBold, { color: theme.text, fontSize: 13 }]} numberOfLines={1}>
                                {item.category}
                              </Text>
                              <Ionicons name={isCatExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.subText} />
                            </View>
                            <Text style={[styles.fontRegular, { color: theme.subText, fontSize: 10 }]}>
                              {parentGroup?.name || 'Категорія'} • Торкніться для зміни
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Поле суми */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TextInput
                            value={String(item.amount)}
                            keyboardType="numeric"
                            onChangeText={val => {
                              const num = parseFloat(val.replace(',', '.')) || 0;
                              handleUpdateParsedItem(idx, { amount: num });
                            }}
                            style={[
                              styles.fontBold,
                              {
                                backgroundColor: cardBg,
                                color: isIncome ? theme.income : theme.text,
                                borderColor,
                                borderWidth: 1,
                                borderRadius: 10,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                                minWidth: 74,
                                textAlign: 'right',
                                fontSize: 14
                              }
                            ]}
                          />
                          <Text style={[styles.fontBold, { color: theme.subText, fontSize: 13 }]}>₴</Text>
                        </View>

                        {/* Видалити позицію */}
                        <TouchableOpacity
                          onPress={() => handleRemoveParsedItem(idx)}
                          style={{ padding: 6 }}
                        >
                          <Ionicons name="trash-outline" size={18} color={theme.expense} />
                        </TouchableOpacity>
                      </View>

                      {/* Розгорнутий вибір категорії, якщо користувач хоче підправити */}
                      {isCatExpanded && (
                        <View
                          style={{
                            marginTop: 10,
                            paddingTop: 10,
                            borderTopWidth: 1,
                            borderTopColor: borderColor
                          }}
                        >
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            <TouchableOpacity
                              onPress={() => {
                                const firstExp = categories.filter(c => !c.isHidden)[0];
                                handleUpdateParsedItem(idx, {
                                  type: 'expense',
                                  mainCategoryId: firstExp?.id || 'food',
                                  category: firstExp?.items?.[0] || 'Продукти'
                                });
                              }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: !isIncome ? theme.expense : cardBg
                              }}
                            >
                              <Text style={[styles.fontBold, { color: !isIncome ? '#FFF' : theme.text, fontSize: 11 }]}>
                                Витрата
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                const firstInc = incomeGroups.filter(g => !g.isHidden)[0];
                                handleUpdateParsedItem(idx, {
                                  type: 'income',
                                  mainCategoryId: firstInc?.id || 'job',
                                  category: firstInc?.items?.[0] || 'Зарплата'
                                });
                              }}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 5,
                                borderRadius: 8,
                                backgroundColor: isIncome ? theme.income : cardBg
                              }}
                            >
                              <Text style={[styles.fontBold, { color: isIncome ? '#FFF' : theme.text, fontSize: 11 }]}>
                                Дохід
                              </Text>
                            </TouchableOpacity>
                          </View>

                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                            {groupList.map(grp =>
                              (grp.items || []).map(sub => {
                                const selected = item.category === sub;
                                return (
                                  <TouchableOpacity
                                    key={`${grp.id}_${sub}`}
                                    onPress={() => {
                                      handleUpdateParsedItem(idx, {
                                        mainCategoryId: grp.id,
                                        category: sub
                                      });
                                      setExpandedCatItemIdx(null);
                                    }}
                                    style={{
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      borderRadius: 10,
                                      backgroundColor: selected ? theme.primary : cardBg,
                                      borderColor,
                                      borderWidth: 1
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.fontSemi,
                                        { color: selected ? theme.primaryText : theme.text, fontSize: 11 }
                                      ]}
                                    >
                                      {sub}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })
                            )}
                          </View>
                        </View>
                      )}

                      {/* Нижній рядок: Коментар + Автор */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <TextInput
                          placeholder="Коментар (магазин, деталі)..."
                          placeholderTextColor={theme.subText}
                          value={item.note || ''}
                          onChangeText={val => handleUpdateParsedItem(idx, { note: val })}
                          style={[
                            styles.fontRegular,
                            {
                              flex: 1,
                              backgroundColor: cardBg,
                              color: theme.text,
                              borderColor,
                              borderWidth: 1,
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              fontSize: 11
                            }
                          ]}
                        />
                        <TouchableOpacity
                          onPress={() =>
                            handleUpdateParsedItem(idx, {
                              author: item.author === 'Андрій' ? 'Людмила' : 'Андрій'
                            })
                          }
                          style={{
                            backgroundColor: cardBg,
                            borderColor,
                            borderWidth: 1,
                            borderRadius: 10,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4
                          }}
                        >
                          <Ionicons name="person-outline" size={12} color={theme.primary} />
                          <Text style={[styles.fontBold, { color: theme.primary, fontSize: 11 }]}>
                            {item.author}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleConfirmAll}
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.primary,
                      paddingVertical: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                      marginTop: 6
                    }
                  ]}
                >
                  <Ionicons name="checkmark-circle" size={20} color={theme.primaryText} />
                  <Text style={[styles.fontBold, { color: theme.primaryText, fontSize: 14 }]}>
                    Додати у бюджет ({parsedItems.length}) • {totalParsedSum.toLocaleString('uk-UA')} ₴
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fontRegular: { fontWeight: '400' },
  fontSemi: { fontWeight: '600' },
  fontBold: { fontWeight: '700' },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20
  },
  card: {
    borderRadius: 16
  }
});
