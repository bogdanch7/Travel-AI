const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

const PORT = 3001;
const BACKEND_URL = 'http://localhost:3000/webhook';

// 1. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

client.on('qr', (qr) => {
    console.clear();
    console.log('QR RECEIVED. Scan it with your phone:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp Bridge is ready!');
});

// 1.5 Local Deduplication for Bridge
const processedMessages = new Set();
setInterval(() => {
    if (processedMessages.size > 1000) processedMessages.clear();
}, 60000); 


// 2. Listen for Messages
client.on('message', async (msg) => {
    const msgId = msg.id._serialized || msg.id.id;
    
    // Local bridge deduplication
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);

    const chat = await msg.getChat();

    // Logic: Forward if it's a 1:1 DM OR if it's a group message that mentions @VolaBot
    const shouldForward = !chat.isGroup || msg.body.includes('@VolaBot');

    if (shouldForward) {
        console.log(`[${new Date().toISOString()}] Forwarding message ${msgId} from ${msg.author || msg.from}`);

        // Construct Mock Meta Webhook JSON
        const mockPayload = {
            object: 'whatsapp_business_account',
            entry: [{
                id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
                changes: [{
                    field: 'messages',
                    value: {
                        messaging_product: 'whatsapp',
                        metadata: {
                            display_phone_number: '1234567890',
                            phone_number_id: 'PHONE_NUMBER_ID'
                        },
                        contacts: [{
                            profile: { name: msg._data?.notifyName || 'WhatsApp User' },
                            wa_id: (msg.author || msg.from).split('@')[0]
                        }],
                        messages: [{
                            from: msg.from, // Group ID or Personal ID
                            id: msgId,
                            timestamp: msg.timestamp.toString(),
                            type: 'text',
                            text: { body: msg.body },
                            participant: msg.author || null // Original sender (if in group)
                        }]
                    }
                }]
            }]
        };

        // Fire and forget (don't await) to allow WhatsApp to acknowledge immediately
        axios.post(BACKEND_URL, mockPayload).catch(err => {
            console.error('Failed to forward message to backend:', err.message);
        });
    }
});

client.initialize();

// 3. Express Server for Outbound Messages
const app = express();
app.use(express.json());

app.post('/trimite-raspuns', async (req, res) => {
    const { groupId, text } = req.body;

    if (!groupId || !text) {
        return res.status(400).send({ error: 'groupId and text are required' });
    }

    try {
        await client.sendMessage(groupId, text);
        console.log(`[${new Date().toISOString()}] Sent reply to ${groupId}`);
        res.send({ status: 'success' });
    } catch (err) {
        console.error('Failed to send message via WhatsApp:', err.message);
        res.status(500).send({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Bridge server listening on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ PORT ${PORT} IS ALREADY IN USE! Please kill existing bridge processes.`);
        process.exit(1);
    } else {
        console.error('Bridge server error:', err);
    }
});

