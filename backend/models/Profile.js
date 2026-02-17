const mongoose = require('mongoose');

const profileSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    profile_name: {
        type: String,
        required: true
    },
    data: {
        type: Map,
        of: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

profileSchema.index({ userId: 1 });

const Profile = mongoose.model('Profile', profileSchema);

module.exports = Profile;
