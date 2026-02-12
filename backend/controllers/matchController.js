const asyncHandler = require('express-async-handler');
const Profile = require('../models/Profile');

// @desc    Match labels to profile data
// @route   POST /api/matchFields
// @access  Private
const matchFields = asyncHandler(async (req, res) => {
    const { labels } = req.body;
    
    if (!labels || !Array.isArray(labels)) {
        res.status(400);
        throw new Error('Please provide an array of labels');
    }

    // 1. Get the logged-in user's profile
    const profile = await Profile.findOne({ userId: req.user.id });

    if (!profile || !profile.data) {
        return res.json({}); // No profile or data found, return empty match
    }

    // 2. Get user's field mappings
    const FieldMapping = require('../models/FieldMapping');
    const userMappings = await FieldMapping.find({ userId: req.user.id });
    
    // Create a lookup map for faster access: form_label -> mapped_key
    const mappingLookup = {};
    userMappings.forEach(mapping => {
        mappingLookup[mapping.form_label.toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim()] = mapping.mapped_key;
    });

    const matches = {};
    
    labels.forEach(label => {
        const normalizedLabel = label.toLowerCase().replace(/[*:]/g, '').replace(/\s+/g, ' ').trim();
        
        // Priority 1: Check explicit mapping
        if (mappingLookup[normalizedLabel]) {
            const mappedKey = mappingLookup[normalizedLabel];
            if (profile.data.has(mappedKey)) {
                matches[label] = profile.data.get(mappedKey);
                return; // Match found, skip keyword search
            }
        }

        // Priority 2: Fallback to Keyword Matching
        const lowerLabel = label.toLowerCase();
        
        // Iterate over profile keys
        for (const [key, value] of profile.data) {
            // Logic: Simple includes/keyword match
            // Normalize key: replace underscores with spaces
            const normalizedKey = key.replace(/_/g, ' ').toLowerCase();
            const normalizedFallbackLabel = lowerLabel.replace(/_/g, ' ');
            
            if (normalizedFallbackLabel.includes(normalizedKey)) {
                 matches[label] = value;
                 break; // Found a match for this label, stop checking keys
            }
        }
    });

    res.json(matches);
});

module.exports = {
    matchFields
};
