import { app } from '../firebaseConfig';
import { formatDateDisplay, formatTimeRange, getItemEnd, getItemStart, parseGermanBirthdayDate } from './calendarHelpers';

const MAX_CONTEXT_ITEMS = 10;
const MAX_SUGGESTIONS = 3;
const MAX_EVENT_DAYS = 30;
const MAX_TASK_DAYS = 21;
const MAX_BIRTHDAY_DAYS = 30;

let cachedFirebaseAiModule = null;

const ensureAbortSignalHelpers = () => {
  const AbortSignalClass = globalThis.AbortSignal;
  const AbortControllerClass = globalThis.AbortController;

  if (!AbortSignalClass || !AbortControllerClass) return;

  if (typeof AbortSignalClass.timeout !== 'function') {
    AbortSignalClass.timeout = function timeout(milliseconds) {
      const controller = new AbortControllerClass();
      const delay = Math.max(0, Number(milliseconds) || 0);
      const timer = setTimeout(() => {
        const timeoutError = new Error('The operation timed out.');
        timeoutError.name = 'TimeoutError';
        try {
          controller.abort(timeoutError);
        } catch (error) {
          controller.abort();
        }
      }, delay);

      if (typeof controller.signal?.addEventListener === 'function') {
        controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
      }

      return controller.signal;
    };
  }

  if (typeof AbortSignalClass.any !== 'function') {
    AbortSignalClass.any = function any(signals) {
      const controller = new AbortControllerClass();
      const signalList = Array.from(signals || []).filter(Boolean);
      const listeners = [];

      const cleanup = () => {
        listeners.forEach(([signal, handler]) => {
          if (typeof signal.removeEventListener === 'function') {
            signal.removeEventListener('abort', handler);
          }
        });
        listeners.length = 0;
      };

      const abortFromSignal = (signal) => {
        if (controller.signal.aborted) return;
        const reason = signal?.reason || new Error('The operation was aborted.');
        try {
          controller.abort(reason);
        } catch (error) {
          controller.abort();
        }
        cleanup();
      };

      for (const signal of signalList) {
        if (signal.aborted) {
          abortFromSignal(signal);
          return controller.signal;
        }
      }

      signalList.forEach((signal) => {
        if (typeof signal.addEventListener !== 'function') return;
        const handler = () => abortFromSignal(signal);
        signal.addEventListener('abort', handler, { once: true });
        listeners.push([signal, handler]);
      });

      return controller.signal;
    };
  }
};

const getFirebaseAiModule = () => {
  ensureAbortSignalHelpers();
  if (!cachedFirebaseAiModule) {
    // Wichtig: require erst nach dem Polyfill ausführen.
    // React Native stellt AbortSignal.any aktuell nicht überall bereit.
    cachedFirebaseAiModule = require('firebase/ai');
  }
  return cachedFirebaseAiModule;
};

const cleanText = (value, fallback = '') => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
};

const getRelativeDateText = (item) => {
  const start = getItemStart(item);
  if (!start || Number.isNaN(start.getTime())) return '';
  const timeText = formatTimeRange(start, getItemEnd(item));
  return timeText ? `${formatDateDisplay(start)}, ${timeText}` : formatDateDisplay(start);
};

const startOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDaysUntil = (dateValue, now = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (!date || Number.isNaN(date.getTime())) return null;
  const diff = startOfDay(date).getTime() - startOfDay(now).getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
};

const isUpcomingWithinDays = (item, maxDays, now = new Date()) => {
  const start = getItemStart(item);
  const days = getDaysUntil(start, now);
  return days !== null && days >= 0 && days <= maxDays;
};

const getUpcomingBirthdayText = (birthday, maxDays = MAX_BIRTHDAY_DAYS, now = new Date()) => {
  if (!birthday) return '';

  let birthdayDate = parseGermanBirthdayDate(birthday, now.getFullYear());
  if (!birthdayDate) return '';

  if (getDaysUntil(birthdayDate, now) < 0) {
    birthdayDate = parseGermanBirthdayDate(birthday, now.getFullYear() + 1);
  }

  const days = getDaysUntil(birthdayDate, now);
  if (days === null || days < 0 || days > maxDays) return '';

  const dateText = `${String(birthdayDate.getDate()).padStart(2, '0')}.${String(birthdayDate.getMonth() + 1).padStart(2, '0')}.`;
  return days === 0 ? `${dateText} (heute)` : `${dateText} (in ${days} Tag${days === 1 ? '' : 'en'})`;
};

const simplifyMember = (member, now = new Date()) => ({
  id: member.id,
  name: member.name || 'WG-Mitglied',
  upcomingBirthday: getUpcomingBirthdayText(member.birthday, MAX_BIRTHDAY_DAYS, now),
});

const simplifyCalendarEvent = (event) => ({
  id: event.id,
  title: event.title || 'Kalendertermin',
  desc: event.desc || '',
  date: getRelativeDateText(event),
  source: event.source || 'calendar_event',
});

const simplifyTask = (task) => ({
  id: task.id,
  title: task.title || 'Aufgabe',
  desc: task.desc || '',
  date: getRelativeDateText(task),
  assignedTo: task.userName || '',
  source: task.source || 'task',
});

const buildSuggestionSchema = (Schema) => Schema.object({
  properties: {
    suggestions: Schema.array({
      maxItems: MAX_SUGGESTIONS,
      items: Schema.object({
        properties: {
          title: Schema.string(),
          desc: Schema.string(),
          reason: Schema.string(),
          suggestedVisibility: Schema.string(),
          linkedType: Schema.string(),
          linkedItemId: Schema.string(),
          items: Schema.array({
            items: Schema.string(),
            maxItems: 4,
          }),
        },
      }),
    }),
  },
});

const buildPrompt = ({ currentUser, currentWg, calendarEvents, tasks, members, existingTodos }) => {
  const now = new Date();
  const upcomingCalendarEvents = (calendarEvents || [])
    .filter((event) => isUpcomingWithinDays(event, MAX_EVENT_DAYS, now))
    .slice(0, MAX_CONTEXT_ITEMS);

  const upcomingTasks = (tasks || [])
    .filter((task) => !task.archived && isUpcomingWithinDays(task, MAX_TASK_DAYS, now))
    .slice(0, MAX_CONTEXT_ITEMS);

  const relevantMembers = (members || [])
    .map((member) => simplifyMember(member, now))
    .filter((member) => member.name || member.upcomingBirthday)
    .slice(0, MAX_CONTEXT_ITEMS);

  const context = {
    app: 'WG-OS',
    language: 'German',
    currentDate: now.toISOString(),
    planningWindow: {
      calendarEvents: `nur die nächsten ${MAX_EVENT_DAYS} Tage`,
      tasks: `nur die nächsten ${MAX_TASK_DAYS} Tage`,
      birthdays: `nur Geburtstage in den nächsten ${MAX_BIRTHDAY_DAYS} Tagen`,
    },
    currentUser: {
      id: currentUser?.id || '',
      name: currentUser?.name || 'User',
    },
    wg: {
      id: currentWg?.id || '',
      name: currentWg?.name || 'WG',
    },
    members: relevantMembers,
    calendarEvents: upcomingCalendarEvents.map(simplifyCalendarEvent),
    tasks: upcomingTasks.map(simplifyTask),
    existingTodos: (existingTodos || [])
      .filter((todo) => !todo.archived)
      .slice(0, MAX_CONTEXT_ITEMS)
      .map((todo) => ({
        title: todo.title || '',
        visibility: todo.visibility || '',
      })),
  };

  return `
Du bist ein hilfreicher deutschsprachiger WG-Assistent in einer WG-App.

Ziel:
Erstelle bis zu ${MAX_SUGGESTIONS} konkrete, alltagstaugliche To-Do-Vorschläge für diese WG.
Jeder Vorschlag soll direkt als To-Do gespeichert werden können.

Sehr wichtig:
- Nutze nur konkrete nahe Anlässe aus dem Kontext: Kalendertermin, baldiger Geburtstag, anstehende Aufgabe, Einkauf, Putzen, Besuch, Party, Vorbereitung, Organisation.
- Ignoriere weit entfernte Geburtstage und Termine außerhalb des Planungsfensters.
- Erfinde keine Meta-Aufgaben über die App selbst, kein "Feedback zur WG-App", kein "Aufgaben-Chaos besprechen".
- Verwende keine technischen Begriffe wie "blocking events", "source", "algorithmisch", "Datenlage" oder "Kontext" im sichtbaren Text.
- Schreibe natürlich und knapp, so wie eine WG-Mitbewohnerin es formulieren würde.
- Der reason-Text soll maximal ein kurzer Satz sein, ohne Doppelpunkt, ohne technische Wörter.
- title maximal 55 Zeichen.
- items genau 3 bis 4 kurze, konkrete Unterpunkte.
- Erstelle keine doppelten Vorschläge zu existingTodos.
- suggestedVisibility muss entweder "private" oder "shared" sein.
- Für WG-relevante Dinge wie Party, Einkauf, Putzen oder Geburtstag nutze meist "shared".
- linkedType muss "calendar", "task" oder "none" sein.
- linkedItemId muss exakt die id eines passenden Kalendertermins oder einer Aufgabe sein, sonst leer lassen.
- Wenn es keinen klaren Anlass gibt, gib lieber weniger Vorschläge zurück.
- Gib ausschließlich Daten im vorgegebenen JSON-Schema zurück.

Gute Beispiele für reason:
- "Der Termin steht bald an."
- "Das passt gut zur nächsten Aufgabe."
- "Der Geburtstag ist bald."
- "Das hilft bei der Vorbereitung."

Kontext:
${JSON.stringify(context, null, 2)}
`;
};

const findLinkedOption = ({ linkedType, linkedItemId, calendarEvents, tasks }) => {
  if (!linkedType || linkedType === 'none' || !linkedItemId) return null;
  const list = linkedType === 'calendar' ? calendarEvents : tasks;
  return (list || []).find((item) => item.id === linkedItemId) || null;
};

const normalizeSuggestion = (suggestion, index, data) => {
  const linkedTypeRaw = cleanText(suggestion.linkedType, 'none').toLowerCase();
  const linkedType = ['calendar', 'task'].includes(linkedTypeRaw) ? linkedTypeRaw : 'none';
  const linkedItemId = cleanText(suggestion.linkedItemId);
  const linkedItem = findLinkedOption({
    linkedType,
    linkedItemId,
    calendarEvents: data.calendarEvents,
    tasks: data.tasks,
  });

  const items = Array.isArray(suggestion.items)
    ? suggestion.items.map((item) => cleanText(item)).filter(Boolean).slice(0, 4)
    : [];

  const title = cleanText(suggestion.title).slice(0, 55);
  if (!title || items.length === 0) return null;

  return {
    id: `gemini_${Date.now()}_${index}`,
    title,
    desc: cleanText(suggestion.desc, 'Vorschlag aus eurem WG-Alltag.').slice(0, 140),
    reason: cleanText(suggestion.reason, 'Das könnte euch diese Woche helfen.').slice(0, 90),
    suggestedVisibility: cleanText(suggestion.suggestedVisibility).toLowerCase() === 'shared' ? 'shared' : 'private',
    linkedType: linkedItem ? linkedType : 'none',
    linkedItemId: linkedItem ? linkedItemId : '',
    linkedTitle: linkedItem ? linkedItem.title || '' : '',
    linkedSource: linkedItem ? linkedItem.source || '' : '',
    items,
  };
};


const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const getTextFromGeminiResponse = (result) => {
  try {
    const text = result?.response?.text?.();
    if (typeof text === 'string' && text.trim()) return text.trim();
  } catch (error) {
    // Wenn text() selbst fehlschlägt, versuchen wir die Kandidaten manuell auszulesen.
  }

  const candidateText = result?.response?.candidates
    ?.flatMap((candidate) => candidate?.content?.parts || [])
    ?.map((part) => part?.text || '')
    ?.join('\n')
    ?.trim();

  return candidateText || '';
};

const extractJsonObject = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return '';

  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  if (withoutFence.startsWith('{') && withoutFence.endsWith('}')) return withoutFence;

  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return withoutFence.slice(firstBrace, lastBrace + 1);
  }

  return withoutFence;
};

const summarizeGeminiResponse = (result) => {
  const candidates = result?.response?.candidates || [];
  const finishReasons = candidates.map((candidate) => candidate?.finishReason).filter(Boolean).join(', ');
  const blockReason = result?.response?.promptFeedback?.blockReason || '';
  const modelVersion = result?.response?.modelVersion || '';

  return [
    modelVersion ? `model=${modelVersion}` : '',
    finishReasons ? `finishReason=${finishReasons}` : '',
    blockReason ? `blockReason=${blockReason}` : '',
  ].filter(Boolean).join(' | ');
};

const parseGeminiSuggestions = (result, modelName) => {
  const responseText = getTextFromGeminiResponse(result);
  const jsonText = extractJsonObject(responseText);

  if (!jsonText) {
    const details = summarizeGeminiResponse(result);
    throw new Error(`Leere Gemini-Antwort von ${modelName}${details ? ` (${details})` : ''}`);
  }

  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  } catch (error) {
    console.warn('Gemini-Rohantwort konnte nicht als JSON gelesen werden:', responseText);
    throw new Error(`Gemini-Antwort war kein gueltiges JSON (${modelName}): ${error.message}`);
  }
};

const buildModel = ({ getGenerativeModel, ai, suggestionSchema, modelName }) => {
  return getGenerativeModel(ai, {
    model: modelName,
    systemInstruction:
      'Du bist ein deutschsprachiger WG-Assistent. Du erzeugst kurze, natürliche und konkrete To-Do-Vorschläge. Du vermeidest technische Begriffe und hältst dich strikt an das JSON-Schema.',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: suggestionSchema,
      temperature: 0.25,
      maxOutputTokens: 850,
    },
  });
};

export const generateTodoSuggestionsWithGemini = async ({
  currentUser,
  currentWg,
  calendarEvents = [],
  tasks = [],
  members = [],
  existingTodos = [],
}) => {
  if (!currentUser?.id || !currentWg?.id) return [];

  const { getAI, getGenerativeModel, GoogleAIBackend, Schema } = getFirebaseAiModule();
  const suggestionSchema = buildSuggestionSchema(Schema);
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const prompt = buildPrompt({ currentUser, currentWg, calendarEvents, tasks, members, existingTodos });

  let lastError = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      const model = buildModel({ getGenerativeModel, ai, suggestionSchema, modelName });
      const result = await model.generateContent(prompt);
      const rawSuggestions = parseGeminiSuggestions(result, modelName);

      const normalized = rawSuggestions
        .map((suggestion, index) => normalizeSuggestion(suggestion, index, { calendarEvents, tasks }))
        .filter(Boolean)
        .slice(0, MAX_SUGGESTIONS);

      return normalized;
    } catch (error) {
      lastError = error;
      console.warn(`Gemini-Modell ${modelName} konnte keine To-Do-Vorschlaege liefern:`, error);
    }
  }

  throw lastError || new Error('Gemini konnte keine To-Do-Vorschlaege liefern.');
};