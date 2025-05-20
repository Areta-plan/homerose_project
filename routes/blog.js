const express = require('express');
const router  = express.Router();
const { handleBlogRequest } = require('../services/chatService');

// POST /blog: 블로그 초안 생성
router.post('/', async (req, res) => {
  const { topic, mode, userParams } = req.body;
  if (!topic || !mode) {
    return res.status(400).json({ error: '필수 파라미터(topic, mode)를 모두 전달하세요.' });
  }

  try {
    const draft = await handleBlogRequest({ topic, mode, userParams });
    res.json({ draft });
  } catch (e) {
    console.error('[/blog] Error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
