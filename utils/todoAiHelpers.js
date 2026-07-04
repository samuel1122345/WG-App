import { formatDateDisplay, getItemStart, parseGermanBirthdayDate, toDate } from './calendarHelpers';

const pad2 = (value) => String(value).padStart(2, '0');

export const createTodoItem = (title = '', done = false) => {
  const now = new Date().toISOString();
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: String(title || '').trim(),
    done: Boolean(done),
    createdAt: now,
    completedAt: done ? now : null,
  };
};

export const sortTodoItems = (items = []) => {
  return [...items].sort((a, b) => {
    if (Boolean(a.done) !== Boolean(b.done)) return a.done ? 1 : -1;
    return (a.order ?? 0) - (b.order ?? 0);
  });
};

export const visibleTodoForUser = (todo, userId) => {
  if (!todo || !userId) return false;
  if (todo.visibility === 'private') return todo.ownerId === userId;
  return todo.ownerId === userId || todo.memberIds?.includes?.(userId);
};

const stripTime = (date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const getDaysUntil = (targetDate, now = new Date()) => {
  const start = stripTime(now);
  const end = stripTime(targetDate);
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
};

const getBirthdayInCurrentCycle = (birthday, now = new Date()) => {
  const thisYear = now.getFullYear();
  let birthdayDate = parseGermanBirthdayDate(birthday, thisYear);
  if (!birthdayDate) return null;

  const today = stripTime(now);
  if (stripTime(birthdayDate).getTime() < today.getTime()) {
    birthdayDate = parseGermanBirthdayDate(birthday, thisYear + 1);
  }
  return birthdayDate;
};

const normalizeText = (value) => String(value || '').toLowerCase();

const includesAny = (value, keywords) => {
  const text = normalizeText(value);
  return keywords.some((keyword) => text.includes(keyword));
};

const dedupeSuggestions = (suggestions) => {
  const seen = new Set();
  return suggestions.filter((suggestion) => {
    const key = normalizeText(`${suggestion.title}_${suggestion.reason}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const makeBirthdaySuggestion = ({ member, birthdayDate, now }) => {
  const days = getDaysUntil(birthdayDate, now);
  const name = member.name || 'WG-Mitglied';
  const dateText = `${pad2(birthdayDate.getDate())}.${pad2(birthdayDate.getMonth() + 1)}.`;

  return {
    id: `ai_birthday_${member.id}_${birthdayDate.getFullYear()}`,
    title: `Geburtstag von ${name} vorbereiten`,
    desc: `KI-Vorschlag: ${name} hat am ${dateText} Geburtstag.`,
    reason: days === 0 ? `${name} hat heute Geburtstag.` : `${name} hat in ${days} Tag${days === 1 ? '' : 'en'} Geburtstag.`,
    suggestedVisibility: 'shared',
    linkedType: 'calendar',
    linkedItemId: `birthday-${member.id}-${birthdayDate.getFullYear()}`,
    linkedTitle: `Geburtstag: ${name}`,
    linkedSource: 'birthday',
    items: [
      'Geschenkidee sammeln',
      'Kuchen oder Snack planen',
      'Getränke einkaufen',
      'Kleine Überraschung mit der WG abstimmen',
      'Geburtstagskarte vorbereiten',
    ],
  };
};

const makeEventSuggestion = ({ event, start, now }) => {
  const title = event.title || 'Termin';
  const days = getDaysUntil(start, now);
  const timeText = formatDateDisplay(start);
  const lowerTitle = normalizeText(title);

  if (includesAny(lowerTitle, ['geburtstag', 'birthday'])) {
    return {
      id: `ai_event_birthday_${event.id}`,
      title: `${title} vorbereiten`,
      desc: `KI-Vorschlag aus deinem Kalendertermin am ${timeText}.`,
      reason: `Der Kalendertermin "${title}" steht ${days <= 0 ? 'sehr bald' : `in ${days} Tag${days === 1 ? '' : 'en'}`} an.`,
      suggestedVisibility: 'shared',
      linkedType: 'calendar',
      linkedItemId: event.id,
      linkedTitle: title,
      linkedSource: event.source || 'calendar_event',
      items: ['Geschenk/Überraschung klären', 'Einkaufsliste erstellen', 'Essen und Getränke planen', 'Mit WG-Mitgliedern abstimmen'],
    };
  }

  if (includesAny(lowerTitle, ['party', 'feier', 'wg-abend', 'abend', 'besuch', 'dinner', 'essen'])) {
    return {
      id: `ai_event_party_${event.id}`,
      title: `${title} organisieren`,
      desc: `KI-Vorschlag aus deinem Kalendertermin am ${timeText}.`,
      reason: `Der Kalendertermin "${title}" braucht wahrscheinlich Vorbereitung.`,
      suggestedVisibility: 'shared',
      linkedType: 'calendar',
      linkedItemId: event.id,
      linkedTitle: title,
      linkedSource: event.source || 'calendar_event',
      items: ['Essen planen', 'Getränke besorgen', 'Wohnzimmer/Küche vorbereiten', 'Gäste oder WG informieren', 'Aufräumen danach einplanen'],
    };
  }

  if (includesAny(lowerTitle, ['einkauf', 'einkaufen', 'supermarkt'])) {
    return {
      id: `ai_event_shopping_${event.id}`,
      title: `Einkauf für ${title}`,
      desc: `KI-Vorschlag aus deinem Kalendertermin am ${timeText}.`,
      reason: `Der Termin "${title}" sieht nach Einkauf aus.`,
      suggestedVisibility: 'shared',
      linkedType: 'calendar',
      linkedItemId: event.id,
      linkedTitle: title,
      linkedSource: event.source || 'calendar_event',
      items: ['Einkaufsliste sammeln', 'Budget klären', 'Einkauf erledigen', 'Einkäufe einräumen'],
    };
  }

  if (includesAny(lowerTitle, ['putzen', 'sauber', 'clean', 'aufräumen', 'aufräumen', 'bad', 'küche', 'kueche'])) {
    return {
      id: `ai_event_clean_${event.id}`,
      title: `Vorbereitung: ${title}`,
      desc: `KI-Vorschlag aus deinem Kalendertermin am ${timeText}.`,
      reason: `Der Termin "${title}" sieht nach Haushaltsaufgabe aus.`,
      suggestedVisibility: 'shared',
      linkedType: 'calendar',
      linkedItemId: event.id,
      linkedTitle: title,
      linkedSource: event.source || 'calendar_event',
      items: ['Putzmittel prüfen', 'Bereich freiräumen', 'Aufgabe erledigen', 'Müll entsorgen'],
    };
  }

  return null;
};

const makeTaskSuggestion = ({ task, start, now }) => {
  const title = task.title || 'Aufgabe';
  const days = getDaysUntil(start, now);
  const lowerTitle = normalizeText(title);

  if (includesAny(lowerTitle, ['einkauf', 'einkaufen', 'supermarkt'])) {
    return {
      id: `ai_task_shopping_${task.id}`,
      title: `Einkaufsliste für ${title}`,
      desc: 'KI-Vorschlag aus einer anstehenden Aufgabe.',
      reason: `Die Aufgabe "${title}" steht ${days <= 0 ? 'bald' : `in ${days} Tag${days === 1 ? '' : 'en'}`} an.`,
      suggestedVisibility: 'shared',
      linkedType: 'task',
      linkedItemId: task.id,
      linkedTitle: title,
      linkedSource: task.source || 'task',
      items: ['Bananen', 'Zwiebeln', 'Schlagsahne', 'Milch', 'Brot'],
    };
  }

  if (includesAny(lowerTitle, ['küche', 'kueche', 'putzen', 'bad', 'müll', 'muell', 'saugen', 'wischen'])) {
    return {
      id: `ai_task_clean_${task.id}`,
      title: `Vorbereitung: ${title}`,
      desc: 'KI-Vorschlag aus einer anstehenden Wochenaufgabe.',
      reason: `Die Aufgabe "${title}" kann in kleine Schritte aufgeteilt werden.`,
      suggestedVisibility: 'shared',
      linkedType: 'task',
      linkedItemId: task.id,
      linkedTitle: title,
      linkedSource: task.source || 'task',
      items: ['Benötigte Sachen bereitlegen', 'Flächen freiräumen', 'Hauptaufgabe erledigen', 'Kontrollieren und abhaken'],
    };
  }

  return null;
};

export const buildTodoSuggestions = ({
  currentUser,
  calendarEvents = [],
  tasks = [],
  members = [],
  now = new Date(),
}) => {
  const suggestions = [];
  const maxBirthdayDays = 14;
  const maxEventDays = 14;
  const maxTaskDays = 7;

  members.forEach((member) => {
    if (!member?.birthday) return;
    const birthdayDate = getBirthdayInCurrentCycle(member.birthday, now);
    if (!birthdayDate) return;
    const days = getDaysUntil(birthdayDate, now);
    if (days < 0 || days > maxBirthdayDays) return;
    suggestions.push(makeBirthdaySuggestion({ member, birthdayDate, now }));
  });

  calendarEvents.forEach((event) => {
    const start = getItemStart(event);
    if (!start) return;
    const days = getDaysUntil(start, now);
    if (days < 0 || days > maxEventDays) return;
    const suggestion = makeEventSuggestion({ event, start, now });
    if (suggestion) suggestions.push(suggestion);
  });

  tasks.forEach((task) => {
    const start = toDate(task?.startAt || task?.fullDate || task?.date);
    if (!start) return;
    const days = getDaysUntil(start, now);
    if (days < 0 || days > maxTaskDays) return;
    if (task.userId && currentUser?.id && task.userId !== currentUser.id) return;
    const suggestion = makeTaskSuggestion({ task, start, now });
    if (suggestion) suggestions.push(suggestion);
  });

  return dedupeSuggestions(suggestions).slice(0, 8);
};