import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { buildNotificationKey, createNotificationOnce } from '../utils/notificationHelpers';
import {
  buildTodoSuggestions,
  createTodoItem,
  sortTodoItems,
  visibleTodoForUser,
} from '../utils/todoAiHelpers';
import { formatDateDisplay, formatTimeRange, getItemEnd, getItemStart } from '../utils/calendarHelpers';

const PRIVACY_PRIVATE = 'private';
const PRIVACY_SHARED = 'shared';

const normalizeMemberIds = (ids = [], currentUserId) => {
  const cleaned = Array.from(new Set([...(ids || []).filter(Boolean), currentUserId].filter(Boolean)));
  return cleaned;
};

const formatRelativeDate = (value) => {
  const date = getItemStart(value) || new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${formatDateDisplay(date)}${formatTimeRange(date, getItemEnd(value)) ? `, ${formatTimeRange(date, getItemEnd(value))}` : ''}`;
};

const getInitials = (name = '') => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const BottomSheet = ({ visible, onClose, children, windowHeight, maxHeightRatio = 0.82, keyboardAvoid = false }) => {
  const sheetMaxHeight = Math.max(420, Math.round(windowHeight * maxHeightRatio));

  const sheetContent = (
    <View style={[styles.bottomSheet, { maxHeight: sheetMaxHeight }]}>
      <View style={styles.dragHandle} />
      {children}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose} />

        {keyboardAvoid ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardSheetWrapper}
            pointerEvents="box-none"
          >
            {sheetContent}
          </KeyboardAvoidingView>
        ) : (
          sheetContent
        )}
      </View>
    </Modal>
  );
};

export default function TodosScreen({ currentUser, currentWg, allTasks = [], calendarEvents = [], members = [] }) {
  const { height: windowHeight } = useWindowDimensions();
  const [todos, setTodos] = useState([]);
  const [showArchived, setShowArchived] = useState(false);

  const [selectedTodo, setSelectedTodo] = useState(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const [isAiVisible, setIsAiVisible] = useState(false);
  const [editingTodo, setEditingTodo] = useState(null);
  const [isSavingTodo, setIsSavingTodo] = useState(false);

  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVisibility, setFormVisibility] = useState(PRIVACY_PRIVATE);
  const [formMemberIds, setFormMemberIds] = useState([]);
  const [formItems, setFormItems] = useState([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [linkedType, setLinkedType] = useState('none');
  const [linkedItemId, setLinkedItemId] = useState('');

  useEffect(() => {
    if (!currentWg?.id) {
      setTodos([]);
      return undefined;
    }

    const q = query(collection(db, 'todoLists'), where('wgId', '==', currentWg.id));
    return onSnapshot(q, (snap) => {
      const loaded = snap.docs.map((todoDoc) => ({ id: todoDoc.id, ...todoDoc.data() }));
      loaded.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      setTodos(loaded);
    });
  }, [currentWg?.id]);

  const visibleTodos = useMemo(() => {
    return todos
      .filter((todo) => visibleTodoForUser(todo, currentUser?.id))
      .filter((todo) => (showArchived ? Boolean(todo.archived) : !todo.archived))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
  }, [todos, currentUser?.id, showArchived]);

  const aiSuggestions = useMemo(() => {
    return buildTodoSuggestions({
      currentUser,
      currentWg,
      calendarEvents,
      tasks: allTasks,
      members,
      now: new Date(),
    });
  }, [currentUser, currentWg, calendarEvents, allTasks, members]);

  const linkedOptions = useMemo(() => {
    const eventOptions = calendarEvents
      .map((event) => ({
        type: 'calendar',
        id: event.id,
        title: event.title || 'Kalendertermin',
        subtitle: formatRelativeDate(event),
        source: event.source || 'calendar_event',
      }))
      .filter((item) => item.id);

    const taskOptions = allTasks
      .map((task) => ({
        type: 'task',
        id: task.id,
        title: task.title || 'Aufgabe',
        subtitle: formatRelativeDate(task),
        source: task.source || 'task',
      }))
      .filter((item) => item.id);

    return [...eventOptions, ...taskOptions].slice(0, 40);
  }, [calendarEvents, allTasks]);

  const selectedLinkedOption = linkedOptions.find((option) => option.type === linkedType && option.id === linkedItemId);

  const getTodoProgress = (todo) => {
    const items = todo.items || [];
    const done = items.filter((item) => item.done).length;
    return { done, total: items.length };
  };

  const getMemberNames = (memberIds = []) => {
    const names = memberIds
      .map((id) => members.find((member) => member.id === id)?.name || (id === currentUser?.id ? currentUser?.name : ''))
      .filter(Boolean);
    if (names.length === 0) return 'Nur du';
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  };

  const resetEditor = () => {
    setEditingTodo(null);
    setFormTitle('');
    setFormDesc('');
    setFormVisibility(PRIVACY_PRIVATE);
    setFormMemberIds(currentUser?.id ? [currentUser.id] : []);
    setFormItems([]);
    setNewItemTitle('');
    setLinkedType('none');
    setLinkedItemId('');
  };

  const openCreateEditor = (prefill = null) => {
    const suggestedShared = prefill?.suggestedVisibility === PRIVACY_SHARED;
    setEditingTodo(null);
    setFormTitle(prefill?.title || '');
    setFormDesc(prefill?.desc || '');
    setFormVisibility(suggestedShared ? PRIVACY_SHARED : PRIVACY_PRIVATE);
    setFormMemberIds(suggestedShared ? members.map((member) => member.id) : [currentUser.id]);
    setFormItems((prefill?.items || []).map((title, index) => ({ ...createTodoItem(title), order: index })));
    setNewItemTitle('');
    setLinkedType(prefill?.linkedType || 'none');
    setLinkedItemId(prefill?.linkedItemId || '');
    setIsEditorVisible(true);
  };

  const openEditEditor = (todo) => {
    setEditingTodo(todo);
    setFormTitle(todo.title || '');
    setFormDesc(todo.desc || '');
    setFormVisibility(todo.visibility || PRIVACY_PRIVATE);
    setFormMemberIds(normalizeMemberIds(todo.memberIds || [], currentUser.id));
    setFormItems((todo.items || []).map((item, index) => ({ ...item, order: item.order ?? index })));
    setNewItemTitle('');
    setLinkedType(todo.linkedType || 'none');
    setLinkedItemId(todo.linkedItemId || '');
    setIsDetailVisible(false);
    setIsEditorVisible(true);
  };

  const closeEditor = () => {
    setIsEditorVisible(false);
    resetEditor();
  };

  const openDetails = (todo) => {
    setSelectedTodo(todo);
    setIsDetailVisible(true);
  };

  const closeDetails = () => {
    setIsDetailVisible(false);
    setSelectedTodo(null);
  };

  const addFormItem = () => {
    const title = newItemTitle.trim();
    if (!title) return;
    setFormItems((current) => [...current, { ...createTodoItem(title), order: current.length }]);
    setNewItemTitle('');
  };

  const updateFormItemTitle = (id, title) => {
    setFormItems((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
  };

  const toggleFormItemDone = (id) => {
    const now = new Date().toISOString();
    setFormItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const nextDone = !item.done;
      return { ...item, done: nextDone, completedAt: nextDone ? now : null };
    }));
  };

  const removeFormItem = (id) => {
    setFormItems((current) => current.filter((item) => item.id !== id));
  };

  const toggleMember = (memberId) => {
    if (memberId === currentUser.id) return;
    setFormMemberIds((current) => {
      const base = normalizeMemberIds(current, currentUser.id);
      if (base.includes(memberId)) return base.filter((id) => id !== memberId || id === currentUser.id);
      return [...base, memberId];
    });
  };

  const selectAllMembers = () => {
    setFormMemberIds(members.map((member) => member.id));
  };

  const clearOtherMembers = () => {
    setFormMemberIds([currentUser.id]);
  };

  const notifyAddedMembers = async ({ todoId, todoTitle, memberIds, previousMemberIds = [] }) => {
    const oldSet = new Set(previousMemberIds || []);
    const targets = (memberIds || []).filter((memberId) => memberId !== currentUser.id && !oldSet.has(memberId));

    for (const memberId of targets) {
      await createNotificationOnce({
        notificationKey: buildNotificationKey('todo_added', currentWg.id, memberId, todoId),
        wgId: currentWg.id,
        userId: memberId,
        title: 'Du wurdest zu einem To-Do hinzugefügt 📝',
        message: `${currentUser.name || 'Ein WG-Mitglied'} hat dich zum To-Do "${todoTitle}" hinzugefügt.`,
        type: 'todo_added',
        extraData: {
          todoId,
          todoTitle,
          addedByUserId: currentUser.id,
          addedByName: currentUser.name || '',
        },
      });
    }
  };

  const handleSaveTodo = async () => {
    if (isSavingTodo) return;

    const title = formTitle.trim();
    if (!title) {
      Alert.alert('Titel fehlt', 'Bitte gib deinem To-Do einen Titel.');
      return;
    }

    setIsSavingTodo(true);

    const now = new Date().toISOString();
    const cleanedItems = formItems
      .map((item, index) => ({
        id: item.id || createTodoItem(item.title).id,
        title: String(item.title || '').trim(),
        done: Boolean(item.done),
        createdAt: item.createdAt || now,
        completedAt: item.done ? (item.completedAt || now) : null,
        order: index,
      }))
      .filter((item) => item.title);

    const memberIds = formVisibility === PRIVACY_PRIVATE
      ? [currentUser.id]
      : normalizeMemberIds(formMemberIds, currentUser.id);

    const linkedOption = linkedType === 'none'
      ? null
      : linkedOptions.find((option) => option.type === linkedType && option.id === linkedItemId);

    const payload = {
      wgId: currentWg.id,
      title,
      desc: formDesc.trim(),
      visibility: formVisibility,
      ownerId: editingTodo?.ownerId || currentUser.id,
      ownerName: editingTodo?.ownerName || currentUser.name || '',
      memberIds,
      items: cleanedItems,
      linkedType: linkedOption ? linkedOption.type : 'none',
      linkedItemId: linkedOption ? linkedOption.id : '',
      linkedTitle: linkedOption ? linkedOption.title : '',
      linkedSource: linkedOption ? linkedOption.source : '',
      updatedAt: now,
      archived: editingTodo?.archived || false,
    };

    try {
      if (editingTodo?.id) {
        await updateDoc(doc(db, 'todoLists', editingTodo.id), payload);

        const todoId = editingTodo.id;
        const previousMemberIds = editingTodo.memberIds || [];
        closeEditor();

        if (payload.visibility === PRIVACY_SHARED) {
          notifyAddedMembers({
            todoId,
            todoTitle: payload.title,
            memberIds: payload.memberIds,
            previousMemberIds,
          }).catch((notificationError) => {
            console.error('To-Do-Mitteilungen konnten nicht erstellt werden:', notificationError);
          });
        }
      } else {
        const createdRef = await addDoc(collection(db, 'todoLists'), {
          ...payload,
          createdAt: now,
          archived: false,
          archivedAt: null,
        });

        closeEditor();

        if (payload.visibility === PRIVACY_SHARED) {
          notifyAddedMembers({
            todoId: createdRef.id,
            todoTitle: payload.title,
            memberIds: payload.memberIds,
          }).catch((notificationError) => {
            console.error('To-Do-Mitteilungen konnten nicht erstellt werden:', notificationError);
          });
        }
      }
    } catch (error) {
      console.error('To-Do konnte nicht gespeichert werden:', error);
      Alert.alert('Fehler', 'Das To-Do konnte nicht gespeichert werden.');
    } finally {
      setIsSavingTodo(false);
    }
  };

  const handleToggleTodoItem = async (todo, itemId) => {
    if (!todo?.id) return;
    const now = new Date().toISOString();
    const nextItems = (todo.items || []).map((item) => {
      if (item.id !== itemId) return item;
      const nextDone = !item.done;
      return { ...item, done: nextDone, completedAt: nextDone ? now : null };
    });

    try {
      await updateDoc(doc(db, 'todoLists', todo.id), { items: nextItems, updatedAt: now });
      setSelectedTodo((current) => current?.id === todo.id ? { ...current, items: nextItems, updatedAt: now } : current);
    } catch (error) {
      console.error('Unterpunkt konnte nicht geändert werden:', error);
      Alert.alert('Fehler', 'Der Unterpunkt konnte nicht aktualisiert werden.');
    }
  };

  const handleArchiveTodo = (todo) => {
    if (!todo?.id) return;
    Alert.alert('To-Do archivieren', `Möchtest du "${todo.title}" abschließen und ins Archiv verschieben?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Archivieren',
        onPress: async () => {
          try {
            const now = new Date().toISOString();
            await updateDoc(doc(db, 'todoLists', todo.id), { archived: true, archivedAt: now, updatedAt: now });
            closeDetails();
          } catch (error) {
            Alert.alert('Fehler', 'Das To-Do konnte nicht archiviert werden.');
          }
        },
      },
    ]);
  };

  const handleRestoreTodo = async (todo) => {
    if (!todo?.id) return;
    try {
      await updateDoc(doc(db, 'todoLists', todo.id), { archived: false, archivedAt: null, updatedAt: new Date().toISOString() });
      closeDetails();
    } catch (error) {
      Alert.alert('Fehler', 'Das To-Do konnte nicht wiederhergestellt werden.');
    }
  };

  const handleDeleteTodo = (todo) => {
    if (!todo?.id) return;
    Alert.alert('To-Do löschen', `Soll "${todo.title}" wirklich gelöscht werden?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'todoLists', todo.id));
            closeEditor();
            closeDetails();
          } catch (error) {
            Alert.alert('Fehler', 'Das To-Do konnte nicht gelöscht werden.');
          }
        },
      },
    ]);
  };

  const handleUseSuggestion = (suggestion) => {
    setIsAiVisible(false);
    setTimeout(() => openCreateEditor(suggestion), 120);
  };

  const renderMemberAvatar = (member) => {
    return (
      <View style={[styles.memberAvatar, { backgroundColor: member.avatarBg || member.bg || member.color || '#007AFF' }]}>
        <Text style={styles.memberAvatarText}>{member.avatarEmoji || getInitials(member.name)}</Text>
      </View>
    );
  };

  const renderTodoCard = (todo) => {
    const progress = getTodoProgress(todo);
    const isPrivate = todo.visibility === PRIVACY_PRIVATE;

    return (
      <TouchableOpacity key={todo.id} style={styles.todoCard} activeOpacity={0.85} onPress={() => openDetails(todo)}>
        <View style={styles.todoCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.todoTitle}>{todo.title}</Text>
            {todo.desc ? <Text style={styles.todoDesc} numberOfLines={1}>{todo.desc}</Text> : null}
          </View>
          <View style={[styles.privacyBadge, isPrivate ? styles.privateBadge : styles.sharedBadge]}>
            <Ionicons name={isPrivate ? 'lock-closed' : 'people'} size={12} color={isPrivate ? '#007AFF' : '#34C759'} />
            <Text style={[styles.privacyBadgeText, { color: isPrivate ? '#007AFF' : '#34C759' }]}>{isPrivate ? 'Privat' : 'WG'}</Text>
          </View>
        </View>

        <View style={styles.todoMetaRow}>
          <Text style={styles.todoMetaText}>{progress.done}/{progress.total} erledigt</Text>
          <Text style={styles.todoMetaDot}>•</Text>
          <Text style={styles.todoMetaText}>{isPrivate ? 'Nur du' : getMemberNames(todo.memberIds)}</Text>
        </View>

        {todo.linkedTitle ? (
          <View style={styles.linkedPill}>
            <Ionicons name={todo.linkedType === 'calendar' ? 'calendar-outline' : 'checkbox-outline'} size={13} color="#8E8E93" />
            <Text style={styles.linkedPillText} numberOfLines={1}>{todo.linkedTitle}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderDetailSheet = () => {
    if (!selectedTodo) return null;
    const sortedItems = sortTodoItems(selectedTodo.items || []);
    const progress = getTodoProgress(selectedTodo);
    const isArchived = Boolean(selectedTodo.archived);

    return (
      <BottomSheet visible={isDetailVisible} onClose={closeDetails} windowHeight={windowHeight} maxHeightRatio={0.84}>
        <View style={styles.sheetHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle} numberOfLines={1}>{selectedTodo.title}</Text>
            <Text style={styles.sheetSubTitle}>{progress.done}/{progress.total} erledigt</Text>
          </View>
          <TouchableOpacity style={styles.sheetHeaderAction} onPress={() => openEditEditor(selectedTodo)}>
            <Text style={styles.sheetHeaderActionText}>Bearbeiten</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
          {selectedTodo.desc ? <Text style={styles.detailDesc}>{selectedTodo.desc}</Text> : null}

          {selectedTodo.linkedTitle ? (
            <View style={styles.detailLinkedBox}>
              <Ionicons name={selectedTodo.linkedType === 'calendar' ? 'calendar-outline' : 'checkbox-outline'} size={18} color="#007AFF" />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLinkedLabel}>Verknüpft mit</Text>
                <Text style={styles.detailLinkedTitle}>{selectedTodo.linkedTitle}</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Unterpunkte</Text>
          {sortedItems.length === 0 ? (
            <View style={styles.emptyItemsBox}>
              <Ionicons name="list-outline" size={28} color="#C7C7CC" />
              <Text style={styles.emptySmallText}>Noch keine Unterpunkte.</Text>
            </View>
          ) : (
            sortedItems.map((item) => (
              <TouchableOpacity key={item.id} style={styles.itemRow} activeOpacity={0.75} onPress={() => handleToggleTodoItem(selectedTodo, item.id)}>
                <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={25} color={item.done ? '#34C759' : '#C7C7CC'} />
                <Text style={[styles.itemText, item.done && styles.itemTextDone]}>{item.title}</Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <View style={styles.sheetFooter}>
          {isArchived ? (
            <TouchableOpacity style={styles.primaryButton} onPress={() => handleRestoreTodo(selectedTodo)}>
              <Text style={styles.primaryButtonText}>Aus Archiv zurückholen</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={() => handleArchiveTodo(selectedTodo)}>
              <Ionicons name="archive-outline" size={18} color="#FFF" />
              <Text style={styles.primaryButtonText}>To-Do abschließen & archivieren</Text>
            </TouchableOpacity>
          )}
        </View>
      </BottomSheet>
    );
  };

  const renderEditorSheet = () => {
    const isEditing = Boolean(editingTodo?.id);
    const linkChoices = linkedOptions.filter((option) => option.type === linkedType);

    return (
      <BottomSheet visible={isEditorVisible} onClose={closeEditor} windowHeight={windowHeight} maxHeightRatio={0.9} keyboardAvoid>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{isEditing ? 'To-Do bearbeiten' : 'Neues To-Do'}</Text>
          <TouchableOpacity
            style={[styles.sheetHeaderAction, isSavingTodo && styles.sheetHeaderActionDisabled]}
            onPress={handleSaveTodo}
            disabled={isSavingTodo}
          >
            <Text style={[styles.sheetHeaderActionText, isSavingTodo && styles.sheetHeaderActionTextDisabled]}>
              {isSavingTodo ? 'Speichert...' : 'Speichern'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollContent} showsVerticalScrollIndicator={false}>
          <TextInput style={styles.input} placeholder="To-Do-Überschrift, z.B. Einkaufen" value={formTitle} onChangeText={setFormTitle} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Beschreibung optional" multiline value={formDesc} onChangeText={setFormDesc} />

          <Text style={styles.sectionLabel}>Sichtbarkeit</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity style={[styles.segmentChip, formVisibility === PRIVACY_PRIVATE && styles.segmentChipActive]} onPress={() => setFormVisibility(PRIVACY_PRIVATE)}>
              <Ionicons name="lock-closed" size={16} color={formVisibility === PRIVACY_PRIVATE ? '#FFF' : '#007AFF'} />
              <Text style={[styles.segmentText, formVisibility === PRIVACY_PRIVATE && styles.segmentTextActive]}>Privat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentChip, formVisibility === PRIVACY_SHARED && styles.segmentChipActiveGreen]} onPress={() => setFormVisibility(PRIVACY_SHARED)}>
              <Ionicons name="people" size={16} color={formVisibility === PRIVACY_SHARED ? '#FFF' : '#34C759'} />
              <Text style={[styles.segmentText, formVisibility === PRIVACY_SHARED && styles.segmentTextActive]}>Öffentlich</Text>
            </TouchableOpacity>
          </View>

          {formVisibility === PRIVACY_SHARED && (
            <View style={styles.memberSelectBox}>
              <View style={styles.memberSelectHeader}>
                <Text style={styles.memberSelectTitle}>Mitglieder auswählen</Text>
                <View style={styles.memberActionsRow}>
                  <TouchableOpacity onPress={selectAllMembers}><Text style={styles.smallLink}>Alle auswählen</Text></TouchableOpacity>
                  <TouchableOpacity onPress={clearOtherMembers}><Text style={styles.smallLinkMuted}>Nur ich</Text></TouchableOpacity>
                </View>
              </View>
              {members.map((member) => {
                const selected = formMemberIds.includes(member.id);
                const locked = member.id === currentUser.id;
                return (
                  <TouchableOpacity key={member.id} style={styles.memberChoiceRow} onPress={() => toggleMember(member.id)} activeOpacity={locked ? 1 : 0.7}>
                    {renderMemberAvatar(member)}
                    <Text style={styles.memberChoiceName}>{member.name}{locked ? ' (Du)' : ''}</Text>
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? '#34C759' : '#C7C7CC'} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionLabel}>Verknüpfung</Text>
          <View style={styles.segmentRow}>
            <TouchableOpacity style={[styles.linkTypeChip, linkedType === 'none' && styles.linkTypeChipActive]} onPress={() => { setLinkedType('none'); setLinkedItemId(''); }}>
              <Text style={[styles.linkTypeText, linkedType === 'none' && styles.linkTypeTextActive]}>Keine</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.linkTypeChip, linkedType === 'calendar' && styles.linkTypeChipActive]} onPress={() => { setLinkedType('calendar'); setLinkedItemId(''); }}>
              <Text style={[styles.linkTypeText, linkedType === 'calendar' && styles.linkTypeTextActive]}>Kalender</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.linkTypeChip, linkedType === 'task' && styles.linkTypeChipActive]} onPress={() => { setLinkedType('task'); setLinkedItemId(''); }}>
              <Text style={[styles.linkTypeText, linkedType === 'task' && styles.linkTypeTextActive]}>Aufgabe</Text>
            </TouchableOpacity>
          </View>

          {linkedType !== 'none' && (
            <ScrollView style={styles.linkOptionsBox} nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {linkChoices.length === 0 ? (
                <Text style={styles.emptySmallText}>Keine passenden Einträge vorhanden.</Text>
              ) : (
                linkChoices.map((option) => {
                  const selected = linkedItemId === option.id;
                  return (
                    <TouchableOpacity key={`${option.type}-${option.id}`} style={[styles.linkOptionRow, selected && styles.linkOptionRowSelected]} onPress={() => setLinkedItemId(option.id)}>
                      <Ionicons name={option.type === 'calendar' ? 'calendar-outline' : 'checkbox-outline'} size={18} color={selected ? '#007AFF' : '#8E8E93'} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.linkOptionTitle}>{option.title}</Text>
                        {option.subtitle ? <Text style={styles.linkOptionSub}>{option.subtitle}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          )}

          {selectedLinkedOption ? <Text style={styles.selectedLinkInfo}>Ausgewählt: {selectedLinkedOption.title}</Text> : null}

          <Text style={styles.sectionLabel}>Unterpunkte</Text>
          {sortTodoItems(formItems).map((item) => (
            <View key={item.id} style={styles.editItemRow}>
              <TouchableOpacity onPress={() => toggleFormItemDone(item.id)}>
                <Ionicons name={item.done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={item.done ? '#34C759' : '#C7C7CC'} />
              </TouchableOpacity>
              <TextInput style={[styles.editItemInput, item.done && styles.itemTextDone]} value={item.title} onChangeText={(value) => updateFormItemTitle(item.id, value)} placeholder="Unterpunkt" />
              <TouchableOpacity onPress={() => removeFormItem(item.id)}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.addItemRow}>
            <TextInput style={styles.addItemInput} placeholder="Neuer Unterpunkt" value={newItemTitle} onChangeText={setNewItemTitle} onSubmitEditing={addFormItem} />
            <TouchableOpacity style={styles.addItemButton} onPress={addFormItem}>
              <Ionicons name="add" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>

          {isEditing ? (
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteTodo(editingTodo)}>
              <Text style={styles.deleteButtonText}>To-Do löschen</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </BottomSheet>
    );
  };

  const renderAiSheet = () => {
    return (
      <BottomSheet visible={isAiVisible} onClose={() => setIsAiVisible(false)} windowHeight={windowHeight} maxHeightRatio={0.9}>
        <View style={styles.assistantHeader}>
          <View style={styles.assistantIconBubble}>
            <Ionicons name="sparkles" size={22} color="#AF52DE" />
          </View>

          <View style={styles.assistantHeaderText}>
            <Text style={styles.assistantTitle} numberOfLines={2}>Smart-Vorschläge</Text>
            <Text style={styles.assistantSubtitle} numberOfLines={2}>Regelbasiert aus Kalender, Aufgaben und Geburtstagen</Text>
          </View>

          <TouchableOpacity
            style={styles.assistantCloseButton}
            onPress={() => setIsAiVisible(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color="#1C1C1E" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.assistantScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.aiInfoBoxCompact}>
            <Text style={styles.aiInfoTitle}>Hinweis</Text>
            <Text style={styles.aiInfoTextCompact}>
              Das ist aktuell noch keine echte generative KI. Die App erkennt Muster wie Geburtstag, Party, Einkauf oder Putzen und erstellt daraus vorbereitete To-Do-Vorschläge. Du kannst jeden Vorschlag vor dem Speichern bearbeiten.
            </Text>
          </View>

          {aiSuggestions.length === 0 ? (
            <View style={styles.emptyItemsBox}>
              <Ionicons name="sparkles-outline" size={30} color="#C7C7CC" />
              <Text style={styles.emptySmallText}>Gerade wurden keine passenden Vorschläge gefunden.</Text>
            </View>
          ) : (
            aiSuggestions.map((suggestion) => (
              <View key={suggestion.id} style={styles.suggestionCard}>
                <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
                <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                <View style={styles.suggestionItemsWrap}>
                  {suggestion.items.slice(0, 4).map((item) => (
                    <Text key={item} style={styles.suggestionItem}>• {item}</Text>
                  ))}
                </View>
                <TouchableOpacity style={styles.useSuggestionButton} onPress={() => handleUseSuggestion(suggestion)}>
                  <Text style={styles.useSuggestionButtonText}>Übernehmen & bearbeiten</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </BottomSheet>
    );
  };

  if (!currentWg?.id) {
    return (
      <View style={styles.emptyFullPage}>
        <Ionicons name="people-outline" size={46} color="#C7C7CC" />
        <Text style={styles.emptyTitle}>Keine WG verbunden</Text>
        <Text style={styles.emptyText}>To-Dos können erstellt werden, sobald du in einer WG bist.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topActionRow}>
          <TouchableOpacity style={styles.aiButton} onPress={() => setIsAiVisible(true)}>
            <Ionicons name="sparkles" size={18} color="#FFF" />
            <Text style={styles.aiButtonText}>Smart-Vorschläge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived((current) => !current)}>
            <Ionicons name={showArchived ? 'file-tray-full' : 'archive-outline'} size={18} color="#1C1C1E" />
            <Text style={styles.archiveToggleText}>{showArchived ? 'Aktive anzeigen' : 'Archiv'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.listHeading}>{showArchived ? 'Archivierte To-Dos' : 'Aktive To-Dos'} ({visibleTodos.length})</Text>

        {visibleTodos.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Ionicons name={showArchived ? 'archive-outline' : 'list-circle-outline'} size={42} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>{showArchived ? 'Noch nichts archiviert' : 'Noch keine To-Dos'}</Text>
            <Text style={styles.emptyText}>{showArchived ? 'Abgeschlossene To-Dos landen später hier.' : 'Tippe unten rechts auf + oder nutze die Smart-Vorschläge.'}</Text>
          </View>
        ) : (
          visibleTodos.map(renderTodoCard)
        )}
      </ScrollView>

      <TouchableOpacity style={styles.floatingAddButton} onPress={() => openCreateEditor()} activeOpacity={0.85}>
        <Ionicons name="add" size={34} color="#FFF" />
      </TouchableOpacity>

      {renderDetailSheet()}
      {renderEditorSheet()}
      {renderAiSheet()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
  topActionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  aiButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#AF52DE', paddingVertical: 13, borderRadius: 18, marginRight: 10 },
  aiButtonText: { color: '#FFF', fontSize: 15, fontWeight: '800', marginLeft: 7 },
  archiveToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18 },
  archiveToggleText: { color: '#1C1C1E', fontSize: 14, fontWeight: '700', marginLeft: 6 },
  listHeading: { fontSize: 13, color: '#8E8E93', textTransform: 'uppercase', fontWeight: '800', marginBottom: 10, marginLeft: 4 },
  todoCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, marginBottom: 14, borderWidth: 0.5, borderColor: '#E5E5EA', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 2 },
  todoCardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  todoTitle: { fontSize: 21, fontWeight: '900', color: '#000' },
  todoDesc: { fontSize: 14, color: '#8E8E93', marginTop: 4 },
  privacyBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, marginLeft: 10 },
  privateBadge: { backgroundColor: '#EBF4FF' },
  sharedBadge: { backgroundColor: '#EBFCEF' },
  privacyBadgeText: { fontSize: 12, fontWeight: '800', marginLeft: 4 },
  todoMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  todoMetaText: { fontSize: 13, color: '#8E8E93', fontWeight: '600' },
  todoMetaDot: { fontSize: 13, color: '#C7C7CC', marginHorizontal: 7 },
  linkedPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#F2F2F7', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, marginTop: 12, maxWidth: '100%' },
  linkedPillText: { color: '#8E8E93', fontSize: 12, fontWeight: '700', marginLeft: 5, flexShrink: 1 },
  floatingAddButton: { position: 'absolute', right: 24, bottom: 28, width: 66, height: 66, borderRadius: 33, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 15, elevation: 8 },
  emptyStateCard: { alignItems: 'center', backgroundColor: '#F9F9FB', borderRadius: 24, padding: 28, marginTop: 8 },
  emptyFullPage: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, backgroundColor: '#FFF' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1C1C1E', marginTop: 10, textAlign: 'center' },
  emptyText: { fontSize: 14, color: '#8E8E93', marginTop: 6, textAlign: 'center', lineHeight: 20 },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.30)' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  keyboardSheetWrapper: { flex: 1, width: '100%', justifyContent: 'flex-end', zIndex: 2 },
  bottomSheet: { width: '100%', zIndex: 2, backgroundColor: '#F2F2F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 10, paddingBottom: Platform.OS === 'web' ? 24 : 34, overflow: 'hidden' },
  dragHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, backgroundColor: '#D1D1D6', marginBottom: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 14 },
  sheetTitle: { flex: 1, fontSize: 28, fontWeight: '900', color: '#000' },
  sheetSubTitle: { color: '#8E8E93', fontSize: 13, marginTop: 2, fontWeight: '600' },
  sheetHeaderAction: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 12 },
  sheetHeaderActionText: { color: '#007AFF', fontWeight: '800', fontSize: 16 },
  sheetHeaderActionDisabled: { opacity: 0.5 },
  sheetHeaderActionTextDisabled: { color: '#8E8E93' },
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { paddingHorizontal: 22, paddingBottom: 18 },
  sheetFooter: { paddingHorizontal: 22, paddingTop: 8 },
  detailDesc: { fontSize: 15, color: '#6E6E73', lineHeight: 22, marginBottom: 16 },
  detailLinkedBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EBF4FF', borderRadius: 16, padding: 14, marginBottom: 18 },
  detailLinkedLabel: { color: '#007AFF', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', marginBottom: 2, marginLeft: 10 },
  detailLinkedTitle: { color: '#1C1C1E', fontSize: 15, fontWeight: '700', marginLeft: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: '#8E8E93', textTransform: 'uppercase', marginTop: 14, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 16, marginBottom: 8, borderWidth: 0.5, borderColor: '#E5E5EA' },
  itemText: { flex: 1, fontSize: 16, color: '#1C1C1E', fontWeight: '600', marginLeft: 12 },
  itemTextDone: { color: '#8E8E93', textDecorationLine: 'line-through' },
  emptyItemsBox: { alignItems: 'center', justifyContent: 'center', padding: 26, backgroundColor: '#FFF', borderRadius: 18, borderWidth: 0.5, borderColor: '#E5E5EA' },
  emptySmallText: { color: '#8E8E93', textAlign: 'center', fontSize: 14, marginTop: 8, lineHeight: 20 },
  primaryButton: { backgroundColor: '#000', borderRadius: 18, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#FFF', fontSize: 16, fontWeight: '900', marginLeft: 8 },
  input: { backgroundColor: '#FFF', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#000', marginBottom: 10, borderWidth: 0.5, borderColor: '#E5E5EA' },
  textArea: { height: 78, textAlignVertical: 'top' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  segmentChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginRight: 9, marginBottom: 8, borderWidth: 0.5, borderColor: '#E5E5EA' },
  segmentChipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  segmentChipActiveGreen: { backgroundColor: '#34C759', borderColor: '#34C759' },
  segmentText: { color: '#1C1C1E', fontWeight: '800', marginLeft: 6 },
  segmentTextActive: { color: '#FFF' },
  memberSelectBox: { backgroundColor: '#FFF', borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#E5E5EA' },
  memberSelectHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  memberSelectTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: '#1C1C1E' },
  memberActionsRow: { flexDirection: 'row', alignItems: 'center' },
  smallLink: { color: '#007AFF', fontWeight: '800', marginLeft: 10, fontSize: 13 },
  smallLinkMuted: { color: '#8E8E93', fontWeight: '800', marginLeft: 10, fontSize: 13 },
  memberChoiceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 0.5, borderTopColor: '#F2F2F7' },
  memberAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
  memberAvatarText: { color: '#FFF', fontWeight: '900', fontSize: 12 },
  memberChoiceName: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  linkTypeChip: { backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8, marginBottom: 8, borderWidth: 0.5, borderColor: '#E5E5EA' },
  linkTypeChipActive: { backgroundColor: '#000', borderColor: '#000' },
  linkTypeText: { color: '#1C1C1E', fontWeight: '800' },
  linkTypeTextActive: { color: '#FFF' },
  linkOptionsBox: { backgroundColor: '#FFF', borderRadius: 18, padding: 10, borderWidth: 0.5, borderColor: '#E5E5EA', maxHeight: 240 },
  linkOptionRow: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 12 },
  linkOptionRowSelected: { backgroundColor: '#EBF4FF' },
  linkOptionTitle: { color: '#1C1C1E', fontWeight: '800', fontSize: 14, marginLeft: 10 },
  linkOptionSub: { color: '#8E8E93', fontSize: 12, marginLeft: 10, marginTop: 2 },
  selectedLinkInfo: { color: '#007AFF', fontSize: 13, fontWeight: '700', marginTop: 6, marginBottom: 6 },
  editItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 0.5, borderColor: '#E5E5EA' },
  editItemInput: { flex: 1, color: '#1C1C1E', fontSize: 15, fontWeight: '600', paddingVertical: 8, paddingHorizontal: 10 },
  addItemRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  addItemInput: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, marginRight: 8, borderWidth: 0.5, borderColor: '#E5E5EA' },
  addItemButton: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  deleteButton: { borderWidth: 1, borderColor: '#FF3B30', paddingVertical: 15, borderRadius: 16, alignItems: 'center', marginTop: 18, marginBottom: 4, backgroundColor: '#FFF' },
  deleteButtonText: { color: '#FF3B30', fontSize: 16, fontWeight: '900' },
  assistantHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingBottom: 14 },
  assistantIconBubble: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F6ECFF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  assistantHeaderText: { flex: 1, minWidth: 0 },
  assistantTitle: { color: '#000', fontSize: 25, fontWeight: '900', lineHeight: 29 },
  assistantSubtitle: { color: '#8E8E93', fontSize: 12, fontWeight: '700', marginTop: 2, lineHeight: 16 },
  assistantCloseButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  assistantScrollContent: { paddingHorizontal: 22, paddingBottom: 22 },
  aiInfoBoxCompact: { backgroundColor: '#F6ECFF', borderRadius: 18, padding: 14, marginBottom: 14 },
  aiInfoTitle: { color: '#6E3A8A', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  aiInfoTextCompact: { color: '#6E3A8A', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  suggestionCard: { backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 0.5, borderColor: '#E5E5EA' },
  suggestionReason: { color: '#AF52DE', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', marginBottom: 5 },
  suggestionTitle: { fontSize: 18, fontWeight: '900', color: '#000', marginBottom: 8 },
  suggestionItemsWrap: { marginBottom: 12 },
  suggestionItem: { color: '#6E6E73', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  useSuggestionButton: { backgroundColor: '#000', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  useSuggestionButtonText: { color: '#FFF', fontWeight: '900', fontSize: 15 },
});