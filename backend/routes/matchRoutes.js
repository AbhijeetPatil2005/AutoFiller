const express = require('express');
const router = express.Router();
const { matchFields } = require('../controllers/matchController');
const { protect } = require('../middleware/authMiddleware');

router.post('/', protect, matchFields);

module.exports = router;
