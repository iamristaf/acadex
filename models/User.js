const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  email:         { type: String, required: true, unique: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ['student', 'teacher'], default: 'student' },
  university:    { type: mongoose.Schema.Types.ObjectId, ref: 'University', default: null },
  isIndependent: { type: Boolean, default: false },

  // Verification
  isVerified:    { type: Boolean, default: false },
  verifiedAt:    { type: Date, default: null },

  // Ban
  isBanned:      { type: Boolean, default: false },
  bannedAt:      { type: Date, default: null },
  banReason:     { type: String, default: null },

  // Teacher specific
  employeeId:    { type: String, default: null },
  department:    { type: String, default: null },

  profilePhoto: { type: String, default: null }, // Cloudinary URL

  // Verification levels
isVerified:      { type: Boolean, default: false },   // blue — university verified
isPurpleVerified:{ type: Boolean, default: false },   // purple — criteria based
isDualVerified:  { type: Boolean, default: false },   // green — both combined

// Ban
isBanned:        { type: Boolean, default: false },
banReason:       { type: String, default: null },

// Profile
profilePhoto:    { type: String, default: null },
totalRating:     { type: Number, default: 0 },
ratingCount:     { type: Number, default: 0 },

// Note count cache for auto purple verify
noteCount:       { type: Number, default: 0 },

  // Profile rating
  totalRating:   { type: Number, default: 0 },
  ratingCount:   { type: Number, default: 0 },

  createdAt:     { type: Date, default: Date.now }
});



// Virtual: average profile rating
userSchema.virtual('avgRating').get(function () {
  if (this.ratingCount === 0) return 0;
  return (this.totalRating / this.ratingCount).toFixed(1);
});

module.exports = mongoose.model('User', userSchema);