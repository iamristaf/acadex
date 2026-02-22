const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const University = require('../models/University');
const { requireUniversityLogin } = require('../middleware/auth');

// University Register Page
router.get('/register', (req, res) => {
  res.render('uni-register', { error: null });
});

// University Register POST
router.post('/register', async (req, res) => {
  const { name, city, state, email, password } = req.body;
  try {
    const existing = await University.findOne({ email });
    if (existing) return res.render('uni-register', { error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    await University.create({ name, city, state, email, password: hashed });
    res.redirect('/university/login');
  } catch (err) {
    res.render('uni-register', { error: 'Something went wrong' });
  }
});

// University Login Page
router.get('/login', (req, res) => {
  res.render('uni-login', { error: null });
});

// University Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const uni = await University.findOne({ email });
    if (!uni) return res.render('uni-login', { error: 'University not found' });

    const match = await bcrypt.compare(password, uni.password);
    if (!match) return res.render('uni-login', { error: 'Incorrect password' });

    const token = jwt.sign({ id: uni._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('universityToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/university/dashboard');
  } catch (err) {
    res.render('uni-login', { error: 'Something went wrong' });
  }
});

// University Dashboard
router.get('/dashboard', requireUniversityLogin, async (req, res) => {
  const Note = require('../models/Note');
  const User = require('../models/User');
  const students = await User.find({ university: req.university._id });
  const notes = await Note.find({ university: req.university._id }).populate('uploader');
  res.render('uni-dashboard', { university: req.university, students, notes });
});

// University Logout
router.get('/logout', (req, res) => {
  res.clearCookie('universityToken');
  res.redirect('/');
});

module.exports = router;