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

  const updatedProfile = await Profile.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

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

module.exports = {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
};
