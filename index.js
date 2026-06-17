bash

cat /home/claude/bot/index.js
Output

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ==============================
// НАСТРОЙКИ
// ==============================
const GREEN_API_ID = process.env.GREEN_API_ID || '7107653277';
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN || '435d75273cd143428922e58e659d6d7c0e402ebbe2824868a6';
const GREEN_API_URL = 'https://7107.api.greenapi.com';
const ALTEGIO_TOKEN = process.env.ALTEGIO_TOKEN || '7b4b285d0fac36db1bddf9e5df9a3d3d';
const ALTEGIO_COMPANY_ID = process.env.ALTEGIO_COMPANY_ID || '1352144';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '77010007002';
const MANAGER_PHONE = process.env.MANAGER_PHONE || '77773138270';

// Словарь склонений имён мастеров
const masterDative = {
  'Елена': 'Елене', 'Ольга': 'Ольге', 'Айгерим': 'Айгерим',
  'Ксения': 'Ксении', 'Айдана': 'Айдане', 'Валерий': 'Валерию',
  'Наталья': 'Наталье', 'Дана': 'Дане', 'Юлия': 'Юлии',
  'Татьяна': 'Татьяне', 'Инна': 'Инне', 'Ната': 'Нате'
};

// Хранилище отправленных напоминаний (в памяти)
const sentReminders = new Set();

// Хранилище ожидающих ответа клиентов
// { phone: { type: 'reminder', recordId, clientName, serviceName, dateStr } }
const pendingResponses = {};

// ==============================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==============================

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return 'Доброе утро';
  if (hour >= 11 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 22) return 'Добрый вечер';
  return 'Доброй ночи';
}

function getMasterFirstName(fullName) {
  if (!fullName) return 'мастера';
  const firstName = fullName.trim().split(' ')[0];
  return masterDative[firstName] || firstName;
}

function formatDateTime(dateStr) {
  const months = [
    'января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'
  ];
  const date = new Date(dateStr);
  const day = date.getDate();
  const month = months[date.getMonth()];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return {
    full: `${day} ${month} в ${hours}:${minutes}`,
    time: `${hours}:${minutes}`,
    date: `${day} ${month}`,
    hours: date.getHours()
  };
}

function formatPhone(phone) {
  if (!phone) return null;
  return phone.replace(/[\s\+\-\(\)]/g, '');
}

async function sendWhatsApp(phone, message) {
  try {
    const cleanPhone = formatPhone(phone);
    if (!cleanPhone) return;
    const chatId = `${cleanPhone}@c.us`;
    const url = `${GREEN_API_URL}/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
    await axios.post(url, { chatId, message });
    console.log(`✅ Отправлено на ${phone}`);
  } catch (error) {
    console.error(`❌ Ошибка отправки на ${phone}:`, error.response?.data || error.message);
  }
}

async function getRecordDetails(recordId) {
  try {
    const url = `https://api.alteg.io/api/v1/record/${ALTEGIO_COMPANY_ID}/${recordId}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${ALTEGIO_TOKEN}, User ${ALTEGIO_TOKEN}` }
    });
    return response.data?.data || null;
  } catch (error) {
    console.error('❌ Ошибка получения записи:', error.response?.data || error.message);
    return null;
  }
}

async function confirmRecord(recordId) {
  try {
    const url = `https://api.alteg.io/api/v1/record/${ALTEGIO_COMPANY_ID}/${recordId}`;
    await axios.put(url, { confirmed: 1 }, {
      headers: { 'Authorization': `Bearer ${ALTEGIO_TOKEN}, User ${ALTEGIO_TOKEN}` }
    });
    console.log(`✅ Запись ${recordId} подтверждена`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка подтверждения:', error.response?.data || error.message);
    return false;
  }
}

async function deleteRecord(recordId) {
  try {
    const url = `https://api.alteg.io/api/v1/record/${ALTEGIO_COMPANY_ID}/${recordId}`;
    await axios.delete(url, {
      headers: { 'Authorization': `Bearer ${ALTEGIO_TOKEN}, User ${ALTEGIO_TOKEN}` }
    });
    console.log(`✅ Запись ${recordId} удалена`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка удаления:', error.response?.data || error.message);
    return false;
  }
}

async function getTomorrowRecords() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    const url = `https://api.alteg.io/api/v1/records/${ALTEGIO_COMPANY_ID}?start_date=${dateStr}&end_date=${dateStr}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${ALTEGIO_TOKEN}, User ${ALTEGIO_TOKEN}` }
    });
    return response.data?.data || [];
  } catch (error) {
    console.error('❌ Ошибка получения записей:', error.response?.data || error.message);
    return [];
  }
}

// ==============================
// НАПОМИНАНИЯ — ПЛАНИРОВЩИК
// ==============================

async function sendReminders(block) {
  console.log(`🕐 Запуск рассылки напоминаний блок ${block}`);
  const records = await getTomorrowRecords();

  for (const record of records) {
    const client = record.clients?.[0];
    if (!client?.phone) continue;

    const phone = formatPhone(client.phone);
    const recordHour = new Date(record.datetime).getHours();

    // Блок 1: записи с 00:01 до 15:00
    // Блок 2: записи с 15:01 до 23:59
    if (block === 1 && recordHour >= 15) continue;
    if (block === 2 && recordHour < 15) continue;

    const key = `${record.id}_${block}`;
    if (sentReminders.has(key)) {
      console.log(`⏭ Уже отправлено: ${key}`);
      continue;
    }

    const clientName = client.name?.split(' ')[0] || 'Уважаемый клиент';
    const masterName = getMasterFirstName(record.staff?.name);
    const serviceName = record.services?.[0]?.title || 'процедуру';
    const formatted = formatDateTime(record.datetime);
    const greeting = getGreeting();

    const message = `${greeting}, ${clientName} 🌷\n\nНапоминаем, что завтра в ${formatted.time} Вы записаны к мастеру ${masterName} на ${serviceName}.\n\nПожалуйста, подтвердите Ваш визит:\n*1* — Подтверждаю ✅\n*2* — Хочу перенести 🔄\n*3* — Отменяю ❌\n\nС уважением, DNK Beauty 💕`;

    await sendWhatsApp(phone, message);
    sentReminders.add(key);

    // Сохраняем ожидание ответа
    pendingResponses[phone] = {
      type: 'reminder',
      recordId: record.id,
      clientName,
      serviceName,
      dateStr: `${formatted.date} в ${formatted.time}`
    };
  }
}

// Планировщик — проверяет время каждую минуту
function startScheduler() {
  setInterval(async () => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h === 13 && m === 0) await sendReminders(1);
    if (h === 14 && m === 0) await sendReminders(1); // проверка
    if (h === 15 && m === 0) await sendReminders(2);
    if (h === 16 && m === 0) await sendReminders(2); // проверка
  }, 60000);

  console.log('⏰ Планировщик напоминаний запущен');
}

// ==============================
// ВЕБХУК ОТ ALTEGIO
// ==============================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  const data = req.body;

  // Игнорируем всё кроме записей
  if (data.resource !== 'record') {
    console.log(`⏭ Игнорируем: ${data.resource}`);
    return;
  }

  console.log('📩 Вебхук запись:', data.status);
  const record = data.data;
  if (!record) return;

  const client = record.clients?.[0] || {};
  const clientName = (client.name || '').split(' ')[0] || 'Уважаемый клиент';
  const phone = client.phone;
  if (!phone) { console.log('⚠️ Нет телефона'); return; }

  const masterName = getMasterFirstName(record.staff?.name);
  const serviceName = record.services?.[0]?.title || 'процедуру';
  const dateStr = record.datetime || record.date;
  const formatted = dateStr ? formatDateTime(dateStr) : { full: 'указанное время' };
  const greeting = getGreeting();

  let message = '';

  if (data.status === 'create') {
    message = `${greeting}, ${clientName} 🌷\n\n*${formatted.full} Вы записаны к мастеру ${masterName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (data.status === 'update') {
    message = `${greeting}, ${clientName} 🌷\nВаша запись изменена.\n\nНовые детали записи:\n*${formatted.full} Вы записаны к мастеру ${masterName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (data.status === 'delete') {
    message = `${greeting}, ${clientName} 🌷\n\nВаша запись на ${formatted.full} на ${serviceName} *снята*\n\nБудем вас ждать в другой день ☺️\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else {
    console.log(`⚠️ Неизвестный статус: ${data.status}`);
    return;
  }

  await sendWhatsApp(phone, message);
});

// ==============================
// ВЕБХУК ОТ GREEN API (ответы клиентов)
// ==============================
app.post('/incoming', async (req, res) => {
  res.sendStatus(200);
  const data = req.body;

  const phone = data.senderData?.sender?.replace('@c.us', '');
  const text = data.messageData?.textMessageData?.textMessage?.trim();

  if (!phone || !text) return;
  console.log(`📱 Ответ от ${phone}: ${text}`);

  // Проверяем ожидает ли этот номер ответа
  const pending = pendingResponses[phone];

  if (pending && pending.type === 'reminder') {
    if (text === '1') {
      // Подтверждение
      await confirmRecord(pending.recordId);
      await sendWhatsApp(phone, `Благодарим Вас за подтверждение записи! До встречи завтра 💕\nС уважением, DNK Beauty`);
      delete pendingResponses[phone];

    } else if (text === '2') {
      // Перенос
      await sendWhatsApp(phone, `Пожалуйста, укажите удобную для Вас дату и время для переноса записи 🌷`);
      await sendWhatsApp(ADMIN_PHONE, `⚠️ Клиент ${pending.clientName} (${phone}) запросил перенос записи на ${pending.dateStr} на ${pending.serviceName}. Ожидает вашего ответа.`);
      delete pendingResponses[phone];

    } else if (text === '3') {
      // Отмена
      await deleteRecord(pending.recordId);
      await sendWhatsApp(phone, `Ваша запись снята. Будем ждать Вас в DNK Beauty в другой раз ☺️\nС уважением, DNK Beauty`);
      await sendWhatsApp(MANAGER_PHONE, `⚠️ Клиент ${pending.clientName} (${phone}) отменил запись на ${pending.dateStr} на ${pending.serviceName}`);
      delete pendingResponses[phone];
    }
    return;
  }

  // Приветственное меню — если клиент написал первым
  const greetings = ['привет', 'здравствуйте', 'добрый', 'hello', 'hi', 'хай', 'салам'];
  const isGreeting = greetings.some(g => text.toLowerCase().includes(g));

  if (isGreeting || text === '0') {
    const greeting = getGreeting();
    const menu = `${greeting}! 🌷 Добро пожаловать в DNK Beauty!\n\nЯ бот-помощник салона. Выберите нужный пункт:\n\n*1* — График работы 🕐\n*2* — Наши услуги и цены 💅\n*3* — Записаться онлайн 📅\n*4* — Связаться с администратором 👩‍💼`;
    await sendWhatsApp(phone, menu);
    pendingResponses[phone] = { type: 'menu' };
    return;
  }

  // Ответы на меню
  if (pendingResponses[phone]?.type === 'menu') {
    if (text === '1') {
      await sendWhatsApp(phone, `🕐 *График работы DNK Beauty:*\n\nПонедельник — Воскресенье\n09:00 — 20:00\n\nМы работаем без выходных! 💕\n\nДля возврата в меню напишите *0*`);
      delete pendingResponses[phone];

    } else if (text === '2') {
      await sendWhatsApp(phone, `💅 *Наши услуги:*\n\n✨ Окрашивание волос\n✂️ Стрижка\n💇 Укладка\n💅 Маникюр\n🦶 Педикюр\n\nПрайслист скоро будет добавлен.\nДля записи напишите *3*\n\nДля возврата в меню напишите *0*`);
      delete pendingResponses[phone];

    } else if (text === '3') {
      await sendWhatsApp(phone, `📅 *Онлайн-запись:*\n\nСсылки на запись скоро будут добавлены.\n\nДля связи с администратором напишите *4*\n\nДля возврата в меню напишите *0*`);
      delete pendingResponses[phone];

    } else if (text === '4') {
      await sendWhatsApp(phone, `👩‍💼 Сейчас к Вам подключится администратор. Пожалуйста, подождите 🌷`);
      await sendWhatsApp(ADMIN_PHONE, `⚠️ Клиент (${phone}) ожидает помощи администратора в WhatsApp`);
      delete pendingResponses[phone];
    }
    return;
  }
});

// Проверка работы
app.get('/', (req, res) => {
  res.send('DNK Beauty Bot работает ✅');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 DNK Beauty Bot запущен на порту ${PORT}`);
  startScheduler();
});
