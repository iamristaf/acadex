const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const University = require('../models/University');
const User       = require('../models/User');
const Note       = require('../models/Note');
const { requireUniversityLogin } = require('../middleware/auth');

router.get('/register', (req, res) => res.render('uni-register', { error: null }));

router.post('/register', async (req, res) => {
  const { name, city, state, email, password } = req.body;
  try {
    const existing = await University.findOne({ email });
    if (existing) return res.render('uni-register', { error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    await University.create({ name, city, state, email, password: hashed });
    res.redirect('/university/login');
  } catch (err) {
    res.render('uni-register', { error: err.message });
  }
});

router.get('/login', (req, res) => res.render('uni-login', { error: null }));

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const uni = await University.findOne({ email });
    if (!uni) return res.render('uni-login', { error: 'University not found' });
    const match = await bcrypt.compare(password, uni.password);
    if (!match) return res.render('uni-login', { error: 'Incorrect password' });
    const token = jwt.sign({ id: uni._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('universityToken', token, { httpOnly: true, maxAge: 7*24*60*60*1000 });
    res.redirect('/university/dashboard');
  } catch (err) {
    res.render('uni-login', { error: 'Something went wrong' });
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('universityToken');
  res.redirect('/');
});

// GET /university/dashboard
router.get('/dashboard', requireUniversityLogin, async (req, res) => {
  const students = await User.find({ university: req.university._id, role: 'student' }).sort({ createdAt: -1 });
  const teachers = await User.find({ university: req.university._id, role: 'teacher' }).sort({ createdAt: -1 });
  const notes    = await Note.find({ university: req.university._id })
    .populate('uploader')
    .sort({ createdAt: -1 });
  res.render('uni-dashboard', { university: req.university, students, teachers, notes });
});

// POST /university/verify/:userId — verify a student or teacher
router.post('/verify/:userId', requireUniversityLogin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, university: req.university._id });
  if (!user) return res.redirect('/university/dashboard');
  user.isVerified = true;
  user.verifiedAt = new Date();
  await user.save();
  res.redirect('/university/dashboard');
});

// POST /university/unverify/:userId — remove verification
router.post('/unverify/:userId', requireUniversityLogin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, university: req.university._id });
  if (!user) return res.redirect('/university/dashboard');
  user.isVerified = false;
  user.verifiedAt = null;
  await user.save();
  res.redirect('/university/dashboard');
});

// POST /university/ban/:userId — ban a user
router.post('/ban/:userId', requireUniversityLogin, async (req, res) => {
  const { reason } = req.body;
  const user = await User.findOne({ _id: req.params.userId, university: req.university._id });
  if (!user) return res.redirect('/university/dashboard');
  user.isBanned   = true;
  user.bannedAt   = new Date();
  user.banReason  = reason || 'Banned by university admin';
  user.isVerified = false;
  await user.save();
  res.redirect('/university/dashboard');
});

// POST /university/unban/:userId — unban a user
router.post('/unban/:userId', requireUniversityLogin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, university: req.university._id });
  if (!user) return res.redirect('/university/dashboard');
  user.isBanned  = false;
  user.bannedAt  = null;
  user.banReason = null;
  await user.save();
  res.redirect('/university/dashboard');
});

// POST /university/remove/:userId — remove user from university
router.post('/remove/:userId', requireUniversityLogin, async (req, res) => {
  const user = await User.findOne({ _id: req.params.userId, university: req.university._id });
  if (!user) return res.redirect('/university/dashboard');
  user.university    = null;
  user.isVerified    = false;
  user.isIndependent = true;
  await user.save();
  res.redirect('/university/dashboard');
});

module.exports = router;