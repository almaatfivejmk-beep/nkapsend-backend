const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json());

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'sandbox';
const PAYPAL_API_URL = PAYPAL_MODE === 'live' 
  ? 'https://api-m.paypal.com' 
  : 'https://api-m.sandbox.paypal.com';

let transactions = [];

async function getPayPalAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const response = await fetch(`${PAYPAL_API_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json();
  return data.access_token;
}

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    paypal: PAYPAL_CLIENT_ID ? 'configured' : 'not configured',
    mode: PAYPAL_MODE
  });
});

app.get('/api/paypal/client-id', (req, res) => {
  res.json({ success: true, clientId: PAYPAL_CLIENT_ID, mode: PAYPAL_MODE });
});

app.post('/api/paypal/create-order', async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currency || 'USD', value: amount.toFixed(2) },
        }],
      }),
    });
    const data = await response.json();
    res.json({ success: true, orderId: data.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/paypal/capture', async (req, res) => {
  try {
    const { orderId } = req.body;
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`${PAYPAL_API_URL}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    const data = await response.json();
    if (data.status === 'COMPLETED') {
      res.json({ success: true, transaction: { id: `TXN${Date.now()}`, status: 'completed' } });
    } else {
      res.status(400).json({ error: 'Capture failed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`NKAPSEND API running on port ${PORT}`);
});
