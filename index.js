const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// ==============================
// НАСТРОЙКИ — ЗАПОЛНИТЕ СВОИМИ ДАННЫМИ
// ==============================
const GREEN_API_ID = process.env.GREEN_API_ID || '7107653277';
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN || '435d75273cd143428922e58e659d6d7c0e402ebbe2824868a6';
const GREEN_API_URL = `https://7107.api.greenapi.com`;
// ==============================

// Функция отправки сообщения в WhatsApp
async function sendWhatsApp(phone, message) {
  try {
    // Форматируем номер: убираем +, пробелы, скобки
    const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '');
    const chatId = `${cleanPhone}@c.us`;

    const url = `${GREEN_API_URL}/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
    await axios.post(url, {
      chatId: chatId,
      message: message
    });
    console.log(`✅ Сообщение отправлено на ${phone}`);
  } catch (error) {
    console.error(`❌ Ошибка отправки на ${phone}:`, error.response?.data || error.message);
  }
}

// Форматирование даты: "2024-07-23T15:00:00" → "23 июля в 15:00"
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
  return `${day} ${month} в ${hours}:${minutes}`;
}

// ==============================
// ВЕБХУК ОТ ALTEGIO
// ==============================
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Сразу отвечаем Altegio что получили

  const data = req.body;
  console.log('📩 Получен вебхук от Altegio:', JSON.stringify(data, null, 2));

  // Извлекаем данные из вебхука Altegio
  const event = data.event || data.resource_type;
  const record = data.data || data.object || data;

  // Имя клиента
  const clientName = record?.client?.name
    || record?.client_name
    || record?.customer?.name
    || 'Уважаемый клиент';

  // Телефон клиента
  const phone = record?.client?.phone
    || record?.client_phone
    || record?.customer?.phone;

  if (!phone) {
    console.log('⚠️ Телефон не найден в вебхуке');
    return;
  }

  // Имя мастера
  const masterName = record?.staff?.name
    || record?.master?.name
    || record?.staff_name
    || 'мастера';

  // Услуга
  const serviceName = record?.services?.[0]?.title
    || record?.service?.title
    || record?.service_name
    || 'процедуру';

  // Дата и время записи
  const dateTime = record?.date_time
    || record?.datetime
    || record?.start_datetime;

  const formattedDate = dateTime ? formatDateTime(dateTime) : 'указанное время';

  let message = '';

  // Определяем тип события
  const eventType = event || '';

  if (eventType.includes('create') || eventType.includes('booking_create') || eventType === 'record_created') {
    // СОЗДАНИЕ ЗАПИСИ
    message = `Добрый день, ${clientName} 🌷\n\n*${formattedDate} Вы записаны к ${masterName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (eventType.includes('update') || eventType.includes('change') || eventType === 'record_updated') {
    // ИЗМЕНЕНИЕ ЗАПИСИ
    message = `Добрый день, ${clientName} 🌷\nВаша запись изменена.\n\nНовые детали записи:\n*${formattedDate} Вы записаны к ${masterName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (eventType.includes('delete') || eventType.includes('cancel') || eventType === 'record_deleted') {
    // ОТМЕНА ЗАПИСИ
    message = `Добрый день, ${clientName} 🌷\n\nВаша запись на ${formattedDate} на ${serviceName} *снята*\n\nБудем вас ждать в другой день ☺️\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (eventType.includes('reminder') || eventType === 'record_reminder') {
    // НАПОМИНАНИЕ ЗА СУТКИ
    message = `Добрый день, ${clientName} 🌷\n\nЗавтра в ${formattedDate.split(' в ')[1]} Вы записаны к ${masterName} на ${serviceName}\n*Подтвердите пожалуйста Ваш визит*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else {
    console.log(`⚠️ Неизвестный тип события: ${eventType}`);
    return;
  }

  await sendWhatsApp(phone, message);
});

// Проверка что сервер работает
app.get('/', (req, res) => {
  res.send('DNK Beauty Bot работает ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 DNK Beauty Bot запущен на порту ${PORT}`);
});
