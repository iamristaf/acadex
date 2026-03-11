const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const Admin        = require('../models/Admin');
const User         = require('../models/User');
const Note         = require('../models/Note');
const Notification = require('../models/Notification');
const cloudinary   = require('../config/cloudinary');

// ── Middleware: require admin login ───────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies.adminToken;
    if (!token) return res.redirect('/admin/login');
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
    const admin    = await Admin.findById(decoded.id);
    if (!admin) return res.redirect('/admin/login');
    req.admin = admin;
    next();
  } catch (e) {
    res.redirect('/admin/login');
  }
}

// ── Helper: check and apply purple/dual verification ─────────
async function checkAutoVerify(userId) {
  const user = await User.findById(userId);
  if (!user || user.role !== 'student') return;

  // Get all notes by this user
  const notes = await Note.find({ uploader: userId });
  const noteCount = notes.length;

  // Average note rating
  const ratedNotes   = notes.filter(n => n.ratingCount > 0);
  const avgNoteRating = ratedNotes.length > 0
    ? ratedNotes.reduce((s, n) => s + (n.totalRating / n.ratingCount), 0) / ratedNotes.length
    : 0;

  // Profile rating
  const profileRating = user.ratingCount > 0
    ? user.totalRating / user.ratingCount
    : 0;

  const meetsCriteria = noteCount >= 50 &&
                        profileRating >= 4.5 &&
                        avgNoteRating >= 4.5;

  if (meetsCriteria && !user.isPurpleVerified) {
    user.isPurpleVerified = true;
    // If also university verified → dual verified (green)
    if (user.isVerified) {
      user.isDualVerified = true;
    }
    await user.save();

    // Notify the user
    await Notification.create({
      user:      user._id,
      noteTitle: 'Account Verification',
      message:   user.isDualVerified
        ? '🟢 Congratulations! You are now Dual Verified on the platform!'
        : '🟣 Congratulations! You earned the Purple Verified badge!',
      reason:    'You met all three criteria: 50+ notes, 4.5+ profile rating, 4.5+ note ratings.',
      deletedBy: 'Platform'
    });
  }
}

// ── GET /admin/login ──────────────────────────────────────────
router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

// ── POST /admin/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res.render('admin/login', { error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, admin.password);
    if (!match)
      return res.render('admin/login', { error: 'Invalid email or password' });

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('adminToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.render('admin/login', { error: 'Something went wrong' });
  }
});

// ── GET /admin/logout ─────────────────────────────────────────
router.get('/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.redirect('/admin/login');
});

// ── GET /admin/dashboard ──────────────────────────────────────
router.get('/dashboard', requireAdmin, async (req, res) => {
  const students    = await User.find({ role: 'student' })
    .populate('university').sort({ createdAt: -1 });
  const notes       = await Note.find({ isDuplicate: false, isFlagResolved: false })
    .populate('uploader').populate('university').sort({ createdAt: -1 });
  const flaggedNotes = await Note.find({ isDuplicate: true, isFlagResolved: false })
    .populate('uploader').populate('university')
    .populate('duplicateOf').sort({ flaggedAt: -1 });
  const totalUsers  = await User.countDocuments();
  const totalNotes  = await Note.countDocuments();
  const bannedUsers = await User.countDocuments({ isBanned: true });
  const flaggedCount = await Note.countDocuments({ isDuplicate: true, isFlagResolved: false });

  res.render('admin/dashboard', {
    admin: req.admin,
    students,
    notes,
    flaggedNotes,
    stats: { totalUsers, totalNotes, bannedUsers, flaggedCount }
  });
});

// ── POST /admin/verify/:userId — manual blue verify ──────────
router.post('/verify/:userId', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, { isVerified: true });
  await checkDualStatus(req.params.userId);
  res.redirect('/admin/dashboard');
});

// ── POST /admin/purple-verify/:userId — manual purple verify ─
router.post('/purple-verify/:userId', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (user) {
    user.isPurpleVerified = true;
    if (user.isVerified) user.isDualVerified = true;
    await user.save();
    await Notification.create({
      user:      user._id,
      noteTitle: 'Verification Update',
      message:   user.isDualVerified
        ? '🟢 You have been Dual Verified by the platform admin!'
        : '🟣 You have been Purple Verified by the platform admin!',
      reason:    'Manually verified by platform admin.',
      deletedBy: 'Platform Admin'
    });
  }
  res.redirect('/admin/dashboard');
});

// ── POST /admin/dual-verify/:userId — manual dual verify ─────
router.post('/dual-verify/:userId', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (user) {
    user.isVerified       = true;
    user.isPurpleVerified = true;
    user.isDualVerified   = true;
    await user.save();
    await Notification.create({
      user:      user._id,
      noteTitle: 'Verification Update',
      message:   '🟢 You have been Dual Verified by the platform admin!',
      reason:    'Manually dual verified by platform admin.',
      deletedBy: 'Platform Admin'
    });
  }
  res.redirect('/admin/dashboard');
});

// ── POST /admin/unverify/:userId ──────────────────────────────
router.post('/unverify/:userId', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, {
    isVerified: false, isPurpleVerified: false, isDualVerified: false
  });
  res.redirect('/admin/dashboard');
});

// ── POST /admin/ban/:userId ───────────────────────────────────
router.post('/ban/:userId', requireAdmin, async (req, res) => {
  const { reason } = req.body;
  await User.findByIdAndUpdate(req.params.userId, {
    isBanned:  true,
    isVerified: false,
    isPurpleVerified: false,
    isDualVerified: false,
    banReason: reason || 'Banned by platform admin'
  });
  res.redirect('/admin/dashboard');
});

// ── POST /admin/unban/:userId ─────────────────────────────────
router.post('/unban/:userId', requireAdmin, async (req, res) => {
  await User.findByIdAndUpdate(req.params.userId, {
    isBanned: false, banReason: null
  });
  res.redirect('/admin/dashboard');
});

// ── POST /admin/delete-note/:id ───────────────────────────────
router.post('/delete-note/:id', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const note = await Note.findById(req.params.id).populate('uploader');
    if (!note) return res.redirect('/admin/dashboard');

    await Notification.create({
      user:      note.uploader._id,
      noteTitle: note.title,
      message:   `Your note "${note.title}" was removed by Platform Admin.`,
      reason:    reason || 'Removed by platform admin',
      deletedBy: 'Platform Admin'
    });

    if (note.filePublicId) {
      await cloudinary.uploader.destroy(note.filePublicId, { resource_type: 'raw' });
    }
    await note.deleteOne();
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.redirect('/admin/dashboard');
  }
});

// ── Helper: recheck dual status ───────────────────────────────
async function checkDualStatus(userId) {
  const user = await User.findById(userId);
  if (user && user.isVerified && user.isPurpleVerified) {
    user.isDualVerified = true;
    await user.save();
  }
}

// ── POST /admin/flag-resolve/:id — mark as not duplicate ─────
router.post('/flag-resolve/:id', requireAdmin, async (req, res) => {
  await Note.findByIdAndUpdate(req.params.id, {
    isDuplicate:    false,
    isFlagResolved: true,
    duplicateOf:    null,
    duplicateSimilarity: null
  });
  res.redirect('/admin/dashboard');
});

// ── POST /admin/flag-delete/:id — confirm and delete ─────────
router.post('/flag-delete/:id', requireAdmin, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id).populate('uploader');
    if (!note) return res.redirect('/admin/dashboard');

    await Notification.create({
      user:      note.uploader._id,
      noteTitle: note.title,
      message:   `Your note "${note.title}" was removed — duplicate content detected.`,
      reason:    `${note.duplicateSimilarity}% similarity with an existing note on the platform.`,
      deletedBy: 'Platform Admin'
    });

    if (note.filePublicId) {
      await cloudinary.uploader.destroy(note.filePublicId, { resource_type: 'raw' });
    }
    await note.deleteOne();
    res.redirect('/admin/dashboard');
  } catch (err) {
    res.redirect('/admin/dashboard');
  }
});

module.exports = { router, checkAutoVerify };