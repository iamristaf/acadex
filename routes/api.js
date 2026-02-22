const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const University = require('../models/University');
const Note = require('../models/Note');

// ── Middleware: verify JWT from Authorization header ──────────────
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('university');
    if (!req.user) return res.status(401).json({ error: 'User not found' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ════════════════════════════════════════════════════════
// AUTH ROUTES
// ════════════════════════════════════════════════════════

// POST /api/register — Student registration
router.post('/register', async (req, res) => {
  const { name, email, password, universityId, isIndependent } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email,
      password: hashed,
      university: isIndependent ? null : universityId || null,
      isIndependent: isIndependent ? true : false
    });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, isIndependent: user.isIndependent }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/login — Student login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email }).populate('university');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isIndependent: user.isIndependent,
        university: user.university ? {
          id: user.university._id,
          name: user.university.name,
          city: user.university.city
        } : null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/me — Get logged in user profile
router.get('/me', verifyToken, async (req, res) => {
  res.json({
    id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    isIndependent: req.user.isIndependent,
    university: req.user.university ? {
      id: req.user.university._id,
      name: req.user.university.name,
      city: req.user.university.city
    } : null
  });
});

// ════════════════════════════════════════════════════════
// UNIVERSITY ROUTES
// ════════════════════════════════════════════════════════

// GET /api/universities — Get all universities
router.get('/universities', async (req, res) => {
  try {
    const universities = await University.find().select('-password');
    res.json(universities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════
// NOTES ROUTES
// ════════════════════════════════════════════════════════

// GET /api/notes — Browse notes with filters
router.get('/notes', async (req, res) => {
  try {
    const { university, subject, semester, type, search } = req.query;
    const filter = {};
    if (university) filter.university = university;
    if (semester) filter.semester = semester;
    if (type) filter.type = type;
    if (subject) filter.subject = new RegExp(subject, 'i');
    if (search) filter.title = new RegExp(search, 'i');

    const notes = await Note.find(filter)
      .populate('uploader', 'name email')
      .populate('university', 'name city')
      .sort({ createdAt: -1 });

    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id — Get single note
router.get('/notes/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('uploader', 'name email')
      .populate('university', 'name city');
    if (!note) return res.status(404).json({ error: 'Note not found' });
    note.views += 1;
    await note.save();
    res.json(note);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/my-notes — Get notes uploaded by logged in student
router.get('/my-notes', verifyToken, async (req, res) => {
  try {
    const notes = await Note.find({ uploader: req.user._id })
      .populate('university', 'name city')
      .sort({ createdAt: -1 });
    res.json(notes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id — Delete a note
router.delete('/notes/:id', verifyToken, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, uploader: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found or not authorized' });
    await note.deleteOne();
    res.json({ message: 'Note deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats — Dashboard stats for logged in student
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const notes = await Note.find({ uploader: req.user._id });
    const totalNotes = notes.length;
    const totalViews = notes.reduce((sum, n) => sum + n.views, 0);
    res.json({ totalNotes, totalViews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;