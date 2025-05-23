const express = require('express');
const multer = require('multer');
const router = express.Router();
const { handleChatHistoryRequest } = require('../services/chatService');

// parse multipart/form-data for optional reference files
const upload = multer({ storage: multer.memoryStorage() }).fields([
  { name: 'references', maxCount: 3 }
]);

router.post('/', upload, async (req, res) => {
  let { messages } = req.body;
  if (typeof messages === 'string') {
    try { messages = JSON.parse(messages); } catch { messages = undefined; }
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 필드를 제공하세요.' });
  }
  try {
    const references = (req.files && req.files['references']) || [];
    const answer = await handleChatHistoryRequest(messages, references);
    res.json({ answer });
  } catch (e) {
    console.error('[/chat] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;