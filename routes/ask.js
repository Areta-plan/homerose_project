const express = require('express');
const router = express.Router();
const { handleChatRequest } = require('../services/chatService');

// POST /ask: 단순 메시지 받기
router.post('/', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message 필드는 필수입니다.' });
  }

  try {
    const answer = await handleChatRequest(message);
    res.json({ answer });
  } catch (err) {
    console.error('[/ask] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
