const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const GREEN_API_ID = process.env.GREEN_API_ID || '7107653277';
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN || '435d75273cd143428922e58e659d6d7c0e402ebbe2824868a6';
const GREEN_API_URL = `https://7107.api.greenapi.com`;

async function sendWhatsApp(phone, message) {
  try {
    const cleanPhone = phone.replace(/[\s\+\-\(\)]/g, '');
    const chatId = `${cleanPhone}@c.us`;
    const url = `${GREEN_API_URL}/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
    await axios.post(url, { chatId, message });
    console.log(`✅ Сообщение отправлено на ${phone}`);
  } catch (error) {
    console.error(`❌ Ошибка отправки:`, error.response?.data || error.message);
  }
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
  return { full: `${day} ${month} в ${hours}:${minutes}`, time: `${hours}:${minutes}`, day };
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const data = req.body;
  console.log('📩 Вебхук от Altegio:', JSON.stringify(data, null, 2));

  const status = data.status; // "create", "update", "delete"
  const resource = data.resource; // "record"
  const record = data.data;

  if (resource !== 'record' || !record) {
    console.log('⚠️ Не запись, пропускаем');
    return;
  }

  // Клиент
  const client = record.clients?.[0] || record.client || {};
  const clientName = client.name || client.display_name || 'Уважаемый клиент';
  const phone = client.phone;

  if (!phone) {
    console.log('⚠️ Телефон клиента не найден');
    return;
  }

  // Мастер
  const staffName = record.staff?.name || 'мастера';

  // Услуга
  const serviceName = record.services?.[0]?.title || 'процедуру';

  // Дата
  const dateStr = record.date || record.datetime || record.date_time;
  const formatted = dateStr ? formatDateTime(dateStr) : { full: 'указанное время', time: '', day: '' };

  let message = '';

  if (status === 'create') {
    message = `Добрый день, ${clientName} 🌷\n\n*${formatted.full} Вы записаны к ${staffName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (status === 'update') {
    message = `Добрый день, ${clientName} 🌷\nВаша запись изменена.\n\nНовые детали записи:\n*${formatted.full} Вы записаны к ${staffName} на ${serviceName}*\n\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else if (status === 'delete') {
    message = `Добрый день, ${clientName} 🌷\n\nВаша запись на ${formatted.full} на ${serviceName} *снята*\n\nБудем вас ждать в другой день ☺️\nБлагодарим Вас за выбор нашего салона💕\nС уважением, DNK Beauty`;

  } else {
    console.log(`⚠️ Неизвестный статус: ${status}`);
    return;
  }

  await sendWhatsApp(phone, message);
});

app.get('/', (req, res) => {
  res.send('DNK Beauty Bot работает ✅');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 DNK Beauty Bot запущен на порту ${PORT}`);
});

