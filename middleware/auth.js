const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const University = require('../models/University');

const requireStudentLogin = async (req, res, next) => {
  const token = req.cookies.studentToken;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('university');
    if (!user) return res.redirect('/login');
    if (user.isBanned) {
      res.clearCookie('studentToken');
      return res.redirect('/login?error=banned');
    }
    req.user = user;
    next();
  } catch (err) { res.redirect('/login'); }
};

// Works for both student AND teacher (any non-university user)
const requireUserLogin = async (req, res, next) => {
  const token = req.cookies.studentToken;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('university');
    if (!user) return res.redirect('/login');
    if (user.isBanned) {
      res.clearCookie('studentToken');
      return res.redirect('/login?error=banned');
    }
    req.user = user;
    next();
  } catch (err) { res.redirect('/login'); }
};

const requireTeacherLogin = async (req, res, next) => {
  const token = req.cookies.studentToken;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('university');
    if (!user || user.role !== 'teacher') return res.redirect('/login');
    if (user.isBanned) {
      res.clearCookie('studentToken');
      return res.redirect('/login?error=banned');
    }
    req.user = user;
    next();
  } catch (err) { res.redirect('/login'); }
};

const requireUniversityLogin = async (req, res, next) => {
  const token = req.cookies.universityToken;
  if (!token) return res.redirect('/university/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.university = await University.findById(decoded.id);
    if (!req.university) return res.redirect('/university/login');
    next();
  } catch (err) { res.redirect('/university/login'); }
};

module.exports = {
  requireStudentLogin,
  requireUserLogin,
  requireTeacherLogin,
  requireUniversityLogin
};