import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  TextInput 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function BudgetScreen({ 
  theme, 
  isLight, 
  bgColor, 
  cardBg, 
  borderColor, 
  hideBalance, 
  transactions = [], 
  categories = [], 
  showIcons = true, 
  globalUserFilter = 'all', 
  categoryLimits = {}, 
  personalCategoryLimits = {}, 
  plannedIncome = 0, 
  budgetMode = 'shared', 
  handleUpdateLimit, 
  handleUpdatePlannedIncome, 
  handleCopyLastMonthExpenses, 
  onBack, 
  updateSettings 
}) {
  const [editingCat, setEditingCat] = useState(null);
  const [limitInput, setLimitInput] = useState('');
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Фільтруємо витрати поточного місяця
  const monthExpenses = transactions.filter(t => {
    if (t.type !== 'expense') return false;
    if (globalUserFilter !== 'all' && t.author !== globalUserFilter) return false;
    if (t.rawDate) {
      const parts = t.rawDate.split('-');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) === currentYear && parseInt(parts[1], 10) - 1 === currentMonth;
      }
    }
    return true;
  });

  // Підрахунок витрат по категоріях
  const expenseByCat = {};
  monthExpenses.forEach(t => {
    expenseByCat[t.category] = (expenseByCat[t.category] || 0) + t.amount;
  });

  const activeLimits = budgetMode === 'shared' 
    ? categoryLimits 
    : (personalCategoryLimits[globalUserFilter !== 'all' ? globalUserFilter : 'Андрій'] || {});

  const totalSpent = Object.values(expenseByCat).reduce((a, b) => a + b, 0);
  const totalLimit = Object.values(activeLimits).reduce((a, b) => a + (Number(b) || 0), 0);

  const startEditLimit = (catName, currentLim) => {
    setEditingCat(catName);
    setLimitInput(currentLim ? currentLim.toString() : '');
  };

  const saveLimit = (catName) => {
    if (handleUpdateLimit) {
      handleUpdateLimit(catName, limitInput);
    }
    setEditingCat(null);
    setLimitInput('');
  };

  const savePlannedIncome = () => {
    if (handleUpdatePlannedIncome) {
      handleUpdatePlannedIncome(incomeInput);
    }
    setEditingIncome(false);
    setIncomeInput('');
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 100 }}>
      
      {/* Верхня панель з кнопкою «Назад» */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <TouchableOpacity 
          onPress={onBack} 
          style={[styles.backBtn, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 18 }]}>
          Планування Бюджету
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Перемикач режиму: Спільний / Особистий */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 12, marginBottom: 12 }]}>
        <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11, marginBottom: 8 }]}>
          Режим бюджету:
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity 
            onPress={() => updateSettings && updateSettings({ budgetMode: 'shared' })}
            style={[styles.modeChip, { flex: 1, backgroundColor: budgetMode === 'shared' ? theme.primary : theme.chipInactive }]}
          >
            <Text style={[styles.fontJakartaBold, { color: budgetMode === 'shared' ? theme.primaryText : theme.text, fontSize: 12 }]}>
              Спільний
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => updateSettings && updateSettings({ budgetMode: 'personal' })}
            style={[styles.modeChip, { flex: 1, backgroundColor: budgetMode === 'personal' ? theme.primary : theme.chipInactive }]}
          >
            <Text style={[styles.fontJakartaBold, { color: budgetMode === 'personal' ? theme.primaryText : theme.text, fontSize: 12 }]}>
              Особистий
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Зведена картка лімітів */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 16, marginBottom: 12 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>
            Загальний ліміт витрат
          </Text>
          <Text style={[styles.fontJakartaBold, { color: totalSpent > totalLimit && totalLimit > 0 ? theme.expense : theme.income, fontSize: 13 }]}>
            {totalSpent.toLocaleString('uk-UA')} / {totalLimit.toLocaleString('uk-UA')} ₴
          </Text>
        </View>
        <View style={{ height: 8, backgroundColor: theme.inputBg, borderRadius: 4, overflow: 'hidden', marginVertical: 6 }}>
          <View 
            style={{ 
              width: `${totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0}%`, 
              height: '100%', 
              backgroundColor: totalSpent > totalLimit && totalLimit > 0 ? theme.expense : theme.primary 
            }} 
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11 }]}>
            Залишок: {(Math.max(totalLimit - totalSpent, 0)).toLocaleString('uk-UA')} ₴
          </Text>
          <Text style={[styles.fontJakarta, { color: theme.subText, fontSize: 11 }]}>
            {totalLimit > 0 ? `${Math.round((totalSpent / totalLimit) * 100)}%` : '0%'}
          </Text>
        </View>
      </View>

      {/* Запланований дохід */}
      <View style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 14, marginBottom: 14 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>Запланований дохід на місяць</Text>
            <Text style={[styles.fontJakartaBold, { color: theme.income, fontSize: 16, marginTop: 2 }]}>
              {hideBalance ? '••••••' : `${(plannedIncome || 0).toLocaleString('uk-UA')} ₴`}
            </Text>
          </View>
          <TouchableOpacity 
            onPress={() => { setEditingIncome(!editingIncome); setIncomeInput(plannedIncome ? plannedIncome.toString() : ''); }}
            style={[styles.editBtn, { backgroundColor: theme.primary + '20' }]}
          >
            <Ionicons name={editingIncome ? "close" : "pencil"} size={14} color={theme.primary} />
          </TouchableOpacity>
        </View>
        {editingIncome && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput 
              placeholder="Сума доходу (₴)"
              placeholderTextColor={theme.subText}
              keyboardType="numeric"
              value={incomeInput}
              onChangeText={setIncomeInput}
              style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, borderColor, color: theme.text }]}
            />
            <TouchableOpacity onPress={savePlannedIncome} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
              <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>OK</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Кнопка копіювання з минулого місяця */}
      {handleCopyLastMonthExpenses && (
        <TouchableOpacity 
          onPress={handleCopyLastMonthExpenses} 
          activeOpacity={0.7}
          style={[styles.copyBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '40' }]}
        >
          <Ionicons name="copy-outline" size={16} color={theme.primary} />
          <Text style={[styles.fontJakartaBold, { color: theme.primary, fontSize: 12 }]}>
            Скопіювати витрати минулого місяця як ліміти
          </Text>
        </TouchableOpacity>
      )}

      {/* Ліміти по категоріях */}
      <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 15, marginBottom: 10, marginLeft: 2 }]}>
        Ліміти за категоріями
      </Text>

      {categories.map(cat => {
        const catSpent = expenseByCat[cat.name] || 0;
        const catLimit = activeLimits[cat.name] || 0;
        const percent = catLimit > 0 ? (catSpent / catLimit) * 100 : 0;
        const isEditing = editingCat === cat.name;

        return (
          <View key={cat.id || cat.name} style={[styles.card, { backgroundColor: cardBg, borderColor, borderWidth: 1, padding: 14, marginBottom: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {showIcons && (
                  <View style={[styles.iconBox, { backgroundColor: (cat.color || theme.primary) + '20' }]}>
                    <Ionicons name={cat.icon || 'pricetag-outline'} size={18} color={cat.color || theme.primary} />
                  </View>
                )}
                <View>
                  <Text style={[styles.fontJakartaBold, { color: theme.text, fontSize: 14 }]}>{cat.name}</Text>
                  <Text style={[styles.fontJakartaSemi, { color: theme.subText, fontSize: 11 }]}>
                    Витрачено: {hideBalance ? '••••' : `${catSpent.toLocaleString('uk-UA')} ₴`}
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => isEditing ? setEditingCat(null) : startEditLimit(cat.name, catLimit)}
                style={[styles.editLimitBtn, { backgroundColor: theme.inputBg }]}
              >
                <Text style={[styles.fontJakartaBold, { color: catLimit > 0 ? theme.primary : theme.subText, fontSize: 12 }]}>
                  {catLimit > 0 ? `${catLimit.toLocaleString('uk-UA')} ₴` : '+ Ліміт'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Прогрес-бар */}
            <View style={{ height: 6, backgroundColor: theme.inputBg, borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
              <View 
                style={{ 
                  width: `${catLimit > 0 ? Math.min(percent, 100) : 0}%`, 
                  height: '100%', 
                  backgroundColor: catSpent > catLimit && catLimit > 0 ? theme.expense : (cat.color || theme.primary) 
                }} 
              />
            </View>

            {isEditing && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <TextInput 
                  placeholder="Вкажіть ліміт (₴)"
                  placeholderTextColor={theme.subText}
                  keyboardType="numeric"
                  value={limitInput}
                  onChangeText={setLimitInput}
                  style={[styles.input, { flex: 1, backgroundColor: theme.inputBg, borderColor, color: theme.text }]}
                  autoFocus
                />
                <TouchableOpacity onPress={() => saveLimit(cat.name)} style={[styles.saveBtn, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.fontJakartaBold, { color: theme.primaryText, fontSize: 12 }]}>Зберегти</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fontJakarta: { fontWeight: '400' },
  fontJakartaSemi: { fontWeight: '600' },
  fontJakartaBold: { fontWeight: '700' },
  card: { borderRadius: 16 },
  backBtn: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modeChip: { paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  iconBox: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  editBtn: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  editLimitBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13 },
  saveBtn: { borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  copyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingVertical: 10, borderRadius: 12, marginBottom: 16 }
});
