const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stars:     { type: Number, min: 1, max: 5, required: true },
  createdAt: { type: Date, default: Date.now }
});

const noteSchema = new mongoose.Schema({
  title:        { type: String, required: true },
  subject:      { type: String, required: true },
  semester:     { type: String, required: true },
  type:         { type: String, enum: ['Notes', 'PYQ', 'Book', 'Other'], required: true },
  fileUrl:      { type: String, required: true },
  filePublicId: { type: String, default: null },
  uploader:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  university:   { type: mongoose.Schema.Types.ObjectId, ref: 'University', default: null },
  views:        { type: Number, default: 0 },
  // Add this field to your noteSchema
  isRestricted: { type: Boolean, default: false } ,

  fileHash:        { type: String, default: null },  // MD5 hash of file
extractedText:   { type: String, default: null },  // extracted text for similarity
isDuplicate:     { type: Boolean, default: false }, // flagged as duplicate
duplicateOf:     { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },
duplicateSimilarity: { type: Number, default: null }, // similarity % 
flaggedAt:       { type: Date, default: null },
isFlagResolved:  { type: Boolean, default: false },

  // Ratings
  ratings:      [ratingSchema],
  totalRating:  { type: Number, default: 0 },
  ratingCount:  { type: Number, default: 0 },

  createdAt:    { type: Date, default: Date.now }
});

// Virtual: average note rating
noteSchema.virtual('avgRating').get(function () {
  if (this.ratingCount === 0) return 0;
  return (this.totalRating / this.ratingCount).toFixed(1);
});

module.exports = mongoose.model('Note', noteSchema);