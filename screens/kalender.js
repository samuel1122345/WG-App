import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Dimensions, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';
import { collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  DEFAULT_TASK_END_TIME,
  DEFAULT_TASK_START_TIME,
  buildBirthdayItems,
  combineDateAndTime,
  datesAreSameDay,
  ensureEndAfterStart,
  formatDateDisplay,
  formatDateInput,
  formatTimeRange,
  getItemEnd,
  getItemStart,
  looksLikeTaskTitle,
  normalizeTime,
  parseDateInput,
} from '../utils/calendarHelpers';

const { width } = Dimensions.get('window');

const formatTimeInputFromDate = (date, fallback) => {
  if (!date || Number.isNaN(date.getTime())) return fallback;
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

export default function KalenderScreen({
  currentUser,
  currentWg,
  allTasks = [],
  calendarEvents = [],
  members = [],
}) {
  const today = new Date();
  const [monthCursor, setMonthCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventDateInput, setEventDateInput] = useState(formatDateInput(today));
  const [eventStartTime, setEventStartTime] = useState(DEFAULT_TASK_START_TIME);
  const [eventEndTime, setEventEndTime] = useState(DEFAULT_TASK_END_TIME);
  const [eventBlocksAssignments, setEventBlocksAssignments] = useState(true);
  const [eventAsTask, setEventAsTask] = useState(false);

  const selectedYear = monthCursor.getFullYear();
  const selectedMonth = monthCursor.getMonth();

  const birthdayItems = useMemo(() => {
    return buildBirthdayItems(members, selectedYear);
  }, [members, selectedYear]);

  const taskItems = useMemo(() => {
    return allTasks.map((task) => ({
      ...task,
      source: 'task',
      displayType: 'task',
      startAt: task.startAt || task.fullDate,
      endAt: task.endAt,
      blocksAssignments: false,
    }));
  }, [allTasks]);

  const visibleCalendarEvents = useMemo(() => {
    // Wenn ein Kalendertermin gleichzeitig als Aufgabe angelegt wurde, zeigen wir ihn nicht doppelt an.
    return calendarEvents
      .filter((event) => !event.linkedTaskId)
      .map((event) => ({ ...event, source: 'calendarEvent', displayType: 'event' }));
  }, [calendarEvents]);

  const combinedItems = useMemo(() => {
    return [...taskItems, ...visibleCalendarEvents, ...birthdayItems].sort((a, b) => {
      const startA = getItemStart(a)?.getTime?.() || 0;
      const startB = getItemStart(b)?.getTime?.() || 0;
      return startA - startB;
    });
  }, [taskItems, visibleCalendarEvents, birthdayItems]);

  const selectedDayItems = combinedItems.filter((item) => datesAreSameDay(getItemStart(item), selectedDate));

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstWeekday = new Date(selectedYear, selectedMonth, 1).getDay();
  const blankDaysCount = (firstWeekday + 6) % 7; // Montag als erster Tag
  const blankDays = Array.from({ length: blankDaysCount }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthLabel = monthCursor.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  const isEditing = Boolean(editingEvent?.id);

  const openAddModal = () => {
    setEditingEvent(null);
    setEventTitle('');
    setEventDesc('');
    setEventDateInput(formatDateInput(selectedDate));
    setEventStartTime(DEFAULT_TASK_START_TIME);
    setEventEndTime(DEFAULT_TASK_END_TIME);
    setEventBlocksAssignments(true);
    setEventAsTask(false);
    setIsAddModalVisible(true);
  };

  const openEditModal = (event) => {
    if (event.source !== 'calendarEvent') return;

    // Sicherheitsregel: Ein Nutzer kann erstmal nur eigene manuell angelegte Termine bearbeiten.
    if (event.userId && currentUser?.id && event.userId !== currentUser.id) {
      Alert.alert('Nicht bearbeitbar', 'Du kannst aktuell nur deine eigenen Kalendertermine bearbeiten.');
      return;
    }

    const start = getItemStart(event) || selectedDate;
    const end = getItemEnd(event) || ensureEndAfterStart(start, new Date(start.getTime() + 60 * 60 * 1000));

    setEditingEvent(event);
    setEventTitle(event.title || '');
    setEventDesc(event.desc || '');
    setEventDateInput(formatDateInput(start));
    setEventStartTime(event.startTime || formatTimeInputFromDate(start, DEFAULT_TASK_START_TIME));
    setEventEndTime(event.endTime || formatTimeInputFromDate(end, DEFAULT_TASK_END_TIME));
    setEventBlocksAssignments(event.blocksAssignments !== false);
    setEventAsTask(false);
    setIsAddModalVisible(true);
  };

  const closeAddModal = () => {
    setIsAddModalVisible(false);
    setEditingEvent(null);
  };

  const changeMonth = (direction) => {
    setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  const hasItemsOnDay = (day) => {
    const date = new Date(selectedYear, selectedMonth, day);
    return combinedItems.some((item) => datesAreSameDay(getItemStart(item), date));
  };

  const handleSaveEvent = async () => {
    if (!eventTitle.trim()) {
      Alert.alert('Fehler', 'Bitte gib einen Titel ein.');
      return;
    }

    const parsedDate = parseDateInput(eventDateInput);
    if (!parsedDate) {
      Alert.alert('Fehler', 'Bitte gib das Datum im Format TT.MM.JJJJ ein, z.B. 20.06.2026.');
      return;
    }

    const normalizedStartTime = normalizeTime(eventStartTime, DEFAULT_TASK_START_TIME);
    const normalizedEndTime = normalizeTime(eventEndTime, DEFAULT_TASK_END_TIME);
    const startAt = combineDateAndTime(parsedDate, normalizedStartTime);
    const endAt = ensureEndAfterStart(startAt, combineDateAndTime(parsedDate, normalizedEndTime));

    try {
      if (isEditing) {
        const eventRef = doc(db, 'calendarEvents', editingEvent.id);

        await updateDoc(eventRef, {
          title: eventTitle.trim(),
          desc: eventDesc.trim(),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          blocksAssignments: eventBlocksAssignments,
          updatedAt: new Date().toISOString(),
        });

        setSelectedDate(parsedDate);
        closeAddModal();
        Alert.alert('Gespeichert', 'Der Termin wurde aktualisiert.');
        return;
      }

      const shouldCreateInboxTask = eventAsTask || looksLikeTaskTitle(eventTitle);
      const batch = writeBatch(db);
      const eventRef = doc(collection(db, 'calendarEvents'));
      const taskRef = shouldCreateInboxTask ? doc(collection(db, 'tasks')) : null;

      batch.set(eventRef, {
        title: eventTitle.trim(),
        desc: eventDesc.trim(),
        wgId: currentWg.id,
        userId: currentUser.id,
        userName: currentUser.name,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        blocksAssignments: eventBlocksAssignments,
        type: shouldCreateInboxTask ? 'task_detected' : 'manual_event',
        source: 'manual',
        linkedTaskId: taskRef?.id || null,
        createdAt: new Date().toISOString(),
      });

      if (taskRef) {
        batch.set(taskRef, {
          title: eventTitle.trim().replace(/^aufgabe:\s*/i, ''),
          dateDisplay: formatDateDisplay(startAt),
          dateNum: startAt.getDate(),
          fullDate: startAt.toISOString(),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          startTime: normalizedStartTime,
          endTime: normalizedEndTime,
          userId: currentUser.id,
          userName: currentUser.name,
          userColor: currentUser.color || '#007AFF',
          userBg: currentUser.avatarBg || currentUser.bg || '#EBF4FF',
          desc: eventDesc.trim() || 'Aus Kalendertermin als Aufgabe erkannt.',
          wgId: currentWg.id,
          type: 'calendar_task',
          source: 'calendar_event',
          sourceCalendarEventId: eventRef.id,
          createdAt: new Date().toISOString(),
        });
      }

      await batch.commit();
      setSelectedDate(parsedDate);
      closeAddModal();
      Alert.alert('Gespeichert', shouldCreateInboxTask ? 'Termin wurde gespeichert und zusätzlich in die Inbox gelegt.' : 'Termin wurde gespeichert.');
    } catch (error) {
      console.error(error);
      Alert.alert('Fehler', isEditing ? 'Der Termin konnte nicht aktualisiert werden.' : 'Der Termin konnte nicht gespeichert werden.');
    }
  };

  const handleDeleteEvent = () => {
    if (!editingEvent?.id) return;

    Alert.alert(
      'Termin löschen',
      'Möchtest du diesen Kalendertermin wirklich löschen?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'calendarEvents', editingEvent.id));
              closeAddModal();
              Alert.alert('Gelöscht', 'Der Termin wurde gelöscht.');
            } catch (error) {
              console.error(error);
              Alert.alert('Fehler', 'Der Termin konnte nicht gelöscht werden.');
            }
          },
        },
      ]
    );
  };

  const renderItemIcon = (item) => {
    if (item.source === 'birthday') return { name: 'gift-outline', color: '#AF52DE' };
    if (item.source === 'task') return { name: 'checkbox-outline', color: '#34C759' };
    return { name: item.blocksAssignments === false ? 'calendar-outline' : 'lock-closed-outline', color: '#007AFF' };
  };

  return (
    <View style={styles.wrapper}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.content}>
        <View style={styles.monthContainer}>
          <View style={styles.monthTopRow}>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => changeMonth(-1)}>
              <Ionicons name="chevron-back" size={20} color="#000" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthLabel}</Text>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => changeMonth(1)}>
              <Ionicons name="chevron-forward" size={20} color="#000" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthHeaderRow}>
            {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, index) => (
              <Text key={`${d}-${index}`} style={styles.monthHeaderCell}>{d}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {blankDays.map((b) => <View key={`blank-${b}`} style={styles.gridCellEmpty} />)}
            {days.map((day) => {
              const cellDate = new Date(selectedYear, selectedMonth, day);
              const isSelected = datesAreSameDay(selectedDate, cellDate);
              const isToday = datesAreSameDay(today, cellDate);
              const hasItems = hasItemsOnDay(day);

              return (
                <TouchableOpacity
                  key={day}
                  style={[styles.gridCell, isSelected && styles.gridCellActive, isToday && !isSelected && styles.gridCellToday]}
                  onPress={() => setSelectedDate(cellDate)}
                >
                  <Text style={[styles.gridCellText, isSelected && styles.gridCellTextActive]}>{day}</Text>
                  {hasItems && !isSelected && <View style={styles.dotIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>{formatDateDisplay(selectedDate)}</Text>
            <Text style={styles.sectionSubTitle}>{selectedDayItems.length} Einträge</Text>
          </View>
        </View>

        {selectedDayItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-clear-outline" size={42} color="#C7C7CC" />
            <Text style={styles.emptyText}>Keine Termine oder Aufgaben an diesem Tag.</Text>
          </View>
        ) : (
          selectedDayItems.map((item) => {
            const icon = renderItemIcon(item);
            const start = getItemStart(item);
            const end = getItemEnd(item);
            const timeLabel = item.source === 'birthday' ? 'Ganztägig' : formatTimeRange(start, end);
            const canEditItem = item.source === 'calendarEvent' && (!item.userId || item.userId === currentUser?.id);
            const CardContainer = canEditItem ? TouchableOpacity : View;

            return (
              <CardContainer
                key={`${item.source}-${item.id}`}
                style={styles.itemCard}
                onPress={canEditItem ? () => openEditModal(item) : undefined}
                activeOpacity={0.85}
              >
                <View style={[styles.itemIcon, { backgroundColor: `${icon.color}18` }]}>
                  <Ionicons name={icon.name} size={20} color={icon.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.itemTitleRow}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {canEditItem ? <Ionicons name="create-outline" size={18} color="#8E8E93" /> : null}
                  </View>
                  <Text style={styles.itemMeta}>{timeLabel}{item.userName ? ` • ${item.userName}` : ''}</Text>
                  {item.desc ? <Text style={styles.itemDesc}>{item.desc}</Text> : null}
                  {item.blocksAssignments && item.source === 'calendarEvent' ? (
                    <Text style={styles.blockText}>Blockiert deine Aufgaben-Zuweisung in diesem Zeitraum</Text>
                  ) : null}
                  {canEditItem ? <Text style={styles.editHintText}>Antippen zum Bearbeiten</Text> : null}
                </View>
              </CardContainer>
            );
          })
        )}

        <View style={{ height: 110 }} />
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Ionicons name="add" size={36} color="#FFF" />
      </TouchableOpacity>

      <Modal visible={isAddModalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.modalSheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>{isEditing ? 'Termin bearbeiten' : 'Neuer Kalendertermin'}</Text>
              <TouchableOpacity onPress={closeAddModal}>
                <Text style={styles.cancelLink}>Abbrechen</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Titel, z.B. Arzttermin oder Aufgabe: Küche putzen"
              value={eventTitle}
              onChangeText={setEventTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="Datum TT.MM.JJJJ"
              value={eventDateInput}
              onChangeText={setEventDateInput}
              keyboardType="numbers-and-punctuation"
            />
            <View style={styles.timeRow}>
              <TextInput
                style={[styles.input, styles.timeInput]}
                placeholder="Start HH:MM"
                value={eventStartTime}
                onChangeText={setEventStartTime}
                keyboardType="numbers-and-punctuation"
              />
              <TextInput
                style={[styles.input, styles.timeInput]}
                placeholder="Ende HH:MM"
                value={eventEndTime}
                onChangeText={setEventEndTime}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <TextInput
              style={[styles.input, styles.descInput]}
              placeholder="Notiz optional"
              value={eventDesc}
              onChangeText={setEventDesc}
              multiline
            />

            <TouchableOpacity style={styles.toggleRow} onPress={() => setEventBlocksAssignments(!eventBlocksAssignments)}>
              <View style={[styles.fakeCheckbox, eventBlocksAssignments && styles.fakeCheckboxActive]}>
                {eventBlocksAssignments && <Ionicons name="checkmark" size={14} color="#FFF" />}
              </View>
              <Text style={styles.toggleText}>Dieser Termin blockiert meine Aufgaben-Zuweisung</Text>
            </TouchableOpacity>

            {!isEditing ? (
              <TouchableOpacity style={styles.toggleRow} onPress={() => setEventAsTask(!eventAsTask)}>
                <View style={[styles.fakeCheckbox, eventAsTask && styles.fakeCheckboxActiveBlack]}>
                  {eventAsTask && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <Text style={styles.toggleText}>Zusätzlich als Aufgabe in die Inbox legen</Text>
              </TouchableOpacity>
            ) : null}

            {!isEditing ? (
              <Text style={styles.helperText}>
                Tipp: Wenn der Titel mit „Aufgabe:“ beginnt oder Wörter wie „putzen“, „Müll“ oder „einkaufen“ enthält, wird automatisch eine Inbox-Aufgabe erstellt.
              </Text>
            ) : null}

            <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveEvent}>
              <Text style={styles.primaryBtnText}>{isEditing ? 'Änderungen speichern' : 'Termin speichern'}</Text>
            </TouchableOpacity>

            {isEditing ? (
              <TouchableOpacity style={styles.dangerBtn} onPress={handleDeleteEvent}>
                <Text style={styles.dangerBtnText}>Termin löschen</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: '#FFF' },
  content: { flex: 1, paddingHorizontal: 25 },
  monthContainer: { backgroundColor: '#FFF', marginBottom: 25, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  monthTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  monthTitle: { fontSize: 22, fontWeight: '800', color: '#000', textTransform: 'capitalize' },
  monthNavButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  monthHeaderRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 },
  monthHeaderCell: { width: width / 8, textAlign: 'center', fontSize: 11, color: '#8E8E93', fontWeight: '600' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: (width - 50) / 7, height: 44, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  gridCellEmpty: { width: (width - 50) / 7, height: 44 },
  gridCellText: { fontSize: 16, fontWeight: '400', color: '#000' },
  gridCellActive: { backgroundColor: '#FF3B30', borderRadius: 22 },
  gridCellToday: { borderWidth: 1, borderColor: '#FF3B30', borderRadius: 22 },
  gridCellTextActive: { color: '#FFF', fontWeight: '600' },
  dotIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#8E8E93', position: 'absolute', bottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  sectionSubTitle: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  addSmallButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { alignItems: 'center', marginTop: 35 },
  emptyText: { marginTop: 10, color: '#8E8E93', textAlign: 'center' },
  itemCard: { flexDirection: 'row', backgroundColor: '#F2F2F7', padding: 14, borderRadius: 18, marginBottom: 10 },
  itemIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E', flex: 1 },
  itemMeta: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  itemDesc: { fontSize: 13, color: '#3A3A3C', marginTop: 6, lineHeight: 18 },
  blockText: { fontSize: 12, color: '#007AFF', marginTop: 6, fontWeight: '600' },
  editHintText: { fontSize: 12, color: '#8E8E93', marginTop: 6, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 30, right: 25, width: 64, height: 64, backgroundColor: '#000', borderRadius: 32, justifyContent: 'center', alignItems: 'center', elevation: 5 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#000', flex: 1 },
  cancelLink: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  input: { backgroundColor: '#F2F2F7', padding: 15, borderRadius: 14, marginBottom: 10, fontSize: 16, color: '#000' },
  descInput: { height: 74, paddingTop: 12 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeInput: { width: '48%' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  fakeCheckbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#C7C7CC', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  fakeCheckboxActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  fakeCheckboxActiveBlack: { backgroundColor: '#000', borderColor: '#000' },
  toggleText: { fontSize: 14, color: '#1C1C1E', flex: 1, fontWeight: '500' },
  helperText: { fontSize: 12, color: '#8E8E93', lineHeight: 17, marginTop: 8, marginBottom: 14 },
  primaryBtn: { backgroundColor: '#000', padding: 17, borderRadius: 18, alignItems: 'center' },
  primaryBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  dangerBtn: { marginTop: 10, padding: 15, borderRadius: 16, alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#FF3B30' },
  dangerBtnText: { color: '#FF3B30', fontSize: 15, fontWeight: '800' },
});