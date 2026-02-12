const asyncHandler = require('express-async-handler');
const FieldMapping = require('../models/FieldMapping');

// @desc    Get user mappings
// @route   GET /api/mappings
// @access  Private
const getMappings = asyncHandler(async (req, res) => {
  const mappings = await FieldMapping.find({ userId: req.user.id });
  res.status(200).json(mappings);
});

// @desc    Create a new mapping
// @route   POST /api/mappings
// @access  Private
const createMapping = asyncHandler(async (req, res) => {
  if (!req.body.form_label || !req.body.mapped_key) {
    res.status(400);
    throw new Error('Please add a form label and mapped key');
  }

  const mapping = await FieldMapping.create({
    userId: req.user.id,
    form_label: req.body.form_label,
    mapped_key: req.body.mapped_key,
  });

  res.status(201).json(mapping);
});

module.exports = {
  getMappings,
  createMapping,
};
