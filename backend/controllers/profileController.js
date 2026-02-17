const asyncHandler = require('express-async-handler');
const Profile = require('../models/Profile');

// @desc    Get user profiles
// @route   GET /api/profiles
// @access  Private
const getProfiles = asyncHandler(async (req, res) => {
  const profiles = await Profile.find({ userId: req.user.id });
  res.status(200).json(profiles);
});

// @desc    Create a new profile
// @route   POST /api/profiles
// @access  Private
const createProfile = asyncHandler(async (req, res) => {
  if (!req.body.profile_name) {
    res.status(400);
    throw new Error('Please add a profile name');
  }

  const profile = await Profile.create({
    userId: req.user.id,
    profile_name: req.body.profile_name,
    data: req.body.data || {},
  });

  res.status(201).json(profile);
});

// @desc    Update a profile
// @route   PUT /api/profiles/:id
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
  const profile = await Profile.findById(req.params.id);

  if (!profile) {
    res.status(404);
    throw new Error('Profile not found');
  }

  if (!req.user) {
    res.status(401);
    throw new Error('User not found');
  }

  if (profile.userId.toString() !== req.user.id) {
    res.status(401);
    throw new Error('User not authorized');
  }

  // Merge new data into existing Map safely
  if (req.body.data) {
    for (const key in req.body.data) {
      profile.data.set(key, req.body.data[key]);
    }
  }

  // Update profile name if provided
  if (req.body.profile_name) {
    profile.profile_name = req.body.profile_name;
  }

  const updatedProfile = await profile.save();

  res.status(200).json(updatedProfile);
});

// @desc    Delete a profile
// @route   DELETE /api/profiles/:id
// @access  Private
const deleteProfile = asyncHandler(async (req, res) => {
  const profile = await Profile.findById(req.params.id);

  if (!profile) {
    res.status(404);
    throw new Error('Profile not found');
  }

  // Check for user
  if (!req.user) {
    res.status(401);
    throw new Error('User not found');
  }

  // Make sure the logged in user matches the profile user
  if (profile.userId.toString() !== req.user.id) {
    res.status(401);
    throw new Error('User not authorized');
  }

  await profile.remove();

  res.status(200).json({ id: req.params.id });
});

// @desc    Get all profile keys for the logged-in user
// @route   GET /api/profiles/keys
// @access  Private
const getProfileKeys = asyncHandler(async (req, res) => {
  const profile = await Profile.findOne({ 
    userId: req.user.id,
    isActive: true 
  });

  if (!profile || !profile.data) {
    return res.status(200).json([]);
  }

  // profile.data is a Map in Mongoose, so keys() works
  const keys = Array.from(profile.data.keys());
  res.status(200).json(keys);
});

// @desc    Set active profile
// @route   PUT /api/profiles/:id/activate
// @access  Private
const setActiveProfile = asyncHandler(async (req, res) => {
  const profileId = req.params.id;

  // Deactivate all user profiles
  await Profile.updateMany(
    { userId: req.user.id },
    { isActive: false }
  );

  // Activate selected profile
  const profile = await Profile.findOneAndUpdate(
    { _id: profileId, userId: req.user.id },
    { isActive: true },
    { new: true }
  );

  if (!profile) {
    res.status(404);
    throw new Error('Profile not found or not authorized');
  }

  res.json(profile);
});

// @desc    Save a single field to the active profile
// @route   POST /api/profiles/save-field
// @access  Private
const saveProfileField = asyncHandler(async (req, res) => {
  const { key, value } = req.body;

  if (!key || !value) {
    res.status(400);
    throw new Error("Key and value required");
  }

  const profile = await Profile.findOne({
    userId: req.user.id,
    isActive: true
  });

  if (!profile) {
    res.status(404);
    throw new Error("Active profile not found");
  }

  profile.data.set(key, value);
  profile.markModified('data');

  await profile.save();

  res.json({ success: true, key, value });
});

// @desc    Save a single field to the active profile (explicit active check)
// @route   POST /api/profiles/saveField
// @access  Private
const saveField = async (req, res) => {
  try {
    const userId = req.user.id;
    const { key, value } = req.body;

    if (!key || !value) {
      return res.status(400).json({ error: "Key and value required" });
    }

    const profile = await Profile.findOne({
      userId,
      isActive: true
    });

    if (!profile) {
      return res.status(404).json({ error: "Active profile not found" });
    }

    // FORCE overwrite (UPSERT behavior)
    profile.data.set(key, value);

    // CRITICAL FIX
    profile.markModified("data");

    await profile.save();

    res.json({
      success: true,
      key,
      value
    });

  }
  catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to save field"
    });
  }
};

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  getProfileKeys,
  setActiveProfile,
  saveProfileField,
  saveField,
};
