const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  semester: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Notes', 'PYQ', 'Book', 'Other'], 
    required: true 
  },
  fileUrl: { type: String, required: true },
  filePublicId: { type: String, default: null },
  uploader: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  university: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'University', 
    default: null
  },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Note', noteSchema);