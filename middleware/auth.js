const jwt = require('jsonwebtoken');
const User = require('../models/User');
const University = require('../models/University');

// Protect student routes
const requireStudentLogin = async (req, res, next) => {
  const token = req.cookies.studentToken;
  if (!token) return res.redirect('/login');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('university');
    if (!req.user) return res.redirect('/login');
    next();
  } catch (err) {
    res.redirect('/login');
  }
};

// Protect university routes
const requireUniversityLogin = async (req, res, next) => {
  const token = req.cookies.universityToken;
  if (!token) return res.redirect('/university/login');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.university = await University.findById(decoded.id);
    if (!req.university) return res.redirect('/university/login');
    next();
  } catch (err) {
    res.redirect('/university/login');
  }
};

module.exports = { requireStudentLogin, requireUniversityLogin };