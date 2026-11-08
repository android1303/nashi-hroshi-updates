import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StyleSheet, Text, View, TouchableOpacity, TextInput, Modal, 
  ScrollView, Platform, ActivityIndicator, Dimensions,
  Switch, useColorScheme, BackHandler, StatusBar, Animated, PanResponder, Easing, KeyboardAvoidingView, LayoutAnimation 
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';


let LocalAuthentication = null;
try { LocalAuthentication = require('expo-local-authentication'); } catch (e) {}


import { collection, onSnapshot, addDoc, doc, deleteDoc, query, orderBy, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './src/services/firebase';
import { themes } from './src/theme/theme';
import { initialCategories, initialIncomeGroups, monthNames } from './src/constants';


import CurrentMonthScreen from './src/screens/CurrentMonthScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AnalyticsScreen from './src/screens/AnalyticsScreen';


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
  const [catSettingsTab, setCatSettingsTab] = useState('expense');


  const [categories, setCategories] = useState([]);
  const [incomeGroups, setIncomeGroups] = useState([]);
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
      if (showTransModal) { closeTransModal(); return true; }
      if (showSettModal) { closeSettModal(); return true; }
      if (currentScreen !== 'main') { navigateTo('main'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [showTransModal, showSettModal, currentScreen]);


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


  const availableUsers = useMemo(() => {
    const set = new Set(['Андрій', 'Людмила']);
    transactions.forEach(t => { if (t.author) set.add(t.author); });
    return Array.from(set);
  }, [transactions]);


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
      } else {
        setCategories(initialCategories); setIncomeGroups(initialIncomeGroups);
      }
    });
    return () => unsubCat();
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
    try {
      await setDoc(doc(db, "settings", "categories"), updates, { merge: true });
      if (updates.plannedIncome !== undefined) setPlannedIncome(updates.plannedIncome);
      if (updates.showBudgetWidget !== undefined) setShowBudgetWidget(updates.showBudgetWidget);
      if (updates.hideBalanceDefault !== undefined) setHideBalanceDefault(updates.hideBalanceDefault);
      if (updates.biometricsEnabled !== undefined) setBiometricsEnabled(updates.biometricsEnabled);
      if (updates.categoryLimits) setCategoryLimits(updates.categoryLimits);
      if (updates.personalCategoryLimits) setPersonalCategoryLimits(updates.personalCategoryLimits);
      if (updates.categories) setCategories(updates.categories);
      if (updates.incomeGroups) setIncomeGroups(updates.incomeGroups);
    } catch (e) {}
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
    if (editingId) { await updateDoc(doc(db, "transactions", editingId), data); } 
    else { await addDoc(collection(db, "transactions"), { ...data, createdAt: Date.now() }); }
    closeTransModal();
  };


  const executeDelete = async () => {
    if (!itemToDelete) return;
    try { await deleteDoc(doc(db, "transactions", itemToDelete)); } catch (e) {}
    setDeleteModalVisible(false); setItemToDelete(null);
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
          <TouchableOpacity activeOpacity={0.7} onPress={handleCycleUserFilter} style={[styles.premiumCard, { backgroundColor: cardBg, borderColor, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 }]}>
            <Ionicons name="person-circle-outline" size={16} color={theme.primary} />
            <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 13 }]}>{globalUserFilter === 'all' ? 'Усі' : globalUserFilter}</Text>
          </TouchableOpacity>


          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setHideBalance(!hideBalance)} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name={hideBalance ? "eye-off" : "eye"} size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.7} onPress={openSettModal} style={[styles.btn3D, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
              <Ionicons name="settings" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>


        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          {currentScreen === 'main' && (
            <CurrentMonthScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} incomeGroups={incomeGroups} showIcons={showIcons} globalUserFilter={globalUserFilter} showBudgetWidget={showBudgetWidget} plannedIncome={plannedIncome} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} budgetMode={budgetMode} handleOpenEditModal={handleOpenEditModal} promptDelete={(id) => {setItemToDelete(id); setDeleteModalVisible(true);}} onNavigate={navigateTo} />
          )}
          {currentScreen === 'analytics' && (
            <AnalyticsScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} showIcons={showIcons} globalUserFilter={globalUserFilter} onBack={() => navigateTo('main')} />
          )}
          {currentScreen === 'budget' && (
            <BudgetScreen theme={theme} isLight={isLight} bgColor={bgColor} cardBg={cardBg} borderColor={borderColor} hideBalance={hideBalance} transactions={transactions} categories={categories} showIcons={showIcons} globalUserFilter={globalUserFilter} categoryLimits={categoryLimits} personalCategoryLimits={personalCategoryLimits} plannedIncome={plannedIncome} budgetMode={budgetMode} handleUpdateLimit={handleUpdateLimit} handleUpdatePlannedIncome={handleUpdatePlannedIncome} handleCopyLastMonthExpenses={handleCopyLastMonthExpenses} onBack={() => navigateTo('main')} updateSettings={updateSettings} />
          )}
        </Animated.View>


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
  fontJakarta: { fontFamily: 'JakartaSans' },
  fontJakartaSemi: { fontFamily: 'JakartaSans-SemiBold' },
  fontJakartaBold: { fontFamily: 'JakartaSans-Bold' },
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
