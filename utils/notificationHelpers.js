import { addDoc, collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { formatDateDisplay, formatTimeRange, parseGermanBirthdayDate, toDate } from './calendarHelpers';

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;
const ASSIGNMENT_LOOKBACK_MS = ONE_DAY;

const pad2 = (value) => String(value).padStart(2, '0');

const sanitizeNotificationId = (value) => {
  return String(value || '')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 1400);
};

export const buildNotificationKey = (...parts) => sanitizeNotificationId(parts.filter(Boolean).join('_'));

const sameDay = (a, b) => {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export const getTaskStart = (task) => toDate(task?.startAt || task?.fullDate || task?.date);
export const getTaskEnd = (task) => {
  const explicitEnd = toDate(task?.endAt);
  if (explicitEnd) return explicitEnd;

  const start = getTaskStart(task);
  if (!start) return null;

  const fallbackEnd = new Date(start);
  fallbackEnd.setHours(fallbackEnd.getHours() + 1);
  return fallbackEnd;
};

export const buildTaskTimeText = (taskOrStart, maybeEnd) => {
  const start = taskOrStart instanceof Date ? taskOrStart : getTaskStart(taskOrStart);
  const end = maybeEnd instanceof Date ? maybeEnd : getTaskEnd(taskOrStart);
  if (!start) return '';

  const dateText = formatDateDisplay(start);
  const timeText = formatTimeRange(start, end);
  return timeText ? `${dateText}, ${timeText}` : dateText;
};

/**
 * Erstellt eine In-App-Mitteilung in der bestehenden notifications-Collection.
 *
 * Wichtig: Wir nutzen absichtlich addDoc(collection(...)) wie beim bestehenden
 * Tauschanfragen-Modul. Die vorherige Version nutzte setDoc(doc(...)) mit einer
 * festen Dokument-ID und hat davor getDoc ausgeführt. Je nach Firestore-Regeln
 * kann dieser Lesezugriff auf Benachrichtigungen anderer User blockiert werden,
 * obwohl addDoc für solche Mitteilungen erlaubt ist. Dadurch wurden Aufgaben-
 * Mitteilungen still nicht angelegt.
 */
export const createNotificationOnce = async ({
  notificationKey,
  wgId,
  userId,
  title,
  message,
  type,
  extraData = {},
  createdAt = new Date(),
}) => {
  if (!notificationKey || !wgId || !userId || !title || !message || !type) return false;

  const safeKey = sanitizeNotificationId(notificationKey);

  // Duplikate vermeiden, wenn Lesen nach notificationKey erlaubt ist.
  // Falls Firestore-Regeln diese Prüfung blockieren, erstellen wir trotzdem
  // die Mitteilung. Das ist gewollt, damit Aufgaben-Zuweisungen nicht verloren gehen.
  try {
    const existingQuery = query(
      collection(db, 'notifications'),
      where('notificationKey', '==', safeKey),
      where('userId', '==', userId),
      limit(1)
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) return false;
  } catch (lookupError) {
    console.warn('Konnte bestehende Mitteilung nicht prüfen, erstelle sie trotzdem:', lookupError);
  }

  await addDoc(collection(db, 'notifications'), {
    wgId,
    userId,
    title,
    message,
    type,
    status: 'unread',
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : new Date().toISOString(),
    notificationKey: safeKey,
    extraData,
  });

  return true;
};

const shouldNotifyRecentAssignment = (task, now) => {
  if (!task?.id) return false;
  if (task.source !== 'recurring_task' && !task.recurringTaskId) return false;

  const taskStart = getTaskStart(task);
  if (taskStart && taskStart.getTime() < now.getTime() - ONE_HOUR) return false;

  const createdAt = toDate(task.createdAt);
  if (!createdAt) return false;

  const age = now.getTime() - createdAt.getTime();
  return age >= -5 * ONE_MINUTE && age <= ASSIGNMENT_LOOKBACK_MS;
};

const createRecentAssignmentNotifications = async ({ currentUser, currentWg, tasks, now }) => {
  const myTasks = tasks.filter((task) => task.userId === currentUser.id && shouldNotifyRecentAssignment(task, now));

  for (const task of myTasks) {
    const timeText = buildTaskTimeText(task);
    await createNotificationOnce({
      notificationKey: buildNotificationKey('task_assigned', currentWg.id, currentUser.id, task.id),
      wgId: currentWg.id,
      userId: currentUser.id,
      title: 'Neue Aufgabe bekommen ✅',
      message: timeText
        ? `Dir wurde die Aufgabe "${task.title}" zugewiesen. Termin: ${timeText}.`
        : `Dir wurde die Aufgabe "${task.title}" zugewiesen.`,
      type: 'task_assigned',
      extraData: {
        taskId: task.id,
        taskTitle: task.title || '',
        startAt: getTaskStart(task)?.toISOString?.() || null,
        endAt: getTaskEnd(task)?.toISOString?.() || null,
      },
    });
  }
};

const createTaskDueSoonNotifications = async ({ currentUser, currentWg, tasks, now }) => {
  const myTasks = tasks.filter((task) => task.userId === currentUser.id);

  for (const task of myTasks) {
    const start = getTaskStart(task);
    if (!start) continue;

    const diff = start.getTime() - now.getTime();
    const isWithinReminderWindow = diff > 0 && diff <= ONE_HOUR;
    if (!isWithinReminderWindow) continue;

    const timeText = buildTaskTimeText(task);
    await createNotificationOnce({
      notificationKey: buildNotificationKey('task_due_soon', currentWg.id, currentUser.id, task.id),
      wgId: currentWg.id,
      userId: currentUser.id,
      title: 'Aufgabe steht bald an ⏰',
      message: timeText
        ? `In weniger als einer Stunde steht "${task.title}" an. Termin: ${timeText}.`
        : `In weniger als einer Stunde steht "${task.title}" an.`,
      type: 'task_due_soon',
      extraData: {
        taskId: task.id,
        taskTitle: task.title || '',
        startAt: start.toISOString(),
        endAt: getTaskEnd(task)?.toISOString?.() || null,
      },
    });
  }
};

const createBirthdayTomorrowNotifications = async ({ currentUser, currentWg, members, now }) => {
  if (now.getHours() < 10) return;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  const tomorrowKey = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;

  const birthdayMembers = members.filter((member) => {
    if (!member?.birthday || member.id === currentUser.id) return false;
    const birthdayDate = parseGermanBirthdayDate(member.birthday, tomorrow.getFullYear());
    return sameDay(birthdayDate, tomorrow);
  });

  for (const member of birthdayMembers) {
    await createNotificationOnce({
      notificationKey: buildNotificationKey('birthday_tomorrow', currentWg.id, currentUser.id, member.id, tomorrowKey),
      wgId: currentWg.id,
      userId: currentUser.id,
      title: 'Morgen ist Geburtstag 🎂',
      message: `${member.name || 'Ein WG-Mitglied'} hat morgen Geburtstag.`,
      type: 'birthday_tomorrow',
      extraData: {
        memberId: member.id,
        memberName: member.name || '',
        birthday: member.birthday || '',
        birthdayDate: tomorrowKey,
        reminderRule: 'day_before_after_10',
      },
    });
  }
};

export const syncAutomaticNotifications = async ({
  currentUser,
  currentWg,
  tasks = [],
  members = [],
  now = new Date(),
}) => {
  if (!currentUser?.id || !currentWg?.id) return;

  await createRecentAssignmentNotifications({ currentUser, currentWg, tasks, now });
  await createTaskDueSoonNotifications({ currentUser, currentWg, tasks, now });
  await createBirthdayTomorrowNotifications({ currentUser, currentWg, members, now });
};
