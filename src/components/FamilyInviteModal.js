import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Share,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const LATEST_APK_URL = 'https://github.com/android1303/nashi-hroshi-updates/releases/latest/download/app-release.apk';
const RELEASES_PAGE_URL = 'https://github.com/android1303/nashi-hroshi-updates/releases';

export default function FamilyInviteModal({
  visible,
  onClose,
  theme,
  isLight,
  cardBg,
  borderColor,
  familyMembers = ['Андрій', 'Людмила'],
  currentDeviceUser = 'Андрій',
  onSelectDeviceUser,
  onAddFamilyMember,
  onRemoveFamilyMember
}) {
  const [newMemberName, setNewMemberName] = useState('');
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const handleShareInvite = async () => {
    try {
      const message = `Приєднуйся до нашого спільного сімейного бюджету «Наші Гроші»! 💰\n\n` +
        `1. Завантаж додаток на смартфон:\n${LATEST_APK_URL}\n\n` +
        `2. Відкрий додаток та обери свій профіль у сім'ї.\n\n` +
        `Усі витрати, доходи, фото чеків та Google Wallet синхронізуються між нами автоматично! ✨`;

      await Share.share({
        title: 'Запрошення в сімейний бюджет «Наші Гроші»',
        message
      });
    } catch (e) {
      Alert.alert('Помилка', 'Не вдалося відкрити меню поширення.');
    }
  };

  const handleAddNew = () => {
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    if (familyMembers.some(m => m.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Увага', 'Користувач із таким ім’ям уже є в списку.');
      return;
    }
    onAddFamilyMember && onAddFamilyMember(trimmed);
    setNewMemberName('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: cardBg, borderColor, borderTopWidth: 1 }]}>
          <View style={styles.dragHandleWrap}>
            <View style={[styles.dragHandle, { backgroundColor: theme.subText + '44' }]} />
          </View>

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>👨‍👩‍👧‍👦</Text>
                <Text style={[styles.title, { color: theme.text }]}>
                  Сім'я та Користувачі
                </Text>
              </View>
              <Text style={[styles.subtitle, { color: theme.subText }]}>
                Спільний облік витрат, профілі та запрошення
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.inputBg }]}>
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* 1. Хто користується ЦИМ пристроєм */}
            <View style={[styles.sectionCard, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="phone-portrait-outline" size={18} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Мій профіль на цьому телефоні:
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: theme.subText }]}>
                Всі витрати через Google Wallet, голос та фото з цього телефону будуть записані від вашого імені:
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {familyMembers.map(m => {
                  const isCurrent = m === currentDeviceUser;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => onSelectDeviceUser && onSelectDeviceUser(m)}
                      style={[
                        styles.userChip,
                        {
                          backgroundColor: isCurrent ? theme.primary : cardBg,
                          borderColor: isCurrent ? theme.primary : borderColor,
                          borderWidth: 1
                        }
                      ]}
                    >
                      <Ionicons
                        name={isCurrent ? 'checkmark-circle' : 'person-circle-outline'}
                        size={16}
                        color={isCurrent ? theme.primaryText : theme.text}
                      />
                      <Text
                        style={[
                          styles.userChipText,
                          { color: isCurrent ? theme.primaryText : theme.text }
                        ]}
                      >
                        {m} {isCurrent ? '(Цей телефон)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 2. Запросити члена сім'ї */}
            <View style={[styles.sectionCard, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="person-add-outline" size={18} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Запросити в сімейний бюджет
                </Text>
              </View>
              <Text style={[styles.sectionDesc, { color: theme.subText }]}>
                Надішліть посилання партнеру або іншому члену сім'ї. Після встановлення всі операції будуть синхронізуватися між телефонами миттєво!
              </Text>

              <TouchableOpacity
                onPress={handleShareInvite}
                style={[styles.shareBtn, { backgroundColor: theme.primary }]}
              >
                <Ionicons name="share-social" size={18} color={theme.primaryText} />
                <Text style={[styles.shareBtnText, { color: theme.primaryText }]}>
                  Поділитися запрошенням (Telegram, Viber тощо)
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3. Список усіх учасників сім'ї та додавання нових */}
            <View style={[styles.sectionCard, { backgroundColor: theme.inputBg, borderColor, borderWidth: 1 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Ionicons name="people-outline" size={18} color={theme.primary} />
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Учасники сім'ї ({familyMembers.length})
                </Text>
              </View>

              <View style={{ gap: 8, marginTop: 4 }}>
                {familyMembers.map(m => (
                  <View
                    key={m}
                    style={[styles.memberRow, { backgroundColor: cardBg, borderColor, borderWidth: 1 }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.avatarCircle, { backgroundColor: theme.primary + '22' }]}>
                        <Text style={[styles.avatarLetter, { color: theme.primary }]}>
                          {m.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={[styles.memberName, { color: theme.text }]}>{m}</Text>
                        <Text style={[styles.memberSub, { color: theme.subText }]}>
                          {m === currentDeviceUser ? 'Власник цього пристрою' : 'Спільний доступ'}
                        </Text>
                      </View>
                    </View>

                    {familyMembers.length > 2 && m !== currentDeviceUser && (
                      <TouchableOpacity
                        onPress={() => onRemoveFamilyMember && onRemoveFamilyMember(m)}
                        style={{ padding: 6 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={theme.expense} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              {/* Форма додавання нового користувача */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TextInput
                  placeholder="Ім’я нового користувача..."
                  placeholderTextColor={theme.subText}
                  value={newMemberName}
                  onChangeText={setNewMemberName}
                  style={[
                    styles.nameInput,
                    { color: theme.text, backgroundColor: cardBg, borderColor, borderWidth: 1 }
                  ]}
                />
                <TouchableOpacity
                  onPress={handleAddNew}
                  style={[styles.addBtn, { backgroundColor: theme.primary }]}
                >
                  <Ionicons name="add" size={20} color={theme.primaryText} />
                </TouchableOpacity>
              </View>
            </View>
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
  sectionCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 14
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700'
  },
  sectionDesc: {
    fontSize: 11,
    lineHeight: 16
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6
  },
  userChipText: {
    fontSize: 12,
    fontWeight: '700'
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    marginTop: 12
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '700'
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarLetter: {
    fontSize: 14,
    fontWeight: '800'
  },
  memberName: {
    fontSize: 13,
    fontWeight: '700'
  },
  memberSub: {
    fontSize: 10,
    marginTop: 1
  },
  nameInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600'
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  }
});
