const express      = require('express');
const router       = express.Router();
const nodemailer   = require('nodemailer');

// ── Nodemailer transporter ────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

// ── GET /contact ──────────────────────────────────────────────
router.get('/contact', (req, res) => {
  res.render('contact', { success: null, error: null });
});

// ── POST /contact ─────────────────────────────────────────────
router.post('/contact', async (req, res) => {
  const { name, email, category, subject, message } = req.body;

  if (!name || !email || !category || !subject || !message) {
    return res.render('contact', {
      error: 'All fields are required.',
      success: null
    });
  }

  try {
    // ── Email to you ──────────────────────────────────────────
    await transporter.sendMail({
      from:    `"NoteShare Contact" <${process.env.GMAIL_USER}>`,
      to:      'entrocomedy@gmail.com',
      subject: `[${category}] ${subject}`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto;
                    border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">

          <div style="background:#4f46e5; padding:24px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:22px;">📬 New Contact Message</h1>
            <p style="color:#c7d2fe; margin:6px 0 0; font-size:14px;">NoteShare Platform</p>
          </div>

          <div style="padding:24px;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr>
                <td style="padding:10px; background:#f8fafc; font-weight:600;
                           border-radius:6px; width:130px;">👤 Name</td>
                <td style="padding:10px;">${name}</td>
              </tr>
              <tr>
                <td style="padding:10px; background:#f8fafc; font-weight:600;
                           border-radius:6px;">📧 Email</td>
                <td style="padding:10px;">
                  <a href="mailto:${email}" style="color:#4f46e5;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px; background:#f8fafc; font-weight:600;
                           border-radius:6px;">🏷️ Category</td>
                <td style="padding:10px;">
                  <span style="background:#ede9fe; color:#7c3aed; padding:3px 10px;
                               border-radius:20px; font-size:12px; font-weight:600;">
                    ${category}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:10px; background:#f8fafc; font-weight:600;
                           border-radius:6px;">📌 Subject</td>
                <td style="padding:10px;">${subject}</td>
              </tr>
              <tr>
                <td style="padding:10px; background:#f8fafc; font-weight:600;
                           border-radius:6px; vertical-align:top;">💬 Message</td>
                <td style="padding:10px;">
                  <div style="background:#f8fafc; padding:14px; border-radius:8px;
                              border-left:4px solid #4f46e5; line-height:1.6;">
                    ${message.replace(/\n/g, '<br>')}
                  </div>
                </td>
              </tr>
            </table>

            <div style="margin-top:20px; padding:14px; background:#fef3c7;
                        border-radius:8px; font-size:13px; color:#92400e;">
              📅 Received: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
            </div>

            <div style="margin-top:16px; text-align:center;">
              <a href="mailto:${email}"
                 style="display:inline-block; background:#4f46e5; color:#fff;
                        padding:10px 24px; border-radius:8px; text-decoration:none;
                        font-weight:600; font-size:14px;">
                Reply to ${name}
              </a>
            </div>
          </div>

          <div style="background:#f8fafc; padding:16px; text-align:center;
                      font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0;">
            NoteShare — Built for students, by students 💙
          </div>
        </div>
      `
    });

    // ── Confirmation email to sender ──────────────────────────
    await transporter.sendMail({
      from:    `"NoteShare" <${process.env.GMAIL_USER}>`,
      to:      email,
      subject: `We received your message — ${subject}`,
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:0 auto;
                    border:1px solid #e2e8f0; border-radius:12px; overflow:hidden;">

          <div style="background:#4f46e5; padding:24px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:22px;">✅ Message Received!</h1>
            <p style="color:#c7d2fe; margin:6px 0 0; font-size:14px;">NoteShare Platform</p>
          </div>

          <div style="padding:24px;">
            <p style="font-size:15px; color:#1e293b;">Hi <strong>${name}</strong>,</p>
            <p style="font-size:14px; color:#64748b; line-height:1.6;">
              Thank you for reaching out! We have received your message and will
              get back to you within <strong>24 hours</strong>.
            </p>

            <div style="background:#f8fafc; border:1px solid #e2e8f0;
                        border-radius:10px; padding:16px; margin:20px 0;">
              <p style="font-size:13px; font-weight:600; color:#1e293b; margin:0 0 8px;">
                Your message summary:
              </p>
              <p style="font-size:13px; color:#64748b; margin:4px 0;">
                <strong>Category:</strong> ${category}
              </p>
              <p style="font-size:13px; color:#64748b; margin:4px 0;">
                <strong>Subject:</strong> ${subject}
              </p>
            </div>

            <p style="font-size:13px; color:#94a3b8;">
              If this is urgent, you can reply directly to this email.
            </p>
          </div>

          <div style="background:#f8fafc; padding:16px; text-align:center;
                      font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0;">
            NoteShare — Built for students, by students 💙
          </div>
        </div>
      `
    });

    res.render('contact', {
      success: '✅ Message sent successfully! Check your email for confirmation.',
      error: null
    });

  } catch (err) {
    console.error('Mail error:', err.message);
    res.render('contact', {
      error: 'Failed to send message. Please try again later.',
      success: null
    });
  }
});

module.exports = router;