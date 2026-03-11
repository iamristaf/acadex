const express      = require('express');
const router       = express.Router();
const multer       = require('multer');
const https        = require('https');
const http         = require('http');
const jwt          = require('jsonwebtoken');
const Note         = require('../models/Note');
const User         = require('../models/User');
const University   = require('../models/University');
const Notification = require('../models/Notification');
const cloudinary   = require('../config/cloudinary');
const { requireUserLogin } = require('../middleware/auth');
const { checkAutoVerify } = require('./admin');
const crypto   = require('crypto');
const pdfParse = require('pdf-parse');

// ── Multer setup ──────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files allowed'));
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ── Cloudinary upload helper ──────────────────────────────────
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

// ── Helper: get logged in user from cookie (optional) ─────────
async function getOptionalUser(req) {
  try {
    const token = req.cookies.studentToken;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.id).populate('university');
  } catch (e) {
    return null;
  }
}


// ── Generate MD5 hash of file buffer ─────────────────────────
function generateHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

// ── Extract text from PDF buffer ──────────────────────────────
async function extractPdfText(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim().toLowerCase().replace(/\s+/g, ' ');
  } catch (e) {
    return null;
  }
}

// ── Cosine similarity between two strings ────────────────────
function cosineSimilarity(textA, textB) {
  if (!textA || !textB) return 0;

  const tokenize = t => t.split(' ').reduce((acc, w) => {
    acc[w] = (acc[w] || 0) + 1;
    return acc;
  }, {});

  const vecA   = tokenize(textA);
  const vecB   = tokenize(textB);
  const allWords = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);

  let dotProduct = 0, magA = 0, magB = 0;
  allWords.forEach(w => {
    const a = vecA[w] || 0;
    const b = vecB[w] || 0;
    dotProduct += a * b;
    magA       += a * a;
    magB       += b * b;
  });

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Check duplicate against existing notes ───────────────────
async function checkDuplicate(fileHash, extractedText, excludeId = null) {
  const result = {
    isDuplicate: false,
    duplicateOf: null,
    similarity:  0,
    method:      null
  };

  // Step 1 — exact hash match
  const hashQuery = { fileHash };
  if (excludeId) hashQuery._id = { $ne: excludeId };
  const exactMatch = await Note.findOne(hashQuery);
  if (exactMatch) {
    result.isDuplicate = true;
    result.duplicateOf = exactMatch._id;
    result.similarity  = 100;
    result.method      = 'hash';
    return result;
  }

  // Step 2 — text similarity check
  if (!extractedText || extractedText.length < 100) return result;

  const notesQuery = { extractedText: { $ne: null } };
  if (excludeId) notesQuery._id = { $ne: excludeId };
  const allNotes = await Note.find(notesQuery).select('_id extractedText title');

  for (const note of allNotes) {
    if (!note.extractedText) continue;
    const sim = cosineSimilarity(extractedText, note.extractedText);
    if (sim >= 0.85) {
      result.isDuplicate = true;
      result.duplicateOf = note._id;
      result.similarity  = Math.round(sim * 100);
      result.method      = 'text';
      return result;
    }
  }

  return result;
}

// ── GET /notes/pdf/:id — PDF proxy ────────────────────────────
router.get('/pdf/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).send('Note not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    const client = note.fileUrl.startsWith('https') ? https : http;
    client.get(note.fileUrl, (stream) => {
      stream.pipe(res);
    }).on('error', () => res.status(500).send('Could not load PDF'));
  } catch (err) {
    res.status(500).send('Error loading PDF');
  }
});

// ── GET /notes/browse ─────────────────────────────────────────
router.get('/browse', async (req, res) => {
  try {
    const { university, subject, semester, type } = req.query;
    const filter = {};
    if (university) filter.university = university;
    if (subject)    filter.subject    = new RegExp(subject, 'i');
    if (semester)   filter.semester   = semester;
    if (type)       filter.type       = type;

    const notes = await Note.find(filter)
      .populate({ path: 'uploader', select: 'name role isVerified isPurpleVerified isDualVerified isIndependent university' })
      .populate('university', 'name city')
      .sort({ createdAt: -1 });

    // Priority sort: verified teacher (3) > verified student (2) > rest (1)
    notes.sort((a, b) => {
      const score = u => (u?.role === 'teacher' && u?.isVerified) ? 3
                       : u?.isVerified ? 2 : 1;
      return score(b.uploader) - score(a.uploader);
    });

    const universities = await University.find().sort('name');
    const currentUser  = await getOptionalUser(req);

    res.render('browse', { notes, universities, query: req.query, currentUser });
  } catch (err) {
    console.error(err);
    res.redirect('/');
  }
});

// ── GET /notes/view/:id ───────────────────────────────────────
router.get('/view/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('uploader')
      .populate('university');
    if (!note) return res.redirect('/notes/browse');

    // ── Access control for restricted notes ──────────────────
    if (note.isRestricted) {
      let canView = false;

      // Check university admin cookie
      const uniToken = req.cookies.universityToken;
      if (uniToken) {
        try {
          const decoded = jwt.verify(uniToken, process.env.JWT_SECRET);
          const uni = await University.findById(decoded.id);
          if (uni && note.university &&
              uni._id.toString() === note.university._id.toString()) {
            canView = true;
          }
        } catch (e) {}
      }

      // Check student/teacher cookie
      if (!canView) {
        const stuToken = req.cookies.studentToken;
        if (stuToken) {
          try {
            const decoded = jwt.verify(stuToken, process.env.JWT_SECRET);
            const viewer  = await User.findById(decoded.id).populate('university');
            if (
              viewer &&
              viewer.isVerified &&
              viewer.university &&
              note.university &&
              viewer.university._id.toString() === note.university._id.toString()
            ) {
              canView = true;
            }
          } catch (e) {}
        }
      }

      if (!canView) {
        return res.render('restricted', {
          note,
          message: `This note is restricted to verified students of ${note.university?.name || 'its university'} only.`
        });
      }
    }

    // ── Allowed — increment views and render ─────────────────
    note.views += 1;
    await note.save();

    const user = await getOptionalUser(req);
    res.render('viewer', { note, user });

  } catch (err) {
    res.redirect('/notes/browse');
  }
});

// ── GET /notes/upload ─────────────────────────────────────────
router.get('/upload', requireUserLogin, (req, res) => {
  res.render('upload', { user: req.user, error: null, success: null });
});

// ── POST /notes/upload ────────────────────────────────────────
router.post('/upload', requireUserLogin, upload.single('pdf'), async (req, res) => {
  try {
    const { title, subject, semester, type } = req.body;

    if (!req.file)
      return res.render('upload', {
        user: req.user, error: 'Please select a PDF file.', success: null
      });

    const isRestricted = (req.user.role === 'teacher' && req.user.isVerified)
      ? req.body.isRestricted === 'true'
      : false;

    // ── Step 1: Generate hash ─────────────────────────────────
    const fileHash = generateHash(req.file.buffer);

    // ── Step 2: Extract text ──────────────────────────────────
    const extractedText = await extractPdfText(req.file.buffer);

    // ── Step 3: Check for duplicates ──────────────────────────
    const dupCheck = await checkDuplicate(fileHash, extractedText);

    // ── Step 4: Upload to Cloudinary ──────────────────────────
    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    // ── Step 5: Save note ─────────────────────────────────────
    const note = await Note.create({
      title, subject, semester, type,
      fileUrl:      result.secure_url,
      filePublicId: result.public_id,
      uploader:     req.user._id,
      university:   req.user.university ? req.user.university._id : null,
      isRestricted,
      fileHash,
      extractedText: extractedText ? extractedText.substring(0, 5000) : null,
      isDuplicate:   dupCheck.isDuplicate,
      duplicateOf:   dupCheck.duplicateOf,
      duplicateSimilarity: dupCheck.similarity,
      flaggedAt:     dupCheck.isDuplicate ? new Date() : null
    });

    // ── Step 6: Notify admin if duplicate ─────────────────────
    if (dupCheck.isDuplicate) {
      const Admin = require('../models/Admin');
      const admin = await Admin.findOne();
      if (admin) {
        await Notification.create({
          user:      req.user._id,
          noteTitle: title,
          message:   `⚠️ Duplicate note flagged: "${title}" uploaded by ${req.user.name}`,
          reason:    dupCheck.method === 'hash'
            ? 'Exact duplicate file detected (100% match)'
            : `Similar content detected (${dupCheck.similarity}% similarity)`,
          deletedBy: 'System'
        });
      }

      return res.render('upload', {
        user: req.user,
        error: null,
        success: `⚠️ Note uploaded but flagged for review — our system detected ${
          dupCheck.method === 'hash' ? 'an identical file' : `${dupCheck.similarity}% similar content`
        } already exists on the platform. Admin will review it shortly.`
      });
    }

    // ── Auto check purple verify ──────────────────────────────
    const { checkAutoVerify } = require('./admin');
    await checkAutoVerify(req.user._id);

    res.render('upload', {
      user: req.user,
      error: null,
      success: isRestricted
        ? '✅ Note uploaded! Restricted to verified students of your university.'
        : '✅ Note uploaded successfully! Visible to everyone.'
    });

  } catch (err) {
    console.error('UPLOAD ERROR:', err.message);
    res.render('upload', {
      user: req.user, error: 'Upload failed: ' + err.message, success: null
    });
  }
});

// ── POST /notes/delete/:id — uploader deletes own note ────────
router.post('/delete/:id', requireUserLogin, async (req, res) => {
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

// ── POST /notes/rate/:id — rate a note ───────────────────────
router.post('/rate/:id', requireUserLogin, async (req, res) => {
  const s = parseInt(req.body.stars);
  if (s < 1 || s > 5) return res.redirect('back');
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.redirect('back');

    const already = note.ratings.find(
      r => r.user.toString() === req.user._id.toString()
    );
    if (already) {
      note.totalRating = note.totalRating - already.stars + s;
      already.stars = s;
    } else {
      note.ratings.push({ user: req.user._id, stars: s });
      note.totalRating += s;
      note.ratingCount += 1;
    }
    await note.save();
    await checkAutoVerify(note.uploader.toString());
    res.redirect(`/notes/view/${req.params.id}`);
  } catch (err) {
    res.redirect('back');
  }
});

// ── POST /notes/moderate-delete/:id — teacher or uni admin ───
router.post('/moderate-delete/:id', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim() === '') return res.redirect('back');

    let deleterName  = null;
    let isAuthorised = false;

    // Check university admin cookie
    const uniToken = req.cookies.universityToken;
    if (uniToken) {
      try {
        const decoded = jwt.verify(uniToken, process.env.JWT_SECRET);
        const uni     = await University.findById(decoded.id);
        if (uni) {
          isAuthorised = true;
          deleterName  = `${uni.name} (University Admin)`;
        }
      } catch (e) {}
    }

    // Check verified teacher cookie
    if (!isAuthorised) {
      const stuToken = req.cookies.studentToken;
      if (stuToken) {
        try {
          const decoded = jwt.verify(stuToken, process.env.JWT_SECRET);
          const teacher = await User.findById(decoded.id).populate('university');
          if (teacher && teacher.role === 'teacher' && teacher.isVerified) {
            const note = await Note.findById(req.params.id);
            if (
              note && teacher.university && note.university &&
              note.university.toString() === teacher.university._id.toString()
            ) {
              isAuthorised = true;
              deleterName  = `${teacher.name} (Verified Teacher)`;
            }
          }
        } catch (e) {}
      }
    }

    if (!isAuthorised) return res.status(403).send('Not authorised');

    const note = await Note.findById(req.params.id).populate('uploader');
    if (!note) return res.redirect('back');

    // Create notification for the uploader
    await Notification.create({
      user:      note.uploader._id,
      noteTitle: note.title,
      message:   `Your note "${note.title}" was removed by ${deleterName}.`,
      reason:    reason.trim(),
      deletedBy: deleterName
    });

    // Delete from Cloudinary
    if (note.filePublicId) {
      await cloudinary.uploader.destroy(note.filePublicId, { resource_type: 'raw' });
    }

    await note.deleteOne();

    const referer = req.headers.referer || '/notes/browse';
    res.redirect(referer);

  } catch (err) {
    console.error('Moderate delete error:', err);
    res.redirect('back');
  }
});

module.exports = router;