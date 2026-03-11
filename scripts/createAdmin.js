require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const Admin    = require('../models/Admin');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const existing = await Admin.findOne({ email: 'admin@acadex.com' });
  if (existing) {
    console.log('Admin already exists');
    process.exit();
  }
  const hashed = await bcrypt.hash('Admin@1234', 10);
  await Admin.create({
    name:     'Platform Admin',
    email:    'admin@acadex.com',
    password: hashed
  });
  console.log('✅ Admin created — email: admin@acadex.com, password: Admin@1234');
  process.exit();
});