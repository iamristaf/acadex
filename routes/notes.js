const express = require('express');
const router = express.Router();
const multer = require('multer');
const https = require('https');
const http = require('http');
const Note = require('../models/Note');
const University = require('../models/University');
const { requireStudentLogin } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');

// Multer — store in memory
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

// Helper — upload buffer to Cloudinary
function uploadToCloudinary(buffer, filename) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'noteshare-pdfs',
        resource_type: 'raw',
        public_id: Date.now() + '-' + filename.replace('.pdf', ''),
        format: 'pdf',
        access_mode: 'public'
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// PDF Proxy Route
router.get('/pdf/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).send('Note not found');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');

    const client = note.fileUrl.startsWith('https') ? https : http;
    client.get(note.fileUrl, (stream) => {
      stream.pipe(res);
    }).on('error', (err) => {
      console.error('Proxy error:', err);
      res.status(500).send('Could not load PDF');
    });
  } catch (err) {
    res.status(500).send('Error loading PDF');
  }
});

// Browse Notes
router.get('/browse', async (req, res) => {
  try {
    const { university, subject, semester, type } = req.query;
    const filter = {};
    if (university) filter.university = university;
    if (subject) filter.subject = new RegExp(subject, 'i');
    if (semester) filter.semester = semester;
    if (type) filter.type = type;

    const notes = await Note.find(filter).populate('uploader').populate('university');
    const universities = await University.find();
    res.render('browse', { notes, universities, query: req.query });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// View a Note
router.get('/view/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id).populate('uploader').populate('university');
    if (!note) return res.redirect('/notes/browse');
    note.views += 1;
    await note.save();
    res.render('viewer', { note });
  } catch (err) {
    res.redirect('/notes/browse');
  }
});

// Upload Page
router.get('/upload', requireStudentLogin, (req, res) => {
  res.render('upload', { user: req.user, error: null, success: null });
});

// Upload POST
router.post('/upload', requireStudentLogin, upload.single('pdf'), async (req, res) => {
  const { title, subject, semester, type } = req.body;
  try {
    if (!req.file) {
      return res.render('upload', { user: req.user, error: 'Please select a PDF file.', success: null });
    }

    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);
    console.log('Cloudinary URL:', result.secure_url);

    await Note.create({
      title,
      subject,
      semester,
      type,
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      uploader: req.user._id,
      university: req.user.university ? req.user.university._id : null
    });

    res.render('upload', { user: req.user, error: null, success: 'Note uploaded successfully!' });
  } catch (err) {
    console.error('UPLOAD ERROR:', err.message);
    res.render('upload', { user: req.user, error: 'Upload failed: ' + err.message, success: null });
  }
});

// Delete Note
router.post('/delete/:id', requireStudentLogin, async (req, res) => {
  try {
    const note = await Note.findOne({ _id: req.params.id, uploader: req.user._id });
    if (note) {
      if (note.filePublicId) {
        await cloudinary.uploader.destroy(note.filePublicId, { resource_type: 'raw' });
      }
      await note.deleteOne();
    }
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/dashboard');
  }
});

module.exports = router;