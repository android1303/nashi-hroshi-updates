import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PendingTransactionsModal({
  visible,
  onClose,
  theme,
  isLight,
  cardBg,
  borderColor,
  pendingList = [],
  categories = [],
  currentDeviceUser = 'Андрій',
  onConfirmPayment,
  onRejectPayment,
  onConfirmAll,
  onAddTestPayment,
  onOpenSettings
}) {
  const [selectedCategories, setSelectedCategories] = useState({});
  const [expandedCatIdx, setExpandedCatIdx] = useState(null);

  const getEffectiveCategory = (item, idx) => {
    return selectedCategories[item.id] || item.suggestedCategory || 'Продукти';
  };

  const handlePickCategory = (itemId, catName) => {
    setSelectedCategories(prev => ({ ...prev, [itemId]: catName }));
    setExpandedCatIdx(null);
  };

  const allExpenseSubcategories = [];
  (categories || []).forEach(grp => {
    if (!grp.isHidden && Array.isArray(grp.items)) {
      grp.items.forEach(sub => {
        allExpenseSubcategories.push({
          subName: sub,
          groupName: grp.name,
          groupId: grp.id,
          icon: grp.icon || 'pricetag-outline',
          color: grp.color || theme.primary
        });
      });
    }
  });

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: cardBg, borderColor, borderTopWidth: 1 }]}>
          {/* Індикатор перетягування */}
          <View style={styles.dragHandleWrap}>
            <View style={[styles.dragHandle, { backgroundColor: theme.subText + '44' }]} />
          </View>

          {/* Заголовок */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>⚡</Text>
                <Text style={[styles.title, { color: theme.text }]}>
                  Оплати Google Wallet
                </Text>
              </View>
              <Text style={[styles.subtitle, { color: theme.subText }]}>
                {pendingList.length > 0
                  ? `Знайдено ${pendingList.length} непідтверджених оплат для ${currentDeviceUser}`
                  : `Немає очікуючих оплат для ${currentDeviceUser}`}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.inputBg }]}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Кнопка швидкого підтвердження всіх, якщо їх > 1 */}
            {pendingList.length > 1 && (
              <TouchableOpacity
                onPress={() => onConfirmAll && onConfirmAll(selectedCategories)}
                style={[styles.confirmAllBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="checkmark-done" size={18} color={theme.primaryText} />
                <Text style={[styles.confirmAllText, { color: theme.primaryText }]}>
                  Підтвердити всі ({pendingList.length})
                </Text>
              </TouchableOpacity>
            )}

            {/* Список карток */}
            {pendingList.length > 0 ? (
              pendingList.map((item, idx) => {
                const currentCat = getEffectiveCategory(item, idx);
                const isCatPickerOpen = expandedCatIdx === idx;
                const formattedDate = item.timestamp
                  ? new Date(item.timestamp).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
                  : 'Зараз';

                return (
                  <View
                    key={item.id || idx}
                    style={[styles.card, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1 }]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.merchantName, { color: theme.text }]} numberOfLines={1}>
                          {item.merchant || 'Оплата карткою'}
                        </Text>
                        <Text style={[styles.timestampText, { color: theme.subText }]}>
                          Сьогодні о {formattedDate} • {currentDeviceUser}
                        </Text>
                      </View>
                      <View style={[styles.amountBadge, { backgroundColor: theme.expense + '22' }]}>
                        <Text style={[styles.amountText, { color: theme.expense }]}>
                          -{(Number(item.amount) || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴
                        </Text>
                      </View>
                    </View>

                    {/* Вибір категорії */}
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.fieldLabel, { color: theme.subText }]}>Категорія:</Text>
                      <TouchableOpacity
                        onPress={() => setExpandedCatIdx(isCatPickerOpen ? null : idx)}
                        style={[styles.catSelector, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
                      >
                        <Ionicons name="pricetag-outline" size={14} color={theme.primary} />
                        <Text style={[styles.catSelectorText, { color: theme.text }]}>
                          {currentCat}
                        </Text>
                        <Ionicons
                          name={isCatPickerOpen ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={theme.subText}
                        />
                      </TouchableOpacity>

                      {/* Випадаючий список швидких категорій */}
                      {isCatPickerOpen && (
                        <View style={[styles.catDropdown, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}>
                          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled>
                            {allExpenseSubcategories.map(c => (
                              <TouchableOpacity
                                key={c.subName}
                                onPress={() => handlePickCategory(item.id, c.subName)}
                                style={[
                                  styles.catOption,
                                  currentCat === c.subName && { backgroundColor: theme.primary + '22' }
                                ]}
                              >
                                <Ionicons name={c.icon} size={14} color={c.color} />
                                <Text
                                  style={[
                                    styles.catOptionText,
                                    { color: currentCat === c.subName ? theme.primary : theme.text }
                                  ]}
                                >
                                  {c.subName}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>

                    {/* Кнопки дій */}
                    <View style={styles.cardActionsRow}>
                      <TouchableOpacity
                        onPress={() => onRejectPayment && onRejectPayment(item.id)}
                        style={[styles.actionBtn, styles.rejectBtn, { borderColor, borderWidth: 1, backgroundColor: cardBg }]}
                      >
                        <Ionicons name="close" size={16} color={theme.subText} />
                        <Text style={[styles.actionBtnText, { color: theme.subText }]}>Відхилити</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => onConfirmPayment && onConfirmPayment(item, currentCat)}
                        style={[styles.actionBtn, styles.confirmBtn, { backgroundColor: theme.primary }]}
                      >
                        <Ionicons name="checkmark" size={16} color={theme.primaryText} />
                        <Text style={[styles.actionBtnText, { color: theme.primaryText }]}>Підтвердити</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.emptyWrap}>
                <Ionicons name="shield-checkmark-outline" size={56} color={theme.primary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  Всі оплати підтверджено!
                </Text>
                <Text style={[styles.emptySubtitle, { color: theme.subText }]}>
                  Коли ви розрахуєтесь телефоном через Google Wallet або отримаєте пуш від банку — платіж миттєво з'явиться тут для підтвердження.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                  <TouchableOpacity
                    onPress={() => onAddTestPayment && onAddTestPayment()}
                    style={[styles.emptyActionBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary, borderWidth: 1 }]}
                  >
                    <Ionicons name="flash-outline" size={16} color={theme.primary} />
                    <Text style={[styles.emptyActionText, { color: theme.primary }]}>
                      Тестовий платіж (Сільпо 185 ₴)
                    </Text>
                  </TouchableOpacity>
                </View>

                {onOpenSettings && (
                  <TouchableOpacity
                    onPress={onOpenSettings}
                    style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Ionicons name="settings-outline" size={14} color={theme.subText} />
                    <Text style={[styles.fontSemi, { color: theme.subText, fontSize: 12 }]}>
                      Налаштувати доступ до сповіщень
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12
  },
  dragHandleWrap: {
    alignItems: 'center',
    marginBottom: 10
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  title: {
    fontSize: 18,
    fontWeight: '700'
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center'
  },
  confirmAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
    marginBottom: 14
  },
  confirmAllText: {
    fontSize: 13,
    fontWeight: '700'
  },
  card: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  merchantName: {
    fontSize: 15,
    fontWeight: '700'
  },
  timestampText: {
    fontSize: 11,
    marginTop: 2
  },
  amountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10
  },
  amountText: {
    fontSize: 15,
    fontWeight: '800'
  },
  fieldLabel: {
    fontSize: 11,
    marginBottom: 4,
    fontWeight: '600'
  },
  catSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12
  },
  catSelectorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 8
  },
  catDropdown: {
    marginTop: 6,
    borderRadius: 12,
    overflow: 'hidden'
  },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  catOptionText: {
    fontSize: 12,
    fontWeight: '500'
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },
  rejectBtn: {},
  confirmBtn: {},
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 10
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: '700'
  },
  fontSemi: {
    fontWeight: '600'
  }
});
