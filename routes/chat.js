const express = require('express');
const multer = require('multer');
const router = express.Router();
const { handleChatHistoryRequest } = require('../services/chatService');
const { asyncHandler } = require('../middleware/errorHandler');

// parse multipart/form-data for optional reference files
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB 제한
}).fields([{ name: 'references', maxCount: 3 }]);

// 메시지 유효성 검증 미들웨어
const validateMessages = (req, res, next) => {
  let { messages } = req.body;
  if (typeof messages === 'string') {
    try { 
      messages = JSON.parse(messages); 
      req.body.messages = messages;
    } catch { 
      return res.status(400).json({ error: 'messages 필드는 올바른 JSON 배열이어야 합니다.' });
    }
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 배열을 제공하세요.' });
  }
  next();
};

router.post('/', 
  upload,
  validateMessages,
  asyncHandler(async (req, res) => {
    const { messages } = req.body;
    const references = (req.files && req.files['references']) || [];
    const answer = await handleChatHistoryRequest(messages, references);
    res.json({ answer });
  })
);

module.exports = router;