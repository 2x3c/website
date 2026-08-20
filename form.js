const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const db = require('../database');

// Locate writeable uploads directory for local and Vercel environments
function getUploadDir() {
  const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
  const dir = isVercel
    ? path.join('/tmp', 'uploads')
    : path.join(__dirname, '../uploads');
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {}
  return dir;
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, getUploadDir());
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `upload_${Date.now()}_${uuidv4().slice(0, 8)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.zip'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext) || !ext) {
    cb(null, true);
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

// POST /api/submit
router.post('/submit', upload.any(), (req, res) => {
  try {
    const body = req.body;
    const files = req.files || [];
    
    const id = uuidv4();
    const responsesJson = JSON.stringify({
      answers: body,
      files: files.map(f => ({ fieldname: f.fieldname, originalname: f.originalname, filename: f.filename }))
    });

    const resumeFile = files.find(f => f.fieldname === 'resume' || f.fieldname.toLowerCase().includes('resume') || f.fieldname.toLowerCase().includes('file'));
    const resumePath = resumeFile ? resumeFile.filename : null;
    const resumeOriginalName = resumeFile ? resumeFile.originalname : null;

    // Helper to find field value flexibly
    const findField = (keys) => {
      for (const k of keys) {
        if (body[k]) return String(body[k]).trim();
        for (const [bk, bv] of Object.entries(body)) {
          if (bk.toLowerCase().includes(k.toLowerCase()) && bv) return String(bv).trim();
        }
      }
      return '';
    };

    const fullName = findField(['full_name', 'name', 'fullname', 'applicant_name']) || 'Anonymous';
    const email = findField(['email', 'email_address', 'mail']) || '';
    const phone = findField(['phone', 'mobile', 'phone_number', 'contact']) || '';
    const dob = findField(['dob', 'birth', 'date_of_birth']) || '';
    const city = findField(['city']) || '';
    const state = findField(['state']) || '';
    const country = findField(['country']) || 'India';
    const gender = findField(['gender', 'sex']) || '';
    const instagramId = findField(['instagram_id', 'instagram', 'insta', 'insta_id']) || '';
    const education = findField(['education', 'qualification']) || '';
    const experience = findField(['experience', 'work_experience']) || '';
    const skills = findField(['skills', 'skill']) || '';
    const workingHours = findField(['working_hours', 'hours', 'time']) || '';
    const heardFrom = findField(['heard_from', 'how_did_you_hear']) || '';

    const stmt = db.prepare(`
      INSERT INTO registrations 
        (id, full_name, email, phone, dob, city, state, country, gender, instagram_id, 
         education, experience, skills, working_hours, resume_path, 
         resume_original_name, heard_from, responses_json, submitted_at)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);

    stmt.run(
      id, fullName, email, phone, dob,
      city, state, country, gender, instagramId,
      education, experience, skills, workingHours,
      resumePath, resumeOriginalName, heardFrom, responsesJson
    );

    res.json({ success: true, id, message: 'Survey response submitted successfully!' });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});

module.exports = router;
