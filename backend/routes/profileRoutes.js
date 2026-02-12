const express = require('express');
const router = express.Router();
const {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
} = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');

router.route('/').get(protect, getProfiles).post(protect, createProfile);
router.route('/:id').put(protect, updateProfile).delete(protect, deleteProfile);



module.exports = router;
