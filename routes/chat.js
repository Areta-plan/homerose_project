const express = require('express');
const router = express.Router();
const { handleChatHistoryRequest } = require('../services/chatService');

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 필드를 제공하세요.' });
  }
  try {
    const answer = await handleChatHistoryRequest(messages);
    res.json({ answer });
  } catch (e) {
    console.error('[/chat] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;