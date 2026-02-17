const mongoose = require('mongoose');

const fieldMappingSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    form_label: {
        type: String,
        required: true
    },
    mapped_key: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

fieldMappingSchema.index({ userId: 1 });
fieldMappingSchema.index({ userId: 1, form_label: 1 }, { unique: true });

const FieldMapping = mongoose.model('FieldMapping', fieldMappingSchema);

module.exports = FieldMapping;
