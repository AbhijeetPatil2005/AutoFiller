const express = require('express');
const router = express.Router();
const {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  getProfileKeys,
  setActiveProfile,
  saveProfileField,
  saveField,
} = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getProfiles)
  .post(protect, createProfile);

router.get('/keys', protect, getProfileKeys);

router.put('/:id/activate', protect, setActiveProfile);

router.post('/save-field', protect, saveProfileField);
router.post('/saveField', protect, saveField);

router.route('/:id')
  .put(protect, updateProfile)
  .delete(protect, deleteProfile);



module.exports = router;
