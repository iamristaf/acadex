// ── Load env FIRST before anything else ──────────────────────
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });

const express      = require('express');
const mongoose     = require('mongoose');
const path         = require('path');
const cookieParser = require('cookie-parser');
const jwt          = require('jsonwebtoken');
const User         = require('./models/User');
const University   = require('./models/University');
const Admin        = require('./models/Admin');
const { router: adminRouter } = require('./routes/admin');

const app = express();

// ── Core Middleware ───────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── View Engine ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Database Connection ───────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.log('❌ DB Error:', err));

// ── Auth Locals Middleware ────────────────────────────────────
// ONE single middleware block — handles all three user types
app.use(async (req, res, next) => {
  res.locals.currentUser       = null;
  res.locals.currentUniversity = null;
  res.locals.currentAdmin      = null;

  try {
    const stuToken = req.cookies.studentToken;
    if (stuToken) {
      const decoded = jwt.verify(stuToken, process.env.JWT_SECRET);
      res.locals.currentUser = await User.findById(decoded.id).populate('university');
    }
  } catch (e) {}

  try {
    const uniToken = req.cookies.universityToken;
    if (uniToken) {
      const decoded = jwt.verify(uniToken, process.env.JWT_SECRET);
      res.locals.currentUniversity = await University.findById(decoded.id);
    }
  } catch (e) {}

  try {
    const adminToken = req.cookies.adminToken;
    if (adminToken) {
      const decoded = jwt.verify(adminToken, process.env.JWT_SECRET);
      res.locals.currentAdmin = await Admin.findById(decoded.id);
    }
  } catch (e) {}

  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/notes', require('./routes/notes'));
app.use('/university', require('./routes/university'));
app.use('/admin', adminRouter);
app.use('/', require('./routes/contact'));

// ── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});