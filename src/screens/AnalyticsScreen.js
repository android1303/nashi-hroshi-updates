import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
  onBack 
}) {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Фільтруємо операції поточного року
  const yearTransactions = transactions.filter(t => {
    if (globalUserFilter !== 'all' && t.author !== globalUserFilter) return false;
    if (t.rawDate) {
      const parts = t.rawDate.split('-');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) === currentYear;
      }
    }
    return true;
  });

  let yearIncome = 0;
  let yearExpense = 0;
  yearTransactions.forEach(t => {
    if (t.type === 'income') yearIncome += t.amount;
    else yearExpense += t.amount;
  });
  const yearBalance = yearIncome - yearExpense;

  const bg = cardBg || theme.card;
  const border = borderColor || theme.border;

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 }}>
      {/* Верхня панель з кнопкою «Назад» */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {onBack ? (
          <TouchableOpacity 
            onPress={onBack} 
            style={[styles.backBtn, { backgroundColor: bg, borderColor: border, borderWidth: 1 }]}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color={theme.text} />
          </TouchableOpacity>
        ) : <View style={{ width: 38 }} />}
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18 }]}>
          Аналітика за {currentYear} рік
        </Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={[styles.card, { backgroundColor: bg, borderColor: border, padding: 16, marginBottom: 14 }]}>
        <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11, marginBottom: 4 }]}>Річний баланс</Text>
        <Text style={[styles.fontJakartaBold, { color: yearBalance >= 0 ? theme.income : theme.expense, fontSize: 26, marginBottom: 14 }]}>
          {hideBalance ? '••••••' : `${yearBalance.toLocaleString('uk-UA')} ₴`}
        </Text>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: border, paddingTop: 12 }}>
          <View>
            <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10, marginBottom: 2 }]}>Доходи за рік</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.income, fontSize: 14 }]}>
              {hideBalance ? '••••' : `+${yearIncome.toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 10, marginBottom: 2 }]}>Витрати за рік</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.expense, fontSize: 14 }]}>
              {hideBalance ? '••••' : `-${yearExpense.toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: bg, borderColor: border, padding: 24, alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="bar-chart-outline" size={36} color={theme.primary} style={{ marginBottom: 10 }} />
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14, textAlign: 'center', marginBottom: 6 }]}>
          Розподіл витрат за категоріями
        </Text>
        <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 12, textAlign: 'center', lineHeight: 18 }]}>
          Тут відображається деталізована статистика та графіки розподілу витрат і доходів за поточний рік.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaBold: { fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1 },
  backBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
