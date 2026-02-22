const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const University = require('../models/University');
const { requireStudentLogin } = require('../middleware/auth');

// Home Page
router.get('/', (req, res) => {
  res.render('index');
});

// Student Register Page
router.get('/register', async (req, res) => {
  const universities = await University.find();
  res.render('register', { universities, error: null });
});

// Student Register POST
router.post('/register', async (req, res) => {
  const universities = await University.find();
  const { name, email, password, universityId, isIndependent } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.render('register', { universities, error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashed,
      university: isIndependent ? null : universityId || null,
      isIndependent: isIndependent ? true : false
    });

    await user.save();
    res.redirect('/login');
  } catch (err) {
    res.render('register', { universities, error: 'Something went wrong' });
  }
});

// Student Login Page
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Student Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.render('login', { error: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render('login', { error: 'Incorrect password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('studentToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/dashboard');
  } catch (err) {
    res.render('login', { error: 'Something went wrong' });
  }
});

// Student Logout
router.get('/logout', (req, res) => {
  res.clearCookie('studentToken');
  res.redirect('/');
});

// Student Dashboard
router.get('/dashboard', requireStudentLogin, async (req, res) => {
  const Note = require('../models/Note');
  const myNotes = await Note.find({ uploader: req.user._id }).populate('university');
  res.render('dashboard', { user: req.user, myNotes });
});

module.exports = router;