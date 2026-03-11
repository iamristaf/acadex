const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:      { type: String, default: 'note_deleted' },
  message:   { type: String, required: true },
  noteTitle: { type: String, required: true },
  reason:    { type: String, required: true },
  deletedBy: { type: String, required: true }, // name of who deleted
  isRead:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);