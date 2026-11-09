import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, 
  ScrollView, Platform, ActivityIndicator, Dimensions,
  Switch, useColorScheme, BackHandler, StatusBar, Animated, PanResponder, Easing, KeyboardAvoidingView, LayoutAnimation, Linking 
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';


let LocalAuthentication = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch (e) {}


import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, onSnapshot, addDoc, doc, deleteDoc, query, orderBy, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/services/firebase';
import { themes } from './src/theme/theme';
import { initialCategories, initialIncomeGroups, monthNames } from './src/constants';

import CurrentMonthScreen from './src/screens/CurrentMonthScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';
import AIAssistantModal from './src/components/AIAssistantModal';
import PendingTransactionsModal from './src/components/PendingTransactionsModal';
import FamilyInviteModal from './src/components/FamilyInviteModal';
import {
  getPendingWalletPayments,
  removePendingPayment,
  clearAllPendingPayments,
  addTestPayment,
  openNotificationSettings
} from './src/services/walletListener';


const SCREEN_HEIGHT = Dimensions.get('window').height;


export default function App() {
  const [fontsLoaded, setFontsLoaded] = useState(true);
  const systemColorScheme = useColorScheme();
  const [selectedThemeMode, setSelectedThemeMode] = useState('system');
  const activeThemeKey = selectedThemeMode === 'system' ? (systemColorScheme === 'light' ? 'light' : 'dark') : selectedThemeMode;
  const theme = themes[activeThemeKey];


  const isLight = activeThemeKey === 'light';
  const bgColor = isLight ? '#F4F6F9' : theme.bg;
  const cardBg = isLight ? '#FFFFFF' : theme.card;
  const borderColor = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  
  const expenseBtnColor = isLight ? '#FF8A65' : '#E57373';
  const incomeBtnColor = isLight ? '#4DB6AC' : '#81C784';


  const [globalUserFilter, setGlobalUserFilter] = useState('all');
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  
  const [showIcons, setShowIcons] = useState(true);
  const [hideBalanceDefault, setHideBalanceDefault] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [showBudgetWidget, setShowBudgetWidget] = useState(true); 
  
  const [uiSettingsCollapsed, setUiSettingsCollapsed] = useState(true);
  const [securitySettingsCollapsed, setSecuritySettingsCollapsed] = useState(true);
  const [categoriesSettingsCollapsed, setCategoriesSettingsCollapsed] = useState(true);
  const [aiSettingsCollapsed, setAiSettingsCollapsed] = useState(false);
  const [catSettingsTab, setCatSettingsTab] = useState('expense');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiInitialTab, setAiInitialTab] = useState('voice');

  // Стан непідтверджених оплат Google Wallet та Банків
  const [pendingWalletList, setPendingWalletList] = useState([]);
  const [showPendingWalletModal, setShowPendingWalletModal] = useState(false);
  const [walletSettingsCollapsed, setWalletSettingsCollapsed] = useState(false);

  // Стан сім'ї та профілю поточного пристрою
  const [familyMembers, setFamilyMembers] = useState(['Андрій', 'Людмила']);
  const [currentDeviceUser, setCurrentDeviceUser] = useState('Андрій');
  const [showFamilyModal, setShowFamilyModal] = useState(false);


  const [categories, setCategories] = useState(initialCategories);
  const [incomeGroups, setIncomeGroups] = useState(initialIncomeGroups);
  const [newSubCatInputs, setNewSubCatInputs] = useState({});
  const [budgetMode, setBudgetMode] = useState('shared');
  const [plannedIncome, setPlannedIncome] = useState(0);
  const [categoryLimits, setCategoryLimits] = useState({});
  const [personalCategoryLimits, setPersonalCategoryLimits] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [currentScreen, setCurrentScreen] = useState('main'); 
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;


  const [showTransModal, setShowTransModal] = useState(false);
  const transSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const transBackdropOpacity = useRef(new Animated.Value(0)).current;


  const [showSettModal, setShowSettModal] = useState(false);
  const settSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const settBackdropOpacity = useRef(new Animated.Value(0)).current;


  const openTransModal = () => {
    setShowTransModal(true);
    Animated.parallel([
      Animated.timing(transSheetY, { toValue: 0, duration: 400, easing: Easing.out(Easing.exp), useNativeDriver: false }),
      Animated.timing(transBackdropOpacity, { toValue: 1, duration: 300, useNativeDriver: false })
    ]).start();
  };


  const closeTransModal = () => {
    Animated.parallel([
      Animated.timing(transSheetY, { toValue: SCREEN_HEIGHT, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(transBackdropOpacity, { toValue: 0, duration: 250, useNativeDriver: false })
    ]).start(() => setShowTransModal(false));
  };


  const openSettModal = () => {
    setShowSettModal(true);
    Animated.parallel([
      Animated.timing(settSheetY, { toValue: 0, duration: 400, easing: Easing.out(Easing.exp), useNativeDriver: false }),
      Animated.timing(settBackdropOpacity, { toValue: 1, duration: 300, useNativeDriver: false })
    ]).start();
  };


  const closeSettModal = () => {
    Animated.parallel([
      Animated.timing(settSheetY, { toValue: SCREEN_HEIGHT, duration: 350, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      Animated.timing(settBackdropOpacity, { toValue: 0, duration: 250, useNativeDriver: false })
    ]).start(() => setShowSettModal(false));
  };


  const panResponderTrans = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: Animated.event([null, { dy: transSheetY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 1.5) { closeTransModal(); } 
        else { Animated.timing(transSheetY, { toValue: 0, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: false }).start(); }
      }
    })
  ).current;


  const panResponderSett = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: Animated.event([null, { dy: settSheetY }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 1.5) { closeSettModal(); } 
        else { Animated.timing(settSheetY, { toValue: 0, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: false }).start(); }
      }
    })
  ).current;


  const navigateTo = (screen) => {
    if (currentScreen === screen) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 100, useNativeDriver: true }).start(() => {
      setCurrentScreen(screen);
      scaleAnim.setValue(0.97);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 300, easing: Easing.out(Easing.exp), useNativeDriver: true })
      ]).start();
    });
  };


  useEffect(() => {
    const onBackPress = () => {
      if (showFamilyModal) { setShowFamilyModal(false); return true; }
      if (showPendingWalletModal) { setShowPendingWalletModal(false); return true; }
      if (showAIModal) { setShowAIModal(false); return true; }
      if (showTransModal) { closeTransModal(); return true; }
      if (showSettModal) { closeSettModal(); return true; }
      if (currentScreen !== 'main') { navigateTo('main'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [showFamilyModal, showPendingWalletModal, showAIModal, showTransModal, showSettModal, currentScreen]);


  // Обробка натискань із віджета або сповіщень Google Wallet (nashihroshi://ai... або nashihroshi://pending)
  useEffect(() => {
    const handleWidgetUrl = (url) => {
      if (!url || typeof url !== 'string') return;
      if (url.includes('nashihroshi://ai')) {
        let mode = 'voice';
        if (url.includes('mode=photo')) mode = 'photo';
        else if (url.includes('mode=text')) mode = 'text';
        setAiInitialTab(mode);
        setShowAIModal(true);
      } else if (url.includes('nashihroshi://add')) {
        handleOpenAddModal();
      } else if (url.includes('nashihroshi://pending') || url.includes('nashihroshi://wallet')) {
        refreshPendingWalletPayments();
        setShowPendingWalletModal(true);
      }
    };

    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) setTimeout(() => handleWidgetUrl(initialUrl), 400);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', (event) => {
      if (event && event.url) handleWidgetUrl(event.url);
    });
    return () => {
      if (sub && sub.remove) sub.remove();
    };
  }, []);


  useEffect(() => { setHideBalance(hideBalanceDefault); }, [hideBalanceDefault]);


  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);


  const [editingId, setEditingId] = useState(null);
  const [transType, setTransType] = useState('expense');
  const [amountInput, setAmountInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCatItem, setSelectedCatItem] = useState(null);
  const [selectedIncomeGroup, setSelectedIncomeGroup] = useState(null);
  const [author, setAuthor] = useState('Андрій');
  const [note, setNote] = useState('');
  const [transDateOption, setTransDateOption] = useState('today');
  const [customDate, setCustomDate] = useState('');

  // Завантажуємо збереженого користувача для цього пристрою
  useEffect(() => {
    AsyncStorage.getItem('@nashi_hroshi_current_user').then(saved => {
      if (saved) {
        setCurrentDeviceUser(saved);
        setAuthor(saved);
      }
    }).catch(() => {});
  }, []);

  const handleSelectDeviceUser = async (user) => {
    setCurrentDeviceUser(user);
    setAuthor(user);
    try {
      await AsyncStorage.setItem('@nashi_hroshi_current_user', user);
    } catch (e) {}
  };

  const handleAddFamilyMember = async (name) => {
    const updated = Array.from(new Set([...familyMembers, name]));
    setFamilyMembers(updated);
    await updateSettings({ familyMembers: updated });
  };

  const handleRemoveFamilyMember = async (name) => {
    const updated = familyMembers.filter(m => m !== name);
    setFamilyMembers(updated);
    await updateSettings({ familyMembers: updated });
  };

  // Читання непідтверджених оплат Google Wallet
  const refreshPendingWalletPayments = async () => {
    try {
      const list = await getPendingWalletPayments();
      setPendingWalletList(list);
    } catch (e) {}
  };

  useEffect(() => {
    refreshPendingWalletPayments();
    const interval = setInterval(refreshPendingWalletPayments, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleConfirmWalletPayment = async (item, chosenCategory) => {
    const today = new Date().toISOString().split('T')[0];
    const newTrans = {
      type: 'expense',
      amount: Number(item.amount) || 0,
      mainCategoryId: 'food',
      category: chosenCategory || item.suggestedCategory || 'Продукти',
      note: item.merchant || 'Google Wallet',
      author: currentDeviceUser,
      rawDate: today,
      date: today,
      createdAt: Date.now()
    };
    try {
      await addDoc(collection(db, "transactions"), newTrans);
      const updated = await removePendingPayment(item.id);
      setPendingWalletList(updated);
      if (updated.length === 0) {
        setShowPendingWalletModal(false);
      }
    } catch (e) {}
  };

  const handleRejectWalletPayment = async (itemId) => {
    try {
      const updated = await removePendingPayment(itemId);
      setPendingWalletList(updated);
      if (updated.length === 0) {
        setShowPendingWalletModal(false);
      }
    } catch (e) {}
  };

  const handleConfirmAllWalletPayments = async (categoryMap = {}) => {
    const today = new Date().toISOString().split('T')[0];
    for (const item of pendingWalletList) {
      const chosenCat = categoryMap[item.id] || item.suggestedCategory || 'Продукти';
      const newTrans = {
        type: 'expense',
        amount: Number(item.amount) || 0,
        mainCategoryId: 'food',
        category: chosenCat,
        note: item.merchant || 'Google Wallet',
        author: currentDeviceUser,
        rawDate: today,
        date: today,
        createdAt: Date.now()
      };
      try {
        await addDoc(collection(db, "transactions"), newTrans);
      } catch (e) {}
    }
    await clearAllPendingPayments();
    setPendingWalletList([]);
    setShowPendingWalletModal(false);
  };

  const handleAddTestWalletPayment = async () => {
    const updated = await addTestPayment({
      amount: 185.50,
      merchant: 'Сільпо',
      category: 'Продукти'
    });
    setPendingWalletList(updated);
  };

  const availableUsers = useMemo(() => {
    const set = new Set(familyMembers);
    transactions.forEach(t => { if (t.author) set.add(t.author); });
    return Array.from(set);
  }, [familyMembers, transactions]);


  const handleCycleUserFilter = () => {
    const list = ['all', ...availableUsers];
    setGlobalUserFilter(list[(list.indexOf(globalUserFilter) + 1) % list.length]);
  };


  const handleAuthenticate = async () => {
    if (!LocalAuthentication) { setIsLocked(false); return; }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Авторизація у додатку' });
        if (res.success) setIsLocked(false);
      } else { setIsLocked(false); }
    } catch (e) { setIsLocked(false); }
  };


  useEffect(() => {
    if (biometricsEnabled && LocalAuthentication) { setIsLocked(true); handleAuthenticate(); } 
    else { setIsLocked(false); }
  }, [biometricsEnabled]);


  const parseAmountExpression = (input) => {
    if (!input) return { total: 0, isValid: false, isExpression: false, expressionStr: '' };
    const parts = input.split('+').map(p => p.trim()).filter(p => p !== '');
    const nums = parts.map(p => parseFloat(p)).filter(n => !isNaN(n));
    if (nums.length === 0) return { total: 0, isValid: false, isExpression: false, expressionStr: '' };
    return { total: nums.reduce((a, c) => a + c, 0), isValid: true, isExpression: parts.length > 1, expressionStr: parts.join(' + ') };
  };
  const evaluatedAmount = parseAmountExpression(amountInput);


  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 2500);
    const unsubCat = onSnapshot(doc(db, "settings", "categories"), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let mergedCats = [...(data.categories || [])];
        initialCategories.forEach(initCat => { if (!mergedCats.some(c => c.name === initCat.name)) mergedCats.push(initCat); });
        
        let cleanCats = Array.from(new Map(mergedCats.map(item => [item.name, item])).values())
          .map(c => ({ ...c, items: Array.from(new Set(c.items)) }))
          .filter(c => c.name !== 'Домашні тварини'); 
        
        setCategories(cleanCats);


        let mergedInc = [...(data.incomeGroups || [])];
        initialIncomeGroups.forEach(initInc => { if (!mergedInc.some(i => i.name === initInc.name)) mergedInc.push(initInc); });
        setIncomeGroups(Array.from(new Map(mergedInc.map(item => [item.name, item])).values()));


        if (data.categoryLimits) setCategoryLimits(data.categoryLimits);
        if (data.personalCategoryLimits) setPersonalCategoryLimits(data.personalCategoryLimits);
        if (data.plannedIncome !== undefined) setPlannedIncome(data.plannedIncome);
        if (data.budgetMode) setBudgetMode(data.budgetMode);
        if (data.hideBalanceDefault !== undefined) setHideBalanceDefault(data.hideBalanceDefault);
        if (data.biometricsEnabled !== undefined) setBiometricsEnabled(data.biometricsEnabled);
        if (data.showBudgetWidget !== undefined) setShowBudgetWidget(data.showBudgetWidget);
        if (data.geminiApiKey !== undefined) setGeminiApiKey(data.geminiApiKey);
        if (Array.isArray(data.familyMembers) && data.familyMembers.length > 0) setFamilyMembers(data.familyMembers);
      } else {
        setCategories(initialCategories); setIncomeGroups(initialIncomeGroups);
      }
    }, () => {
      setCategories(initialCategories);
      setIncomeGroups(initialIncomeGroups);
    });
    return () => { clearTimeout(timer); unsubCat(); };
  }, []);


  useEffect(() => {
    const q = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, []);


  const updateSettings = async (updates) => {
    if (updates.plannedIncome !== undefined) setPlannedIncome(updates.plannedIncome);
    if (updates.showBudgetWidget !== undefined) setShowBudgetWidget(updates.showBudgetWidget);
    if (updates.hideBalanceDefault !== undefined) setHideBalanceDefault(updates.hideBalanceDefault);
    if (updates.biometricsEnabled !== undefined) setBiometricsEnabled(updates.biometricsEnabled);
    if (updates.budgetMode !== undefined) setBudgetMode(updates.budgetMode);
    if (updates.categoryLimits) setCategoryLimits(updates.categoryLimits);
    if (updates.personalCategoryLimits) setPersonalCategoryLimits(updates.personalCategoryLimits);
    if (updates.categories) setCategories(updates.categories);
    if (updates.incomeGroups) setIncomeGroups(updates.incomeGroups);
    if (updates.geminiApiKey !== undefined) setGeminiApiKey(updates.geminiApiKey);
    if (updates.familyMembers) setFamilyMembers(updates.familyMembers);
    try {
      await setDoc(doc(db, "settings", "categories"), updates, { merge: true });
    } catch (e) {}
  };


  const toggleCategoryVisibility = (catId, type) => {
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, isHidden: !c.isHidden } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, isHidden: !g.isHidden } : g);
      updateSettings({ incomeGroups: updated });
    }
  };


  const handleUpdateLimit = (subItem, limitVal) => {
    const num = parseFloat(limitVal) || 0;
    if (budgetMode === 'shared') {
      const updated = { ...categoryLimits, [subItem]: num };
      updateSettings({ categoryLimits: updated });
    } else {
      const activeUser = globalUserFilter !== 'all' ? globalUserFilter : 'Андрій';
      const updatedPersonal = { ...personalCategoryLimits, [activeUser]: { ...(personalCategoryLimits[activeUser] || {}), [subItem]: num } };
      updateSettings({ personalCategoryLimits: updatedPersonal });
    }
  };


  const handleUpdatePlannedIncome = (val) => {
    const num = parseFloat(val) || 0;
    updateSettings({ plannedIncome: num });
  };


  const handleCopyLastMonthExpenses = async () => {
    const now = new Date();
    const lastMonthIdx = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const lastMonthExpenses = transactions.filter(t => t.type === 'expense' && (budgetMode === 'shared' || t.author === globalUserFilter) && t.rawDate && parseInt(t.rawDate.split('-')[0], 10) === lastMonthYear && parseInt(t.rawDate.split('-')[1], 10) - 1 === lastMonthIdx);
    
    const newLimits = {};
    lastMonthExpenses.forEach(t => { newLimits[t.category] = (newLimits[t.category] || 0) + t.amount; });


    if (budgetMode === 'shared') {
      const updated = { ...categoryLimits, ...newLimits };
      updateSettings({ categoryLimits: updated });
    } else {
      const activeUser = globalUserFilter !== 'all' ? globalUserFilter : 'Андрій';
      const updatedPersonal = { ...personalCategoryLimits, [activeUser]: { ...(personalCategoryLimits[activeUser] || {}), ...newLimits } };
      updateSettings({ personalCategoryLimits: updatedPersonal });
    }
  };


  const handleAddSubCategory = (catId, type) => {
    const subName = (newSubCatInputs[catId] || '').trim();
    if (!subName) return;
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, items: [...c.items, subName] } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, items: [...g.items, subName] } : g);
      updateSettings({ incomeGroups: updated });
    }
    setNewSubCatInputs(prev => ({ ...prev, [catId]: '' }));
  };


  const handleDeleteSubCategory = (catId, subName, type) => {
    if (type === 'expense') {
      const updated = categories.map(c => c.id === catId ? { ...c, items: c.items.filter(i => i !== subName) } : c);
      updateSettings({ categories: updated });
    } else {
      const updated = incomeGroups.map(g => g.id === catId ? { ...g, items: g.items.filter(i => i !== subName) } : g);
      updateSettings({ incomeGroups: updated });
    }
  };


  const handleOpenAddModal = () => {
    setEditingId(null); setTransType('expense'); setAmountInput('');
    setSelectedCategory(null); setSelectedCatItem(null); setSelectedIncomeGroup(null);
    setAuthor(globalUserFilter !== 'all' ? globalUserFilter : 'Андрій');
    setNote(''); setTransDateOption('today'); setCustomDate(''); 
    openTransModal();
  };


  const handleOpenEditModal = (item) => {
    setEditingId(item.id); setTransType(item.type); setAmountInput(item.amount.toString());
    if (item.type === 'expense') {
      let foundCatId = item.mainCategoryId || categories.find(c => c.items.includes(item.category))?.id;
      if (foundCatId) setSelectedCategory(foundCatId);
    } else {
      let foundIncGrpId = item.mainCategoryId || incomeGroups.find(g => g.items.includes(item.category))?.id;
      if (foundIncGrpId) setSelectedIncomeGroup(foundIncGrpId);
    }
    setSelectedCatItem(item.category); setAuthor(item.author); setNote(item.note || '');
    setTransDateOption('custom'); setCustomDate(item.rawDate || ''); openTransModal();
  };


  const handleSave = async () => {
    if (!evaluatedAmount.isValid || !selectedCatItem) return;
    const numAmount = evaluatedAmount.total;
    let autoNote = note;
    if (evaluatedAmount.isExpression && !note.trim()) autoNote = `(${evaluatedAmount.expressionStr})`;
    
    let targetDate = new Date();
    if (transDateOption === 'yesterday') targetDate.setDate(targetDate.getDate() - 1);
    else if (transDateOption === 'custom' && customDate.trim() !== '') {
      const parsed = new Date(customDate);
      if (!isNaN(parsed.getTime())) targetDate = parsed;
    }
    const formattedDate = targetDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
    const rawDateStr = targetDate.toISOString().split('T')[0];
    const currentMainCatId = transType === 'expense' ? selectedCategory : selectedIncomeGroup;


    const data = { type: transType, amount: numAmount, category: selectedCatItem, mainCategoryId: currentMainCatId, author, note: autoNote, date: formattedDate, rawDate: rawDateStr };
    try {
      if (editingId) {
        setTransactions(prev => prev.map(t => t.id === editingId ? { ...t, ...data } : t));
        await updateDoc(doc(db, "transactions", editingId), data);
      } else {
        const tempId = 'local_' + Date.now();
        setTransactions(prev => [{ id: tempId, ...data, createdAt: Date.now() }, ...prev]);
        await addDoc(collection(db, "transactions"), { ...data, createdAt: Date.now() });
      }
    } catch (e) {}
    closeTransModal();
  };


  const handleOpenAIModal = (tab = 'voice') => {
    setAiInitialTab(tab);
    setShowAIModal(true);
  };


  const handleSaveAITransactions = async (itemsList = []) => {
    if (!Array.isArray(itemsList) || itemsList.length === 0) return;
    const baseNow = Date.now();
    for (let i = 0; i < itemsList.length; i++) {
      const item = itemsList[i];
      const numAmount = Number(item.amount) || 0;
      if (numAmount <= 0) continue;

      const targetDate = new Date();
      if (item.dateOffsetDays) {
        targetDate.setDate(targetDate.getDate() + Number(item.dateOffsetDays));
      }
      const formattedDate = targetDate.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
      const rawDateStr = targetDate.toISOString().split('T')[0];

      const data = {
        type: item.type === 'income' ? 'income' : 'expense',
        amount: numAmount,
        category: item.category || 'Продукти',
        mainCategoryId: item.mainCategoryId || 'food',
        author: item.author || (globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'),
        note: item.note || '',
        date: formattedDate,
        rawDate: rawDateStr
      };

      const createdAt = baseNow + i;
      const tempId = 'local_ai_' + createdAt;
      setTransactions(prev => [{ id: tempId, ...data, createdAt }, ...prev]);
      try {
        await addDoc(collection(db, "transactions"), { ...data, createdAt });
      } catch (e) {}
    }
  };


  const executeDelete = async () => {
    if (!itemToDelete) return;
    const idToRemove = itemToDelete;
    setTransactions(prev => prev.filter(t => t.id !== idToRemove));
    setDeleteModalVisible(false); setItemToDelete(null);
    try { await deleteDoc(doc(db, "transactions", idToRemove)); } catch (e) {}
  };


  if (loading || categories.length === 0) return <View style={[styles.container, styles.centerContent, { backgroundColor: bgColor }]}><ActivityIndicator size="large" color={theme.primary} /></View>;
  if (isLocked) return (
    <SafeAreaView style={[styles.container, styles.centerContent, { backgroundColor: bgColor }]}>
      <Ionicons name="lock-closed-outline" size={48} color={theme.primary} style={{ marginBottom: 12 }} />
      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 16, marginBottom: 20 }]}>Додаток заблоковано</Text>
      <TouchableOpacity style={[styles.btn3D, { backgroundColor: cardBg, width: 150, borderColor, borderWidth: 1 }]} onPress={handleAuthenticate}><Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 13 }]}>Розблокувати</Text></TouchableOpacity>
    </SafeAreaView>
  );


  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: bgColor }]} edges={['top', 'left', 'right']}>
        <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} backgroundColor={bgColor} translucent={true} />


        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 16, paddingTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TouchableOpacity activeOpacity={0.7} onPress={handleCycleUserFilter} style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 }]}>
              <Ionicons name="person-circle-outline" size={16} color={theme.primary} />
              <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 13 }]}>{globalUserFilter === 'all' ? 'Усі' : globalUserFilter}</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} onPress={() => setShowFamilyModal(true)} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]} title="Сім'я та запрошення">
              <Ionicons name="people" size={17} color={theme.primary} />
            </TouchableOpacity>
          </View>


          <View style={{ flexDirection: 'row', gap: 8 }}>
            {pendingWalletList.length > 0 && (
              <TouchableOpacity activeOpacity={0.7} onPress={() => setShowPendingWalletModal(true)} style={[styles.btn3D, { backgroundColor: theme.primary, borderColor: theme.primary, borderWidth: 1, flexDirection: 'row', width: 'auto', paddingHorizontal: 10, gap: 4 }]}>
                <Text style={{ fontSize: 13 }}>⚡</Text>
                <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>{pendingWalletList.length}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity activeOpacity={0.7} onPress={() => handleOpenAIModal('voice')} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', width: 'auto', paddingHorizontal: 10, gap: 4 }]}>
              <Ionicons name="sparkles" size={15} color={theme.primary} />
              <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 11 }]}>ШІ</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setHideBalance(!hideBalance)} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name={hideBalance ? "eye-off" : "eye"} size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={openSettModal} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name="settings" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Банер непідтверджених оплат Google Wallet / Банків */}
        {pendingWalletList.length > 0 && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowPendingWalletModal(true)}
            style={{
              marginHorizontal: 16,
              marginBottom: 10,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 16,
              backgroundColor: theme.primary + '18',
              borderColor: theme.primary + '44',
              borderWidth: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
              <Text style={{ fontSize: 18 }}>⚡</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 12 }]}>
                  Оплати Google Wallet на підтвердження ({pendingWalletList.length})
                </Text>
                <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11 }]} numberOfLines={1}>
                  {pendingWalletList[0].merchant} • -{pendingWalletList[0].amount} ₴ • Натисніть для підтвердження
                </Text>
              </View>
            </View>
            <View style={{ backgroundColor: theme.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
              <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 11 }]}>
                Огляд
              </Text>
            </View>
          </TouchableOpacity>
        )}


        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          {currentScreen === 'main' && (
            <CurrentMonthScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} incomeGroups={incomeGroups} showIcons={showIcons} globalUserFilter={globalUserFilter} showBudgetWidget={showBudgetWidget} plannedIncome={plannedIncome} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} budgetMode={budgetMode} handleOpenEditModal={handleOpenEditModal} promptDelete={(id) => {setItemToDelete(id); setDeleteModalVisible(true);}} onNavigate={navigateTo} onOpenAI={handleOpenAIModal} />
          )}
          {currentScreen === 'analytics' && (
            <AnalyticsScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} incomeGroups={incomeGroups} showIcons={showIcons} globalUserFilter={globalUserFilter} geminiApiKey={geminiApiKey} onBack={() => navigateTo('main')} />
          )}
          {currentScreen === 'budget' && (
            <BudgetScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} showIcons={showIcons} globalUserFilter={globalUserFilter} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} plannedIncome={plannedIncome} budgetMode={budgetMode} handleUpdateLimit={handleUpdateLimit} handleUpdatePlannedIncome={handleUpdatePlannedIncome} handleCopyLastMonthExpenses={handleCopyLastMonthExpenses} onBack={() => navigateTo('main')} updateSettings={updateSettings} />
          )}
        </Animated.View>


        {/* Плаваючі кнопки швидкого доступу: Голос/Фото ШІ + Ручне додавання */}
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.fab3D,
            {
              bottom: 90,
              width: 48,
              height: 48,
              borderRadius: 24,
              right: 24,
              backgroundColor: cardBg,
              borderColor: theme.primary,
              borderWidth: 1.5
            }
          ]}
          onPress={() => handleOpenAIModal('voice')}
        >
          <Ionicons name="mic" size={22} color={theme.primary} />
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.9} style={[styles.fab3D, { backgroundColor: theme.primary }]} onPress={handleOpenAddModal}>
          <Ionicons name="add" size={28} color={theme.primaryText} />
        </TouchableOpacity>


        {showTransModal && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { zIndex: 10, justifyContent: 'flex-end' }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: transBackdropOpacity }]} />
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeTransModal} />
            
            <Animated.View style={[styles.glassModal, { backgroundColor: cardBg, height: '85%', transform: [{ translateY: transSheetY }] }]}>
              <View {...panResponderTrans.panHandlers} style={{ alignItems: 'center', paddingVertical: 12, marginTop: -5 }}>
                <View style={{ width: 40, height: 4, backgroundColor: theme.subText, opacity: 0.3, borderRadius: 2 }} />
              </View>
              
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
                {!editingId && (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[styles.premiumCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary + '18', borderColor: theme.primary + '44', borderWidth: 1, paddingVertical: 9 }]}
                      onPress={() => { closeTransModal(); setTimeout(() => handleOpenAIModal('voice'), 250); }}
                    >
                      <Ionicons name="mic" size={15} color={theme.primary} />
                      <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>Додати голосом</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.premiumCard, { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.primary + '18', borderColor: theme.primary + '44', borderWidth: 1, paddingVertical: 9 }]}
                      onPress={() => { closeTransModal(); setTimeout(() => handleOpenAIModal('photo'), 250); }}
                    >
                      <Ionicons name="camera" size={15} color={theme.primary} />
                      <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>Сканувати чек</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={{ flexDirection: 'row', width: '100%', gap: 10, marginBottom: 16 }}>
                  <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: transType === 'expense' ? expenseBtnColor : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTransType('expense'); setSelectedCategory(null); setSelectedCatItem(null); }}>
                    <Text style={[styles.fontJakartaBold, { color: transType === 'expense' ? (isLight ? '#FFF' : '#000') : theme.text, fontSize: 13 }]}>Витрата</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: transType === 'income' ? incomeBtnColor : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setTransType('income'); setSelectedIncomeGroup(null); setSelectedCatItem(null); }}>
                    <Text style={[styles.fontJakartaBold, { color: transType === 'income' ? (isLight ? '#FFF' : '#000') : theme.text, fontSize: 13 }]}>Дохід</Text>
                  </TouchableOpacity>
                </View>


                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TextInput placeholder="Сума (напр. 150)" placeholderTextColor={theme.subText} keyboardType="numeric" value={amountInput} onChangeText={setAmountInput} style={[styles.input3D, styles.fontJakartaBold, { flex: 1, color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, padding: 12, fontSize: 16 }]} />
                    <TouchableOpacity style={[styles.btn3D, { backgroundColor: theme.primary, width: 46, height: 46 }]} onPress={() => setAmountInput(prev => prev + '+')}><Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 22 }]}>+</Text></TouchableOpacity>
                  </View>
                  {evaluatedAmount.isExpression && <Text style={[styles.fontJakartaSemi, { color: theme.primary, fontSize: 12, marginTop: 4 }]}>Разом: = {evaluatedAmount.total.toLocaleString('uk-UA')} ₴</Text>}
                </View>


                {transType === 'expense' ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Головна категорія:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {categories.filter(c => !c.isHidden).map(cat => {
                        const isSelected = selectedCategory === cat.id;
                        if (selectedCategory && !isSelected) return null; 


                        return (
                          <View key={cat.id} style={{ width: isSelected ? '100%' : 'auto' }}>
                            <TouchableOpacity 
                              style={[styles.premiumCard, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isSelected ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]} 
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                if (isSelected) { setSelectedCategory(null); setSelectedCatItem(null); } 
                                else { setSelectedCategory(cat.id); setSelectedCatItem(cat.items[0]); }
                              }}
                            >
                              {showIcons && <Ionicons name={cat.icon} size={14} color={isSelected ? theme.primaryText : theme.text} />}
                              <Text style={[styles.fontJakartaSemi, { color: isSelected ? theme.primaryText : theme.text, fontSize: 12 }]}>{cat.name}</Text>
                              {isSelected && <Ionicons name="close-circle" size={16} color={theme.primaryText} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>


                            {isSelected && (
                              <View style={{ marginTop: 12, padding: 12, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)', borderRadius: 16, borderColor, borderWidth: 1 }}>
                                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 10 }]}>Оберіть підкатегорію:</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {cat.items.map(item => (
                                    <TouchableOpacity key={item} style={[styles.premiumCard, { backgroundColor: selectedCatItem === item ? theme.primary : theme.inputBg, borderColor, borderWidth: selectedCatItem === item ? 0 : 1, paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => setSelectedCatItem(item)}>
                                      <Text style={[styles.fontJakarta, { color: selectedCatItem === item ? theme.primaryText : theme.text, fontSize: 12 }]}>{item}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Джерело доходу:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {incomeGroups.filter(g => !g.isHidden).map(grp => {
                        const isSelected = selectedIncomeGroup === grp.id;
                        if (selectedIncomeGroup && !isSelected) return null; 


                        return (
                          <View key={grp.id} style={{ width: isSelected ? '100%' : 'auto' }}>
                            <TouchableOpacity 
                              style={[styles.premiumCard, { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isSelected ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 }]} 
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                if (isSelected) { setSelectedIncomeGroup(null); setSelectedCatItem(null); } 
                                else { setSelectedIncomeGroup(grp.id); setSelectedCatItem(grp.items[0]); }
                              }}
                            >
                              <Text style={[styles.fontJakartaSemi, { color: isSelected ? theme.primaryText : theme.text, fontSize: 12 }]}>{grp.name}</Text>
                              {isSelected && <Ionicons name="close-circle" size={16} color={theme.primaryText} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>


                            {isSelected && (
                              <View style={{ marginTop: 12, padding: 12, backgroundColor: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.05)', borderRadius: 16, borderColor, borderWidth: 1 }}>
                                <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 10 }]}>Уточніть джерело:</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                  {grp.items.map(item => (
                                    <TouchableOpacity key={item} style={[styles.premiumCard, { backgroundColor: selectedCatItem === item ? theme.primary : theme.inputBg, borderColor, borderWidth: selectedCatItem === item ? 0 : 1, paddingVertical: 8, paddingHorizontal: 12 }]} onPress={() => setSelectedCatItem(item)}>
                                      <Text style={[styles.fontJakarta, { color: selectedCatItem === item ? theme.primaryText : theme.text, fontSize: 12 }]}>{item}</Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}


                <TextInput placeholder="Коментар (необов'язково)" placeholderTextColor={theme.subText} value={note} onChangeText={setNote} style={[styles.input3D, styles.fontJakarta, { color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, padding: 12, fontSize: 13, marginBottom: 20 }]} />


                <View style={{ flexDirection: 'row', gap: 10, marginBottom: editingId ? 10 : 0 }}>
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.chipInactive, borderColor, borderWidth: 1, flex: 1, alignItems: 'center', paddingVertical: 12 }]} onPress={closeTransModal}><Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Скасувати</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.primary, borderColor, borderWidth: 1, flex: 1, alignItems: 'center', paddingVertical: 12 }]} onPress={handleSave}><Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 13 }]}>Зберегти</Text></TouchableOpacity>
                </View>


                {editingId && (
                  <TouchableOpacity style={[styles.premiumCard, { backgroundColor: expenseBtnColor, borderColor, borderWidth: 1, width: '100%', alignItems: 'center', paddingVertical: 12 }]} onPress={() => { setItemToDelete(editingId); setDeleteModalVisible(true); closeTransModal(); }}>
                    <Text style={[styles.fontJakartaBold, { color: isLight ? '#FFF' : '#000', fontSize: 13 }]}>🗑 Видалити цю операцію</Text>
                  </TouchableOpacity>
                )}


              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        )}


        {showSettModal && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, { zIndex: 10, justifyContent: 'flex-end' }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: settBackdropOpacity }]} />
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeSettModal} />
            
            <Animated.View style={[styles.glassModal, { backgroundColor: cardBg, height: '85%', transform: [{ translateY: settSheetY }] }]}>
              <View {...panResponderSett.panHandlers} style={{ alignItems: 'center', paddingVertical: 12, marginTop: -5 }}>
                <View style={{ width: 40, height: 4, backgroundColor: theme.subText, opacity: 0.3, borderRadius: 2 }} />
              </View>


              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18, marginBottom: 14 }]}>Налаштування</Text>


                <TouchableOpacity activeOpacity={0.7} onPress={() => setAiSettingsCollapsed(!aiSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={15} color={theme.primary} />
                    <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>ШІ-Асистент (Голос та Фото чеків)</Text>
                  </View>
                  <Ionicons name={aiSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!aiSettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>Ключ Google Gemini API:</Text>
                      <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                        <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 11 }]}>Отримати ключ ↗</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      placeholder="Вставте ключ AIzaSy..."
                      placeholderTextColor={theme.subText}
                      value={geminiApiKey}
                      onChangeText={(val) => updateSettings({ geminiApiKey: val.trim() })}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.input3D, styles.fontJakartaSemi, { color: theme.text, backgroundColor: theme.inputBg, borderColor, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, marginBottom: 6 }]}
                    />
                    <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10 }]}>
                      Ключ автоматично синхронізується через Firebase між обома телефонами сім’ї.
                    </Text>
                  </View>
                )}


                <TouchableOpacity activeOpacity={0.7} onPress={() => setUiSettingsCollapsed(!uiSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Інтерфейс</Text>
                  <Ionicons name={uiSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!uiSettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>Показувати Віджет Бюджету</Text>
                      <Switch value={showBudgetWidget} onValueChange={(val) => updateSettings({ showBudgetWidget: val })} trackColor={{ true: theme.primary }} />
                    </View>
                    <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>Тема оформлення:</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {[{ key: 'dark', label: 'Темна', icon: 'moon' }, { key: 'light', label: 'Світла', icon: 'sunny' }, { key: 'system', label: 'Авто', icon: 'options' }].map(item => (
                        <TouchableOpacity key={item.key} style={[styles.premiumCard, { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, backgroundColor: selectedThemeMode === item.key ? theme.primary : theme.inputBg, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setSelectedThemeMode(item.key)}>
                          <Ionicons name={item.icon} size={14} color={selectedThemeMode === item.key ? theme.primaryText : theme.text} />
                          <Text style={[styles.fontJakartaSemi, { color: selectedThemeMode === item.key ? theme.primaryText : theme.text, fontSize: 11 }]}>{item.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}


                <TouchableOpacity activeOpacity={0.7} onPress={() => setSecuritySettingsCollapsed(!securitySettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Безпека та Приватність</Text>
                  <Ionicons name={securitySettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!securitySettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>Face ID / Відбиток</Text>
                      <Switch value={biometricsEnabled} onValueChange={(val) => updateSettings({ biometricsEnabled: val })} trackColor={{ true: theme.primary }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12, marginBottom: 2 }]}>Приховувати баланс при вході</Text>
                      </View>
                      <Switch value={hideBalanceDefault} onValueChange={(val) => updateSettings({ hideBalanceDefault: val })} trackColor={{ true: theme.primary }} />
                    </View>
                  </View>
                )}


                {/* Секція: Оплати Google Wallet та Банків */}
                <TouchableOpacity activeOpacity={0.7} onPress={() => setWalletSettingsCollapsed(!walletSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15 }}>⚡</Text>
                    <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Оплати Google Wallet та Банків</Text>
                  </View>
                  <Ionicons name={walletSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!walletSettingsCollapsed && (
                  <View style={{ marginTop: 10, marginBottom: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4CAF50' }} />
                      <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>
                        Автоматичне зчитування оплат активне
                      </Text>
                    </View>
                    <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11, marginBottom: 12, lineHeight: 16 }]}>
                      Слухач перехоплює суми та магазини з пушів Google Wallet, Monobank, Приват24 тощо і додає в чергу на підтвердження для {currentDeviceUser}.
                    </Text>

                    <TouchableOpacity
                      onPress={openNotificationSettings}
                      style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="notifications-outline" size={16} color={theme.primary} />
                        <Text style={[styles.fontJakartaSemi, { color: theme.text, fontSize: 12 }]}>
                          Системний дозвіл сповіщень Android
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={theme.subText} />
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        onPress={handleAddTestWalletPayment}
                        style={[styles.premiumCard, { flex: 1, backgroundColor: theme.primary + '18', borderColor: theme.primary, borderWidth: 1, paddingVertical: 9, alignItems: 'center' }]}
                      >
                        <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 11 }]}>
                          + Тестовий платіж (185 ₴)
                        </Text>
                      </TouchableOpacity>

                      {pendingWalletList.length > 0 && (
                        <TouchableOpacity
                          onPress={() => { closeSettModal(); setShowPendingWalletModal(true); }}
                          style={[styles.premiumCard, { flex: 1, backgroundColor: theme.primary, paddingVertical: 9, alignItems: 'center' }]}
                        >
                          <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 11 }]}>
                            Огляд черги ({pendingWalletList.length})
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}


                {/* Секція: Сім'я та Користувачі */}
                <TouchableOpacity activeOpacity={0.7} onPress={() => { closeSettModal(); setShowFamilyModal(true); }} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15 }}>👨‍👩‍👧‍👦</Text>
                    <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Сім'я та Користувачі ({familyMembers.length})</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.fontJakartaSemi, { color: theme.primary, fontSize: 12 }]}>{currentDeviceUser}</Text>
                    <Ionicons name="chevron-forward" size={16} color={theme.subText} />
                  </View>
                </TouchableOpacity>


                <TouchableOpacity activeOpacity={0.7} onPress={() => setCategoriesSettingsCollapsed(!categoriesSettingsCollapsed)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: theme.border }}>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Управління категоріями</Text>
                  <Ionicons name={categoriesSettingsCollapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.subText} />
                </TouchableOpacity>
                {!categoriesSettingsCollapsed && (
                  <View style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                      <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: catSettingsTab === 'expense' ? theme.primary : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setCatSettingsTab('expense')}>
                        <Text style={[styles.fontJakartaBold, { color: catSettingsTab === 'expense' ? theme.primaryText : theme.text, fontSize: 13 }]}>Витрати</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.premiumCard, { flex: 1, alignItems: 'center', backgroundColor: catSettingsTab === 'income' ? theme.primary : theme.chipInactive, borderColor, borderWidth: 1, paddingVertical: 10 }]} onPress={() => setCatSettingsTab('income')}>
                        <Text style={[styles.fontJakartaBold, { color: catSettingsTab === 'income' ? theme.primaryText : theme.text, fontSize: 13 }]}>Доходи</Text>
                      </TouchableOpacity>
                    </View>


                    {(catSettingsTab === 'expense' ? categories : incomeGroups).map(grp => (
                      <View key={grp.id} style={[styles.premiumCard, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1, marginBottom: 14, padding: 14 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons name={grp.icon} size={20} color={grp.color} />
                            <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, textDecorationLine: grp.isHidden ? 'line-through' : 'none', opacity: grp.isHidden ? 0.5 : 1 }]}>{grp.name}</Text>
                          </View>
                          <TouchableOpacity onPress={() => toggleCategoryVisibility(grp.id, catSettingsTab)}>
                            <Ionicons name={grp.isHidden ? "eye-off" : "eye"} size={22} color={grp.isHidden ? theme.subText : theme.primary} />
                          </TouchableOpacity>
                        </View>
                        {!grp.isHidden && (
                          <View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {grp.items.map(item => (
                                <View key={item} style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10 }]}>
                                  <Text style={[styles.fontJakarta, { color: theme.text, fontSize: 12 }]}>{item}</Text>
                                  <TouchableOpacity onPress={() => handleDeleteSubCategory(grp.id, item, catSettingsTab)}>
                                    <Ionicons name="close-circle" size={16} color={theme.expense} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </View>
                            <View style={{ flexDirection: 'row', marginTop: 12, gap: 8 }}>
                              <TextInput 
                                placeholder="Нова підкатегорія..." 
                                placeholderTextColor={theme.subText}
                                value={newSubCatInputs[grp.id] || ''}
                                onChangeText={(val) => setNewSubCatInputs(prev => ({...prev, [grp.id]: val}))}
                                style={[styles.input3D, styles.fontJakartaSemi, { flex: 1, color: theme.text, backgroundColor: cardBg, borderColor, borderWidth: 1, paddingHorizontal: 12, height: 38, fontSize: 12 }]} 
                              />
                              <TouchableOpacity style={[styles.btn3D, { backgroundColor: theme.primary, width: 38, height: 38 }]} onPress={() => handleAddSubCategory(grp.id, catSettingsTab)}>
                                <Ionicons name="add" size={20} color={theme.primaryText} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                )}


                <TouchableOpacity style={[styles.premiumCard, { backgroundColor: theme.primary, borderColor, borderWidth: 1, alignItems: 'center', marginTop: 24, paddingVertical: 12 }]} onPress={closeSettModal}>
                  <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 13 }]}>Зберегти та Закрити</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        )}


        <AIAssistantModal
          visible={showAIModal}
          onClose={() => setShowAIModal(false)}
          initialTab={aiInitialTab}
          theme={theme}
          isLight={isLight}
          cardBg={cardBg}
          borderColor={borderColor}
          categories={categories}
          incomeGroups={incomeGroups}
          defaultAuthor={globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'}
          geminiApiKey={geminiApiKey}
          onSaveApiKey={(key) => updateSettings({ geminiApiKey: key })}
          onSaveTransactions={handleSaveAITransactions}
        />

        <PendingTransactionsModal
          visible={showPendingWalletModal}
          onClose={() => setShowPendingWalletModal(false)}
          theme={theme}
          isLight={isLight}
          cardBg={cardBg}
          borderColor={borderColor}
          pendingList={pendingWalletList}
          categories={categories}
          currentDeviceUser={currentDeviceUser}
          onConfirmPayment={handleConfirmWalletPayment}
          onRejectPayment={handleRejectWalletPayment}
          onConfirmAll={handleConfirmAllWalletPayments}
          onAddTestPayment={handleAddTestWalletPayment}
          onOpenSettings={openNotificationSettings}
        />

        <FamilyInviteModal
          visible={showFamilyModal}
          onClose={() => setShowFamilyModal(false)}
          theme={theme}
          isLight={isLight}
          cardBg={cardBg}
          borderColor={borderColor}
          familyMembers={familyMembers}
          currentDeviceUser={currentDeviceUser}
          onSelectDeviceUser={handleSelectDeviceUser}
          onAddFamilyMember={handleAddFamilyMember}
          onRemoveFamilyMember={handleRemoveFamilyMember}
        />


        <Modal visible={deleteModalVisible} animationType="fade" transparent={true} onRequestClose={() => setDeleteModalVisible(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <View style={[styles.glassModal, { backgroundColor: cardBg, width: '100%', alignItems: 'center', padding: 20, borderRadius: 24, position: 'relative' }]}>
              <Ionicons name="trash" size={24} color={expenseBtnColor} style={{ marginBottom: 10 }} />
              <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 15, marginBottom: 6 }]}>Видалити операцію?</Text>
              <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 12, textAlign: 'center', marginBottom: 20 }]}>Цю дію неможливо скасувати.</Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <TouchableOpacity style={[styles.premiumCard, { flex: 1, backgroundColor: theme.chipInactive, alignItems: 'center', paddingVertical: 10 }]} onPress={() => setDeleteModalVisible(false)}><Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 13 }]}>Скасувати</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.premiumCard, { flex: 1, backgroundColor: expenseBtnColor, alignItems: 'center', paddingVertical: 10 }]} onPress={executeDelete}><Text style={[styles.fontJakartaBold, { color: isLight ? '#FFF' : '#000', fontSize: 13 }]}>Видалити</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>


      </SafeAreaView>
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaSemi: { fontWeight: '600' },
  fontJakartaBold: { fontWeight: '700' },
  container: { flex: 1 },
  centerContent: { justifyContent: 'center', alignItems: 'center' },
  
  premiumCard: { 
    borderRadius: 16, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 
  },
  btn3D: { 
    borderRadius: 14, justifyContent: 'center', alignItems: 'center', width: 38, height: 38, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 
  },
  input3D: { 
    borderRadius: 14, 
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 
  },
  fab3D: { 
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, 
    justifyContent: 'center', alignItems: 'center', 
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 
  },
  glassModal: { 
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 20, 
    position: 'absolute', bottom: 0, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 20 
  },
});
