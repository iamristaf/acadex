const express      = require('express');
const router       = express.Router();
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const User         = require('../models/User');
const Note         = require('../models/Note');
const University   = require('../models/University');
const Notification = require('../models/Notification');
const { requireUserLogin } = require('../middleware/auth');

// ── GET / — Landing page ──────────────────────────────────────
router.get('/', (req, res) => res.render('index'));

// ── GET /register ─────────────────────────────────────────────
router.get('/register', async (req, res) => {
  const universities = await University.find().sort('name');
  res.render('register', { universities, error: null });
});

// ── POST /register ────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const universities = await University.find().sort('name');
  const { name, email, password, role, universityId,
          isIndependent, employeeId, department } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing)
      return res.render('register', { universities, error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    await User.create({
      name,
      email,
      password:      hashed,
      role:          role || 'student',
      university:    isIndependent ? null : universityId || null,
      isIndependent: !!isIndependent,
      employeeId:    role === 'teacher' ? employeeId : null,
      department:    role === 'teacher' ? department : null,
    });
    res.redirect('/login');
  } catch (err) {
    res.render('register', { universities, error: 'Error: ' + err.message });
  }
});

// ── GET /login ────────────────────────────────────────────────
router.get('/login', (req, res) => {
  const error = req.query.error === 'banned'
    ? 'Your account has been banned. Contact your university admin.'
    : null;
  res.render('login', { error });
});

// ── POST /login ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email }).populate('university');
    if (!user)
      return res.render('login', { error: 'No account found with this email' });

    if (user.isBanned)
      return res.render('login', {
        error: 'Your account has been banned by your university admin.'
      });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.render('login', { error: 'Incorrect password' });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.cookie('studentToken', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/dashboard');
  } catch (err) {
    res.render('dashboard', { user: req.user, myNotes, notifications });
  }
});

// ── GET /dashboard ────────────────────────────────────────────
router.get('/dashboard', requireUserLogin, async (req, res) => {
  try {
    const myNotes = await Note.find({ uploader: req.user._id })
      .populate('university')
      .sort({ createdAt: -1 });

    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(10);

    // Mark all as read after fetching
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true }
    );

    res.render('dashboard', { user: req.user, myNotes, notifications });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.redirect('/');
  }
});

// ── GET /logout ───────────────────────────────────────────────
router.get('/logout', (req, res) => {
  res.clearCookie('studentToken');
  res.redirect('/');
});

// ── GET /profile/:userId — Public profile page ────────────────
router.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await User.findById(req.params.userId)
  .populate('university')
  .select('-password');
    if (!profile) return res.status(404).send('User not found');

    const notes = await Note.find({ uploader: profile._id })
      .populate('university')
      .sort({ createdAt: -1 });

    const user = await (async () => {
      try {
        const token = req.cookies.studentToken;
        if (!token) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return await User.findById(decoded.id);
      } catch (e) { return null; }
    })();

    res.render('profile', { profile, notes, user });
  } catch (err) {
    res.status(404).send('User not found');
  }
});

// ── POST /rate-profile/:userId — Rate a user's profile ───────
router.post('/rate-profile/:userId', requireUserLogin, async (req, res) => {
  const targetId = req.params.userId;

  // Can't rate yourself
  if (targetId === req.user._id.toString())
    return res.redirect(`/profile/${targetId}`);

  const s = parseInt(req.body.stars);
  if (s < 1 || s > 5) return res.redirect(`/profile/${targetId}`);

  try {
    const target = await User.findById(targetId);
    if (!target) return res.redirect('back');

    target.totalRating += s;
    target.ratingCount += 1;
    await target.save();

    res.redirect(`/profile/${targetId}`);
  } catch (err) {
    res.redirect('back');
  }
});

// POST /notifications/delete/:id
router.post('/notifications/delete/:id', requireUserLogin, async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id
    });
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/dashboard');
  }
});

// POST /notifications/delete-all
router.post('/notifications/delete-all', requireUserLogin, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/dashboard');
  }
});

const multer = require('multer');
const photoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// Helper — upload image buffer to Cloudinary
function uploadPhotoToCloudinary(buffer, userId) {
  return new Promise((resolve, reject) => {
    const cloudinary = require('../config/cloudinary');
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'noteshare-profiles',
        resource_type: 'image',
        public_id: 'user-' + userId + '-' + Date.now(),
        transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// GET /edit-profile
router.get('/edit-profile', requireUserLogin, (req, res) => {
  res.render('edit-profile', { user: req.user, error: null, success: null });
});

// POST /edit-profile
router.post('/edit-profile', requireUserLogin, photoUpload.single('photo'), async (req, res) => {
  try {
    const { name, department } = req.body;
    const user = await User.findById(req.user._id);

    if (!name || name.trim() === '') {
      return res.render('edit-profile', {
        user: req.user, error: 'Name cannot be empty', success: null
      });
    }

    user.name = name.trim();
    if (req.user.role === 'teacher' && department) {
      user.department = department.trim();
    }

    // Upload new photo if provided
    if (req.file) {
      // Delete old photo from Cloudinary if exists
      if (user.profilePhoto) {
        try {
          const cloudinary = require('../config/cloudinary');
          // Extract public_id from URL
          const parts    = user.profilePhoto.split('/');
          const filename = parts[parts.length - 1].split('.')[0];
          const publicId = 'noteshare-profiles/' + filename;
          await cloudinary.uploader.destroy(publicId);
        } catch (e) {}
      }

      const result      = await uploadPhotoToCloudinary(req.file.buffer, user._id);
      user.profilePhoto = result.secure_url;
    }

    await user.save();

    res.render('edit-profile', {
      user,
      error: null,
      success: 'Profile updated successfully!'
    });

  } catch (err) {
    console.error('Edit profile error:', err);
    res.render('edit-profile', {
      user: req.user,
      error: 'Something went wrong: ' + err.message,
      success: null
    });
  }
});

module.exports = router;