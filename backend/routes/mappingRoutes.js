const express = require('express');
const router = express.Router();
const {
  getMappings,
  createMapping,
} = require('../controllers/mappingController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getMappings).post(protect, createMapping);

module.exports = router;
