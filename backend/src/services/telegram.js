const TelegramBot = require('node-telegram-bot-api');

// Initialize bot with polling (no webhook needed for simple setup)
const bot = process.env.TELEGRAM_BOT_TOKEN
  ? new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
  : null;

if (bot) {
  console.log('✅ Telegram bot initialized');
} else {
  console.log('⚠️ Telegram bot not configured (missing TELEGRAM_BOT_TOKEN)');
}

// Auto-delete scheduled messages (message_id -> timeout_id)
const scheduledDeletions = new Map();

// Function to schedule message auto-deletion after 48 hours
function scheduleMessageDeletion(messageId) {
  if (!messageId || !bot) return;

  // Cancel existing deletion if any
  if (scheduledDeletions.has(messageId)) {
    clearTimeout(scheduledDeletions.get(messageId));
  }

  // Schedule deletion after 48 hours (172800000 ms)
  const timeoutId = setTimeout(async () => {
    try {
      await bot.deleteMessage(process.env.TELEGRAM_CHAT_ID, messageId);
      console.log(`🗑️ Auto-deleted old message ${messageId} (48h old)`);
      scheduledDeletions.delete(messageId);
    } catch (error) {
      console.error(`❌ Failed to auto-delete message ${messageId}:`, error.message);
    }
  }, 172800000); // 48 hours in milliseconds

  scheduledDeletions.set(messageId, timeoutId);
  console.log(`⏰ Scheduled auto-deletion for message ${messageId} in 48 hours`);
}

// Function to send order notification
async function sendTelegramOrder(orderData) {
  if (!bot || !process.env.TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram not configured, skipping order notification');
    return;
  }

  const { customer, items, pricing, leadId, photos } = orderData;

  try {
    // Format items list - handle nested structure
    let itemsList = 'Нет предметов';

    if (items && Array.isArray(items) && items.length > 0) {
      // Handle both flat items array and nested structure
      const flatItems = items.flatMap(group =>
        group.items ? group.items : [group]
      );

      itemsList = flatItems.map(item => {
        const name = item.name || item.item || 'Неизвестный предмет';
        const quantity = item.quantity || item.qty || 1;
        const category = item.category || 'другое';
        return `• ${name} (${quantity} шт, ${category})`;
      }).join('\n');
    }

    // Create message with correct pricing structure (handle both backend and frontend pricing formats)
    let basePrice, volumePrice, extras, totalPrice, totalVolume;

    if (pricing?.base_price !== undefined) {
      // Backend API pricing format
      basePrice = pricing.base_price;
      volumePrice = 0; // Backend doesn't separate volume price
      extras = 0; // Backend doesn't have extras
      totalPrice = pricing.total;
      totalVolume = pricing.volume_cy;
    } else {
      // Frontend totals format (fallback)
      basePrice = pricing?.base || pricing?.subtotal || 0;
      volumePrice = pricing?.volumePrice || 0;
      extras = pricing?.extras || 0;
      totalPrice = pricing?.total || pricing?.finalTotal || 0;
      totalVolume = pricing?.totalVolume || pricing?.volume || 0;
    }

    const message = `
🆔 *НОВЫЙ ЗАКАЗ #${leadId}*

👤 *Клиент:*
• Имя: ${customer?.name || 'Не указано'}
• Телефон: ${customer?.phone || 'Не указано'}
• Email: ${customer?.email || 'Не указано'}
• Адрес: ${customer?.address || 'Не указано'}

📦 *Предметы для вывоза:*
${itemsList}

💰 *Стоимость:*
• Базовая цена: $${basePrice?.toFixed(2) || '0.00'}
• Стоимость объема: $${volumePrice?.toFixed(2) || '0.00'}
• Дополнительные услуги: $${extras?.toFixed(2) || '0.00'}
• Итого: $${totalPrice?.toFixed(2) || '0.00'}

📏 *Общий объем:* ${totalVolume?.toFixed(1) || 0} куб.м

📝 *Комментарий:* ${customer?.comments || 'Нет'}
    `;

    // Send message and schedule auto-deletion
    const sentMessage = await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    // Schedule auto-deletion after 48 hours
    scheduleMessageDeletion(sentMessage.message_id);

    console.log(`✅ Telegram order #${leadId} sent successfully (ID: ${sentMessage.message_id})`);

    // Send photos if available (max 3 to avoid spam)
    if (photos && photos.length > 0) {
      const photosToSend = photos.slice(0, 8); // Limit to 8 photos

      for (let i = 0; i < photosToSend.length; i++) {
        try {
          const photoData = photosToSend[i];

          // Handle base64 photos - convert to Buffer
          let photoBuffer;
          if (typeof photoData === 'string' && photoData.startsWith('data:image')) {
            // Remove data URL prefix and convert base64 to buffer
            const base64Data = photoData.split(',')[1];
            photoBuffer = Buffer.from(base64Data, 'base64');
          } else if (typeof photoData === 'string') {
            // Assume it's base64 without prefix
            photoBuffer = Buffer.from(photoData, 'base64');
          } else {
            // Assume it's already a buffer or valid input
            photoBuffer = photoData;
          }

          await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, photoBuffer, {
            caption: `📸 Фото ${i + 1} заказа #${leadId}`,
            disable_notification: true // Don't spam with notifications
          });
          console.log(`✅ Photo ${i + 1} sent for order #${leadId}`);
        } catch (photoError) {
          console.warn(`⚠️ Failed to send photo ${i + 1}:`, photoError.message);
        }
      }
    }

  } catch (error) {
    console.error('❌ Telegram send failed:', error);
    throw error; // Re-throw to handle in calling code
  }
}

// Function to send customer confirmation (optional)
async function sendTelegramCustomerConfirmation(customerEmail, orderData) {
  // For now, skip customer notifications via Telegram
  // They get email confirmation if email works, or we call them
  console.log('ℹ️ Customer confirmation via Telegram skipped (using phone calls)');
}

// Function to send analysis results immediately after photo processing
async function sendTelegramAnalysis(leadId, items, pricing, images) {
  if (!bot || !process.env.TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram not configured, skipping analysis notification');
    return;
  }

  try {
    // Format items list
    const itemsList = items?.map(item =>
      `• ${item.name} (${item.quantity} шт, ${item.category}) - ${item.volume?.toFixed(1) || 0} cy`
    ).join('\n') || 'Нет предметов';

    // Create analysis message with detailed pricing
    const message = `
🤖 *НОВЫЙ АНАЛИЗ ФОТО #${leadId}*

📦 *Распознанные предметы:*
${itemsList}

💰 *Расчетная стоимость:*
• Базовая цена: $${pricing?.base_price?.toFixed(2) || '0.00'}
• Стоимость объема: $${pricing?.volume_price?.toFixed(2) || '0.00'}
• Сложность: $${pricing?.difficulty_price?.toFixed(2) || '0.00'}
• Дополнительные услуги: $${pricing?.extras_price?.toFixed(2) || '0.00'}
• НДС (5%): $${pricing?.gst?.toFixed(2) || '0.00'}
• **Итого: $${pricing?.total?.toFixed(2) || '0.00'}**

📏 *Общий объем:* ${pricing?.volume_cy?.toFixed(1) || 0} куб.м

📝 *Статус:* Фото проанализированы, ждем контактные данные для заказа

⏰ *Следующий шаг:* Заполнить форму контактов и отправить заказ
    `;

    // Send message and schedule auto-deletion
    const sentMessage = await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    // Schedule auto-deletion after 48 hours
    scheduleMessageDeletion(sentMessage.message_id);

    console.log(`✅ Telegram analysis #${leadId} sent successfully (ID: ${sentMessage.message_id})`);

    // Send photos if available (max 3 to avoid spam)
    if (images && images.length > 0) {
      const photosToSend = images.slice(0, 8); // Limit to 8 photos

      for (let i = 0; i < photosToSend.length; i++) {
        try {
          const imageData = photosToSend[i];

          // Handle base64 photos - convert to Buffer
          let photoBuffer;
          if (typeof imageData === 'string' && imageData.startsWith('data:image')) {
            // Remove data URL prefix and convert base64 to buffer
            const base64Data = imageData.split(',')[1];
            photoBuffer = Buffer.from(base64Data, 'base64');
          } else if (typeof imageData === 'string') {
            // Assume it's base64 without prefix
            photoBuffer = Buffer.from(imageData, 'base64');
          } else {
            // Assume it's already a buffer or valid input
            photoBuffer = imageData;
          }

          await bot.sendPhoto(process.env.TELEGRAM_CHAT_ID, photoBuffer, {
            caption: `📸 Фото анализа #${leadId} (${i + 1}/${photosToSend.length})`,
            disable_notification: true // Don't spam with notifications
          });
          console.log(`✅ Analysis photo ${i + 1} sent for lead #${leadId}`);
        } catch (photoError) {
          console.warn(`⚠️ Failed to send analysis photo ${i + 1}:`, photoError.message);
        }
      }
    }

  } catch (error) {
    console.error('❌ Telegram analysis send failed:', error);
    throw error; // Re-throw to handle in calling code
  }
}

// Function to send contact information after analysis
async function sendTelegramContact(leadId, customer, finalPricing = null) {
  if (!bot || !process.env.TELEGRAM_CHAT_ID) {
    console.log('⚠️ Telegram not configured, skipping contact notification');
    return;
  }

  try {
    // Check if this is a manual booking (Schedule Pickup without photos)
    const isManualBooking = leadId.startsWith('manual-');

    // Create contact message - different format for manual vs photo bookings
    let message = `
👤 *КОНТАКТНЫЕ ДАННЫЕ ПОЛУЧЕНЫ #${leadId}*

📞 *Клиент готов к заказу:*
• Имя: ${customer?.name || 'Не указано'}
• Телефон: ${customer?.phone || 'Не указано'}
• Email: ${customer?.email || 'Не указано'}
• Адрес: ${customer?.address || 'Не указано'}

📝 *Комментарий:* ${customer?.comments || 'Нет'}
`;

    // Add pricing only for photo-based bookings (no urgency messages)
    if (!isManualBooking && finalPricing) {
      message += `

*💰 ИТОГОВАЯ СТОИМОСТЬ: $${finalPricing.total?.toFixed(2) || 'TBD'}*

• Базовая цена: $${finalPricing.base_price?.toFixed(2) || '0.00'}
• Объем: $${finalPricing.volume_price?.toFixed(2) || '0.00'}
• Сложность: $${finalPricing.difficulty_price?.toFixed(2) || '0.00'}
• Доп. услуги: $${finalPricing.extras_price?.toFixed(2) || '0.00'}
• НДС: $${finalPricing.gst?.toFixed(2) || '0.00'}
• *ИТОГО: $${finalPricing.total?.toFixed(2) || 'TBD'}*`;
    } else if (!isManualBooking) {
      message += `

*Анализ фото уже выполнен - все данные выше*`;
    }

    // Send message and schedule auto-deletion
    const sentMessage = await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });

    // Schedule auto-deletion after 48 hours
    scheduleMessageDeletion(sentMessage.message_id);

    console.log(`✅ Telegram contact #${leadId} sent successfully (ID: ${sentMessage.message_id})`);

  } catch (error) {
    console.error('❌ Telegram contact send failed:', error);
    throw error; // Re-throw to handle in calling code
  }
}

// Function to send customer confirmation (optional)
async function sendTelegramCustomerConfirmation(customerEmail, orderData) {
  // For now, skip customer notifications via Telegram
  // They get email confirmation if email works, or we call them
  console.log('ℹ️ Customer confirmation via Telegram skipped (using phone calls)');
}

module.exports = {
  sendTelegramOrder,
  sendTelegramCustomerConfirmation,
  sendTelegramAnalysis,
  sendTelegramContact
};