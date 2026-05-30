const nodemailer = require('nodemailer');
const { normalizeBookingItems, normalizeBookingPricing } = require('./booking');
require('dotenv').config();

// #region agent log - Email transporter initialization
const logToDebug = (message, data = {}) => {
  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    location: 'backend/src/services/email.js',
    message: message,
    data: {
      ...data,
      smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
      smtpHost: process.env.SMTP_HOST ? '[CONFIGURED]' : '[MISSING]',
      smtpUser: process.env.SMTP_USER ? '[CONFIGURED]' : '[MISSING]',
      smtpPass: process.env.SMTP_PASS ? '[CONFIGURED]' : '[MISSING]'
    },
    sessionId: 'email-debug-session',
    runId: 'email-init-check',
    hypothesisId: 'EMAIL_INIT'
  };

  fetch('http://127.0.0.1:7245/ingest/07fc3118-a7a9-42ee-bbdd-870f0afdfe4f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logEntry)
  }).catch(() => {});
};
// #endregion

// Initialize email transporter
let emailTransporter = null;
logToDebug('Email service initialization started');

if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  logToDebug('SMTP credentials found, creating transporter');
  const smtpPort = parseInt(process.env.SMTP_PORT) || 587;

  emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Добавляем timeout и debug для troubleshooting
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,   // 10 seconds
    socketTimeout: 30000,     // 30 seconds
    debug: true, // Enable debug logging
    logger: true // Enable logger
  });

  console.log(`✅ Email service configured for host: ${process.env.SMTP_HOST}:${smtpPort}`);
  console.log(`📧 SMTP Config: ${process.env.SMTP_USER} -> ${process.env.SMTP_HOST}:${smtpPort}`);
} else {
  console.log('⚠️ Email service running in DEMO mode (no emails will be sent)');
}

// Export for health check
module.exports.emailTransporter = emailTransporter;

async function sendAdminLeadEmail(orderData) {
  // #region agent log - Admin email send attempt
  logToDebug('sendAdminLeadEmail called', {
    hasCustomer: !!orderData.customer,
    hasItems: !!orderData.items,
    hasPricing: !!orderData.pricing,
    photosCount: orderData.photos?.length || 0,
    transporterReady: !!emailTransporter
  });
  // #endregion

  console.log('📧 EMAIL: Function called with data:', {
    hasCustomer: !!orderData.customer,
    hasItems: !!orderData.items,
    hasPricing: !!orderData.pricing,
    photosCount: orderData.photos?.length || 0
  });

  if (!emailTransporter) {
    console.log('❌ Email not configured, skipping admin notification');
    return;
  }

  console.log('📧 EMAIL: Starting admin email send...');

  const { customer, items, pricing, leadId, photos = [] } = orderData;
  const normalizedPricing = normalizeBookingPricing(pricing);
  const itemsList = normalizeBookingItems(items)
    .map(item => `- ${item.name} (${item.category}) - Qty: ${item.quantity}`)
    .join('\n') || '- No items provided';

  // Prepare photo attachments
  const attachments = photos.map((photoBase64, index) => ({
    filename: `photo-${index + 1}.jpg`,
    content: photoBase64,
    encoding: 'base64',
    cid: `photo-${index + 1}@junkyyc.com` // Content ID for inline images
  }));

  // Build HTML with inline images
  const photosHtml = photos.length > 0 
    ? `<h3>Customer Photos (${photos.length}):</h3>
       <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 20px 0;">
         ${photos.map((_, index) => 
           `<img src="cid:photo-${index + 1}@junkyyc.com" alt="Photo ${index + 1}" style="width: 100%; max-width: 300px; border-radius: 8px; border: 1px solid #ddd;" />`
         ).join('')}
       </div>`
    : '';

  const mailOptions = {
    from: process.env.SMTP_USER,
    replyTo: 'info@junkyyc.com', // Customer sees replies from noreply
    to: process.env.ADMIN_EMAIL || 'info@junkyyc.com',
    subject: `New Junk Removal Lead - ${customer.name}`,
    html: `
      <h2>New Junk Removal Booking</h2>
      <h3>Customer Details:</h3>
      <p><strong>Name:</strong> ${customer.name}</p>
      <p><strong>Phone:</strong> ${customer.phone}</p>
      <p><strong>Email:</strong> ${customer.email}</p>
      <p><strong>Address:</strong> ${customer.address}</p>
      <p><strong>Comments:</strong> ${customer.comments || 'None'}</p>

      ${photosHtml}

      <h3>Pricing Estimate:</h3>
      <p><strong>Base Fee:</strong> $${normalizedPricing.base_price.toFixed(2)}</p>
      <p><strong>Volume Cost:</strong> $${normalizedPricing.volume_price.toFixed(2)}</p>
      <p><strong>Difficulty Surcharge:</strong> $${normalizedPricing.difficulty_price.toFixed(2)}</p>
      <p><strong>Additional Services:</strong> $${normalizedPricing.extras_price.toFixed(2)}</p>
      <p><strong>Subtotal:</strong> $${normalizedPricing.subtotal.toFixed(2)}</p>
      <p><strong>GST (5%):</strong> $${normalizedPricing.gst.toFixed(2)}</p>
      <p><strong>Total:</strong> $${normalizedPricing.total.toFixed(2)}</p>
      <p><strong>Volume:</strong> ${normalizedPricing.volume_cy.toFixed(1)} cubic yards</p>

      <h3>Detected Items:</h3>
      <pre>${itemsList}</pre>

      <h3>Lead ID:</h3>
      <p>${leadId}</p>

      <p><em>Please contact the customer within 15 minutes to confirm the booking.</em></p>
    `,
    attachments: attachments
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log(`Admin notification email sent successfully with ${photos.length} photos`);
  } catch (error) {
    console.error('Failed to send admin email:', error);
  }
}

async function sendCustomerConfirmationEmail(customerEmail, orderData) {
  if (!emailTransporter) {
    console.log('Email not configured, skipping customer confirmation');
    return;
  }

  const { customer, pricing, orderId } = orderData;

  const mailOptions = {
    from: process.env.SMTP_USER,
    replyTo: 'info@junkyyc.com',
    to: customerEmail,
    subject: 'Your Junk Removal Booking Confirmation - AI JunkYYC',
    html: `
      <h2>Thank you for choosing AI JunkYYC!</h2>

      <p>Dear ${customer.name},</p>

      <p>We've received your junk removal booking request and will contact you within 15 minutes to confirm the details and schedule your pickup.</p>

      <h3>Booking Summary:</h3>
      <p><strong>Order ID:</strong> ${orderId}</p>
      <p><strong>Estimated Total:</strong> $${pricing.total?.toFixed(2) || 'TBD'}</p>
      <p><strong>Service Area:</strong> Calgary, Alberta</p>

      <h3>Next Steps:</h3>
      <ol>
        <li>Our team will call you at ${customer.phone} within 15 minutes</li>
        <li>We'll confirm the exact price based on final inspection</li>
        <li>We'll schedule a convenient pickup time</li>
        <li>We'll send a crew to collect your items responsibly</li>
      </ol>

      <p><strong>Questions?</strong> Call us directly at (825) 736-5952</p>

      <p>Best regards,<br>The AI JunkYYC Team</p>
    `
  };

  try {
    await emailTransporter.sendMail(mailOptions);
    console.log('Customer confirmation email sent successfully');
  } catch (error) {
    console.error('Failed to send customer email:', error);
  }
}

module.exports = {
  emailTransporter,
  sendAdminLeadEmail,
  sendCustomerConfirmationEmail
};
