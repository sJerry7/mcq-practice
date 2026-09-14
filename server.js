const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Questions API — add more JSON files to /data and combine here later
app.get('/api/questions', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'questions.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error('Failed to load questions.json:', err.message);
    res.status(500).json({ error: 'Failed to load questions.' });
  }
});

// Catch-all — enables future SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n📚  MCQ Practice is running!\n`);
  console.log(`   Local:  http://localhost:${PORT}\n`);
});
