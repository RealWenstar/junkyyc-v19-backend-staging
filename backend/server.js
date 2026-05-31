const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const OpenAI = require('openai');
require('dotenv').config();

// Import Services & Config
const { sendAdminLeadEmail, sendCustomerConfirmationEmail } = require('./src/services/email');
const { sendTelegramOrder, sendTelegramCustomerConfirmation, sendTelegramAnalysis, sendTelegramContact } = require('./src/services/telegram');
const { applySelectedExtras } = require('./src/services/booking');
const {
  analyzeImagesWithOpenAI,
  buildAnalyzeResponse,
  buildDemoAnalyzeResponse,
  isExplicitDemoMode
} = require('./src/services/visionAnalysis');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
let openai = null;
if (process.env.OPENAI_API_KEY && 
    process.env.OPENAI_API_KEY !== 'your_openai_api_key_here' &&
    !process.env.OPENAI_API_KEY.startsWith('your-ope')) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    console.log('✅ OpenAI configured');
  } catch (error) {
    console.log('⚠️ OpenAI initialization failed:', error.message);
    openai = null;
  }
} else {
  console.log('⚠️ OpenAI not configured');
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' })); // For handling base64 images

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  // Check Telegram bot status
  const telegramConfigured = process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;

  console.log('HEALTH CHECK: Telegram env vars present =', telegramConfigured);

  res.json({
    status: 'success',
    message: 'AI JunkYYC Backend API is running (TELEGRAM v1.9)',
    timestamp: new Date().toISOString(),
    version: '1.9',
    storage: 'telegram-only', // No database storage
    telegram: telegramConfigured ? 'configured' : 'not configured',
    openai: openai ? 'configured' : 'not configured'
  });
});

// Analyze endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { images, sessionId } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }

    if (images.length > 10) {
      return res.status(400).json({ error: 'Too many images' });
    }

    if (!openai) {
      if (isExplicitDemoMode(process.env, req.query)) {
        console.log('Using explicit demo analysis data');
        return res.json(buildDemoAnalyzeResponse());
      }

      return res.status(503).json({
        error: 'AI service not configured',
        items: [],
        total_volume: 0,
        pricing: null,
        analysis_complete: false,
        recognition_ms: 0
      });
    }

    const { analyses, recognition_ms } = await analyzeImagesWithOpenAI(openai, images);

    console.log(`Analysis complete. Results:`, analyses.map((a, i) => ({
      image: i + 1,
      itemsCount: a.items?.length || 0,
      error: a.error
    })));

    const responsePayload = buildAnalyzeResponse({ analyses, recognition_ms });
    const { lead_id: leadId, items: itemsWithVolume, total_volume: totalVolume, pricing } = responsePayload;

    // EMAIL-ONLY: No database storage needed
    console.log(`Analysis complete for lead ${leadId}: ${totalVolume} cy, ${itemsWithVolume.length} items`);

    // DEBUG: Log analysis results (no customer data in analysis endpoint)
    console.log('📊 ANALYSIS COMPLETE for lead', leadId);
    console.log('- Items analyzed:', itemsWithVolume.length);
    console.log('- Total volume:', totalVolume.toFixed(2), 'cy');
    console.log('- Recognition time:', recognition_ms, 'ms');
    console.log('- Lead ready for booking');

    if (itemsWithVolume.length > 0 && responsePayload.moderation && responsePayload.moderation.status === 'allow') {
      // Forward to Telegram ONLY when moderation allows (don't push illegal/abusive
      // uploads to the leads channel even if junk is also in frame). v1.x MVP gate.
      try {
        console.log('📱 TELEGRAM: Sending analysis results to Telegram...');
        await sendTelegramAnalysis(leadId, itemsWithVolume, pricing, images);
        console.log('✅ TELEGRAM: Analysis results sent successfully');
      } catch (telegramError) {
        console.error('❌ TELEGRAM: Failed to send analysis results:', telegramError.message);
        // Don't fail the analysis if Telegram fails
      }
    }

    res.json(responsePayload);

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Booking endpoint
app.post('/api/book', async (req, res) => {
  console.log('🚨 BOOKING REQUEST RECEIVED');
  console.log('📦 Raw body size:', JSON.stringify(req.body).length, 'chars');
  console.log('📸 Files received:', req.files?.length || 0);

  try {
    const { leadId, customer, items, pricing, services, helpers, photos } = req.body;
    console.log('📋 Parsed data:');
    console.log('- Lead ID:', leadId);
    console.log('- Customer:', customer ? 'present' : 'missing');
    console.log('- Customer name:', customer?.name);
    console.log('- Items:', items?.length || 0);
    console.log('- Pricing:', pricing ? 'present' : 'missing');
    console.log('- Pricing object:', JSON.stringify(pricing, null, 2));
    console.log('- Services:', services ? 'present' : 'missing', services);
    console.log('- Helpers:', helpers || 0);
    console.log('- Photos in body:', photos?.length || 0);

    if (!leadId || !customer || !items || !pricing) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize frontend/backend pricing shapes and add selected services only if
    // they were not already included by the client-side estimate.
    const finalPricing = applySelectedExtras(pricing, services, helpers);
    console.log('💰 Final price normalized:', {
      baseSubtotal: pricing.subtotal,
      extras: finalPricing.extras_price,
      newSubtotal: finalPricing.subtotal,
      gst: finalPricing.gst,
      finalTotal: finalPricing.total
    });

    // Generate order ID without database
    const orderId = `email-${Date.now()}`;

    console.log(`📧 CONTACT-ONLY BOOKING: Processing contacts for lead ${leadId} - ${customer.name}`);

    // Send only customer contact info with final pricing (analysis already sent to Telegram)
    await sendTelegramContact(leadId, customer, finalPricing);
    console.log(`✅ TELEGRAM CONTACT: Contact info for lead ${leadId} sent to Telegram successfully`);

    // Prepare full order data for Email
    const emailOrderData = {
      leadId,
      customer,
      items,
      pricing: finalPricing,
      photos: photos || []
    };

    // Send Emails (Admin + Customer)
    // Run in background to not block response
    Promise.all([
      sendAdminLeadEmail(emailOrderData).catch(err => console.error('Failed to send admin email:', err)),
      sendCustomerConfirmationEmail(customer.email, { customer, pricing: finalPricing, orderId }).catch(err => console.error('Failed to send customer email:', err))
    ]).then(() => console.log('📧 Emails processing initiated'));

    res.json({
      success: true,
      order_id: orderId,
      message: 'Booking confirmed! We will contact you shortly.'
    });

  } catch (error) {
    console.error('EMAIL-ONLY BOOKING ERROR:', error);
    res.status(500).json({ error: 'Booking failed - please try again or contact us directly' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
