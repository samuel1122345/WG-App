export const DEFAULT_TASK_START_TIME = '18:00';
export const DEFAULT_TASK_END_TIME = '19:00';

const pad2 = (value) => String(value).padStart(2, '0');

export const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const isValidTime = (time) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(time || '').trim());

export const normalizeTime = (time, fallback = DEFAULT_TASK_START_TIME) => {
  const raw = String(time || '').trim();
  if (!raw) return fallback;
  const match = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  if (hours < 0 || hours > 23) return fallback;
  return `${pad2(hours)}:${match[2]}`;
};

export const combineDateAndTime = (dateValue, timeValue = DEFAULT_TASK_START_TIME) => {
  const base = toDate(dateValue) || new Date();
  const time = normalizeTime(timeValue, DEFAULT_TASK_START_TIME);
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(base);
  result.setHours(hours, minutes, 0, 0);
  return result;
};

export const ensureEndAfterStart = (startDate, endDate) => {
  if (endDate > startDate) return endDate;
  const fallbackEnd = new Date(startDate);
  fallbackEnd.setHours(fallbackEnd.getHours() + 1);
  return fallbackEnd;
};

export const formatDateDisplay = (dateValue) => {
  const date = toDate(dateValue) || new Date();
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' });
};

export const formatDateInput = (dateValue) => {
  const date = toDate(dateValue) || new Date();
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
};

export const parseDateInput = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2}|\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

export const datesAreSameDay = (a, b) => {
  const dateA = toDate(a);
  const dateB = toDate(b);
  if (!dateA || !dateB) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
};

export const formatTime = (dateValue) => {
  const date = toDate(dateValue);
  if (!date) return '';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
};

export const formatTimeRange = (startValue, endValue) => {
  const start = toDate(startValue);
  const end = toDate(endValue);
  if (!start && !end) return '';
  if (start && !end) return formatTime(start);
  return `${formatTime(start)}-${formatTime(end)}`;
};

export const getItemStart = (item) => {
  if (!item) return null;
  return toDate(item.startAt || item.fullDate || item.date);
};

export const getItemEnd = (item) => {
  if (!item) return null;
  const explicitEnd = toDate(item.endAt);
  if (explicitEnd) return explicitEnd;
  const start = getItemStart(item);
  if (!start) return null;
  const fallbackEnd = new Date(start);
  fallbackEnd.setHours(fallbackEnd.getHours() + 1);
  return fallbackEnd;
};

export const intervalsOverlap = (startAValue, endAValue, startBValue, endBValue) => {
  const startA = toDate(startAValue);
  const endA = toDate(endAValue);
  const startB = toDate(startBValue);
  const endB = toDate(endBValue);
  if (!startA || !endA || !startB || !endB) return false;
  return startA < endB && startB < endA;
};

export const isUserBlocked = (userId, startValue, endValue, calendarEvents = []) => {
  return calendarEvents.some((event) => {
    if (!event || event.blocksAssignments === false) return false;

    const belongsToUser = event.userId === userId || event.memberIds?.includes?.(userId);
    if (!belongsToUser) return false;

    const eventStart = getItemStart(event);
    const eventEnd = getItemEnd(event);
    return intervalsOverlap(startValue, endValue, eventStart, eventEnd);
  });
};

export const parseGermanBirthdayDate = (birthday, year = new Date().getFullYear()) => {
  const raw = String(birthday || '').trim();
  const match = raw.match(/^(\d{1,2})[.\/\-](\d{1,2})(?:[.\/\-](\d{2}|\d{4}))?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  parsed.setHours(9, 0, 0, 0);
  return parsed;
};

export const buildBirthdayItems = (members = [], year = new Date().getFullYear()) => {
  return members
    .map((member) => {
      const birthdayDate = parseGermanBirthdayDate(member.birthday, year);
      if (!birthdayDate) return null;

      const endAt = new Date(birthdayDate);
      endAt.setHours(23, 59, 59, 999);

      return {
        id: `birthday-${member.id}-${year}`,
        title: `Geburtstag: ${member.name}`,
        desc: `${member.name} hat Geburtstag 🎂`,
        type: 'birthday',
        source: 'birthday',
        wgId: member.wgId,
        userId: member.id,
        userName: member.name,
        startAt: birthdayDate.toISOString(),
        endAt: endAt.toISOString(),
        blocksAssignments: false,
      };
    })
    .filter(Boolean);
};

export const looksLikeTaskTitle = (title) => {
  const value = String(title || '').trim().toLowerCase();
  if (!value) return false;
  if (value.startsWith('aufgabe:') || value.startsWith('todo:') || value.startsWith('to-do:')) return true;

  const taskKeywords = [
    'putzen',
    'reinigen',
    'müll',
    'muell',
    'einkaufen',
    'spülen',
    'spuelen',
    'abwasch',
    'saugen',
    'staubsaugen',
    'bad',
    'küche',
    'kueche',
    'dienst',
  ];

  return taskKeywords.some((keyword) => value.includes(keyword));
};
