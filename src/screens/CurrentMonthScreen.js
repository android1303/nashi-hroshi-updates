import React, { useRef, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Animated, 
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Circle } from 'react-native-svg';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Плашки жорстко займають ~38-40% висоти екрану при початковому завантаженні
const HEADER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.38);
const SCROLL_DISTANCE = HEADER_HEIGHT - 30;

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
  onNavigate 
}) {
  const now = new Date();
  const scrollY = useRef(new Animated.Value(0)).current;

  // Анімація двоступеневого скролу (нативні 60/120 fps без мерехтіння)
  const headerTranslateY = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [0, -SCROLL_DISTANCE],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE * 0.65, SCROLL_DISTANCE],
    outputRange: [1, 0.25, 0],
    extrapolate: 'clamp',
  });

  const headerScale = scrollY.interpolate({
    inputRange: [0, SCROLL_DISTANCE],
    outputRange: [1, 0.94],
    extrapolate: 'clamp',
  });

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
      
      {/* 40% ЕКРАНУ: ВЕЛИКИЙ ДАШБОРД-ХАБ (АКТИВНІ ПОРТАЛИ В АНАЛІТИКУ ТА БЮДЖЕТ) */}
      <Animated.View 
        style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          height: HEADER_HEIGHT, 
          paddingHorizontal: 16, 
          paddingTop: 8,
          zIndex: 10,
          transform: [{ translateY: headerTranslateY }, { scale: headerScale }], 
          opacity: headerOpacity 
        }}
        pointerEvents="box-none"
      >
        <View style={{ flexDirection: 'row', gap: 12, height: HEADER_HEIGHT - 16 }}>
          
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
      </Animated.View>

      {/* 60% ЕКРАНУ: ІМЕРСИВНИЙ СПИСОК ОПЕРАЦІЙ ЗІ ЗГОРТАННЯМ ПЛАШОК НА 100% */}
      <View style={{ flex: 1 }}>
        <Animated.ScrollView 
          showsVerticalScrollIndicator={false} 
          style={{ flex: 1 }} 
          contentContainerStyle={{ 
            paddingTop: HEADER_HEIGHT + 6, 
            paddingHorizontal: 16, 
            paddingBottom: 110 
          }}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }], 
            { useNativeDriver: true }
          )}
          scrollEventThrottle={16}
        >
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
        </Animated.ScrollView>

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
  fontJakarta: { fontFamily: 'JakartaSans' },
  fontJakartaSemi: { fontFamily: 'JakartaSans-SemiBold' },
  fontJakartaBold: { fontFamily: 'JakartaSans-Bold' },
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
