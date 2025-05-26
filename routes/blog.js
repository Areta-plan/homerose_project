const express = require('express');
const router = express.Router();
const { handleBlogRequest } = require('../services/chatService');
const { validateRequest, asyncHandler } = require('../middleware/errorHandler');

// POST /blog: 블로그 초안 생성
router.post('/', 
  validateRequest(['topic', 'mode']),
  asyncHandler(async (req, res) => {
    const { topic, mode, userParams } = req.body;
    const draft = await handleBlogRequest({ topic, mode, userParams });
    res.json({ draft });
  })
);

module.exports = router;
