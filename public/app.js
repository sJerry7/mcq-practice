/* ============================================================
   MCQ Practice — app.js  (Practice + Exam modes, session save,
   question map, mark for review, countdown timer)
   ============================================================ */

const App = {

  /* ── Raw data from /api/questions ──────────────────────── */
  data: { subjects: [], categories: [], questions: [] },

  /* ── Runtime state ─────────────────────────────────────── */
  state: {
    // display
    darkMode:   false,
    mapOpen:    false,

    // quiz session
    mode:       null,        // 'practice' | 'exam'
    pendingMode: null,       // selected in modal before confirm
    filtered:   [],          // shuffled question objects
    current:    0,
    answers:    [],          // [{selected, correct, skipped, markedForReview}]

    // exam timer
    examDuration:  30,       // minutes (user-adjustable)
    timerSeconds:  0,
    timerInterval: null,
  },

  SAVE_KEY: 'mcq-practice-session',

  /* ================================================================
     BOOTSTRAP
     ================================================================ */
  async init() {
    this.loadTheme();
    await this.fetchData();
    this.buildFilters();
    this.renderHomeCards();
    this.bindEvents();
    this.syncFilterCount();
    this.checkSavedSession();
  },

  async fetchData() {
    try {
      const res  = await fetch('/api/questions');
      const json = await res.json();
      this.data.subjects   = json.subjects   || [];
      this.data.categories = json.categories || [];
      this.data.questions  = json.questions  || [];
    } catch (e) {
      console.error('Could not load questions:', e);
    }
  },

  /* ================================================================
     THEME
     ================================================================ */
  loadTheme() {
    const saved = localStorage.getItem('mcq-theme') || 'light';
    this.state.darkMode = saved === 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    this.$('darkModeBtn').textContent = this.state.darkMode ? '☀️' : '🌙';
  },

  toggleDarkMode() {
    this.state.darkMode = !this.state.darkMode;
    const t = this.state.darkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    this.$('darkModeBtn').textContent = this.state.darkMode ? '☀️' : '🌙';
    localStorage.setItem('mcq-theme', t);
  },

  /* ================================================================
     FILTER HELPERS
     ================================================================ */
  buildFilters() {
    const subjEl = this.$('subjectFilter');
    this.data.subjects.forEach(s => {
      subjEl.innerHTML += `<option value="${s.id}">${s.icon} ${s.name}</option>`;
    });
    this.refreshCategoryFilter('all');
    const topics = [...new Set(this.data.questions.map(q => q.topic))].sort();
    const topicEl = this.$('topicFilter');
    topicEl.innerHTML = '<option value="all">All Topics</option>';
    topics.forEach(t => topicEl.innerHTML += `<option value="${t}">${t}</option>`);
  },

  refreshCategoryFilter(subjectId) {
    const catEl = this.$('categoryFilter');
    catEl.innerHTML = '<option value="all">All Categories</option>';
    const list = subjectId === 'all'
      ? this.data.categories
      : this.data.categories.filter(c => c.subject === subjectId);
    list.forEach(c => catEl.innerHTML += `<option value="${c.id}">${c.icon} ${c.name}</option>`);
  },

  getFilters() {
    return {
      subject:    this.$('subjectFilter').value,
      category:   this.$('categoryFilter').value,
      topic:      this.$('topicFilter').value,
      difficulty: this.$('difficultyFilter').value,
    };
  },

  applyFilters(qs) {
    const f = this.getFilters();
    return qs.filter(q => {
      if (f.subject    !== 'all' && q.subject    !== f.subject)    return false;
      if (f.category   !== 'all' && q.category   !== f.category)   return false;
      if (f.topic      !== 'all' && q.topic      !== f.topic)      return false;
      if (f.difficulty !== 'all' && q.difficulty !== f.difficulty) return false;
      return true;
    });
  },

  syncFilterCount() {
    const n = this.applyFilters(this.data.questions).length;
    this.$('filterCount').textContent = `${n} question${n !== 1 ? 's' : ''}`;
  },

  /* ================================================================
     HOME CARDS
     ================================================================ */
  renderHomeCards() {
    const subjectGrid  = this.$('subjectGrid');
    const categoryGrid = this.$('categoryGrid');
    subjectGrid.innerHTML  = '';
    categoryGrid.innerHTML = '';

    this.data.subjects.forEach(s => {
      const n = this.data.questions.filter(q => q.subject === s.id).length;
      subjectGrid.innerHTML += `
        <div class="subj-card" onclick="App.quickStart('subject','${s.id}')">
          <div class="card-icon">${s.icon}</div>
          <div class="card-name">${s.name}</div>
          <div class="card-count">${n} questions</div>
        </div>`;
    });

    this.data.categories.forEach(c => {
      const n = this.data.questions.filter(q => q.category === c.id).length;
      categoryGrid.innerHTML += `
        <div class="cat-card" onclick="App.quickStart('category','${c.id}')">
          <div class="card-icon">${c.icon}</div>
          <div class="card-name">${c.name}</div>
          <div class="card-count">${n} questions</div>
        </div>`;
    });
  },

  quickStart(type, id) {
    if (type === 'subject') {
      this.$('subjectFilter').value = id;
      this.refreshCategoryFilter(id);
      this.$('categoryFilter').value = 'all';
    } else {
      const cat = this.data.categories.find(c => c.id === id);
      if (cat) {
        this.$('subjectFilter').value = cat.subject;
        this.refreshCategoryFilter(cat.subject);
      }
      this.$('categoryFilter').value = id;
    }
    this.syncFilterCount();
    this.openModeModal();
  },

  /* ================================================================
     MODE SELECTION MODAL
     ================================================================ */
  openModeModal() {
    const pool = this.applyFilters(this.data.questions);
    if (pool.length === 0) {
      alert('No questions match the current filters. Please adjust your selection.');
      return;
    }

    // Reset selection
    this.state.pendingMode = null;
    this.$('modeCardPractice').classList.remove('selected');
    this.$('modeCardExam').classList.remove('selected');
    this.$('startModeBtn').disabled = true;
    this.$('examDurationRow').classList.add('hidden');
    this.$('durationDisplay').textContent = this.state.examDuration;

    // Show resume banner if a saved session exists and pool matches
    const saved = this.getSavedSession();
    const resumeEl = this.$('resumeBanner');
    if (saved) {
      const ts  = new Date(saved.savedAt);
      const ago = this.timeAgo(ts);
      this.$('resumeMeta').textContent =
        `${saved.questionIds.length} questions · saved ${ago}`;
      resumeEl.classList.remove('hidden');
    } else {
      resumeEl.classList.add('hidden');
    }

    this.$('modeModal').classList.remove('hidden');
  },

  closeModeModal() {
    this.$('modeModal').classList.add('hidden');
    this.state.pendingMode = null;
  },

  selectMode(mode) {
    this.state.pendingMode = mode;
    this.$('modeCardPractice').classList.toggle('selected', mode === 'practice');
    this.$('modeCardExam').classList.toggle('selected',    mode === 'exam');
    this.$('startModeBtn').disabled = false;
    this.$('examDurationRow').classList.toggle('hidden', mode !== 'exam');
  },

  adjustDuration(delta) {
    const min = 1, max = 300;
    this.state.examDuration = Math.min(max, Math.max(min, this.state.examDuration + delta));
    this.$('durationDisplay').textContent = this.state.examDuration;
  },

  confirmAndStart() {
    const mode = this.state.pendingMode;
    if (!mode) return;
    this.closeModeModal();
    this.startQuiz(mode);
  },

  resumeFromModal() {
    this.closeModeModal();
    const saved = this.getSavedSession();
    if (saved) this.doResumeSession(saved);
  },

  /* ================================================================
     SESSION PERSISTENCE  (practice mode only)
     ================================================================ */
  getSavedSession() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  savePracticeSession() {
    if (this.state.mode !== 'practice') return;
    const session = {
      savedAt:     new Date().toISOString(),
      filters:     this.getFilters(),
      questionIds: this.state.filtered.map(q => q.id),
      current:     this.state.current,
      answers:     this.state.answers,
    };
    localStorage.setItem(this.SAVE_KEY, JSON.stringify(session));
  },

  clearSavedSession() {
    localStorage.removeItem(this.SAVE_KEY);
  },

  checkSavedSession() {
    const saved = this.getSavedSession();
    if (!saved) return;

    const ts  = new Date(saved.savedAt);
    const ago = this.timeAgo(ts);
    const n   = saved.questionIds.length;

    this.$('homeResumeInfo').textContent =
      `${n} questions · ${saved.answers.filter(a => a.selected !== null).length} answered · saved ${ago}`;
    this.$('homeResume').classList.remove('hidden');
  },

  resumeFromHomeScreen() {
    const saved = this.getSavedSession();
    if (saved) this.doResumeSession(saved);
  },

  discardSavedSession() {
    if (!confirm('Discard your saved session? This cannot be undone.')) return;
    this.clearSavedSession();
    this.$('homeResume').classList.add('hidden');
  },

  doResumeSession(session) {
    // Rebuild filtered array from saved question IDs (preserve order)
    const byId = Object.fromEntries(this.data.questions.map(q => [q.id, q]));
    const filtered = session.questionIds.map(id => byId[id]).filter(Boolean);
    if (filtered.length === 0) {
      alert('Could not restore session — questions may have changed.');
      this.clearSavedSession();
      return;
    }

    this.state.mode     = 'practice';
    this.state.filtered = filtered;
    this.state.current  = Math.min(session.current, filtered.length - 1);
    this.state.answers  = session.answers;

    // Restore filters in sidebar
    const f = session.filters;
    this.$('subjectFilter').value    = f.subject    || 'all';
    this.refreshCategoryFilter(f.subject || 'all');
    this.$('categoryFilter').value   = f.category   || 'all';
    this.$('topicFilter').value      = f.topic      || 'all';
    this.$('difficultyFilter').value = f.difficulty || 'all';
    this.syncFilterCount();

    this.launchQuizUI('practice');
  },

  saveAndExit() {
    this.savePracticeSession();
    this.stopTimer();
    this.$('homeResume').classList.remove('hidden');
    this.checkSavedSession();
    this.resetToHome(/* keepSession */ true);
  },

  /* ================================================================
     QUIZ LIFECYCLE
     ================================================================ */
  startQuiz(mode) {
    const pool = this.applyFilters(this.data.questions);
    if (pool.length === 0) return;

    this.state.mode     = mode;
    this.state.filtered = [...pool].sort(() => Math.random() - 0.5);
    this.state.current  = 0;
    this.state.answers  = this.state.filtered.map(() => ({
      selected: null, correct: false, skipped: false, markedForReview: false,
    }));

    if (mode === 'practice') {
      this.clearSavedSession();
    }

    this.launchQuizUI(mode);
  },

  launchQuizUI(mode) {
    // Mode badge
    const badge = this.$('modeBadge');
    if (mode === 'exam') {
      badge.textContent = '⏱ Exam Mode';
      badge.classList.add('exam-badge');
    } else {
      badge.textContent = '📖 Practice Mode';
      badge.classList.remove('exam-badge');
    }

    // Save & Exit only in practice
    this.$('saveExitBtn').classList.toggle('hidden', mode !== 'practice');

    // Timer only in exam
    if (mode === 'exam') {
      this.$('examTimer').classList.remove('hidden');
      this.state.timerSeconds = this.state.examDuration * 60;
      this.updateTimerDisplay();
      this.startTimer();
    } else {
      this.$('examTimer').classList.add('hidden');
    }

    this.$('navScore').classList.remove('hidden');
    this.$('sessionStats').classList.remove('hidden');
    this.$('homeResume').classList.add('hidden');
    this.showScreen('quizScreen');
    this.renderQuestion();
    this.openMap();   // always show map when quiz starts
  },

  /* ================================================================
     TIMER
     ================================================================ */
  startTimer() {
    this.stopTimer();
    this.state.timerInterval = setInterval(() => {
      this.state.timerSeconds--;
      this.updateTimerDisplay();
      if (this.state.timerSeconds <= 0) {
        this.stopTimer();
        alert('⏱ Time\'s up! Submitting your quiz now.');
        this.finishQuiz();
      }
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    const s   = Math.max(0, this.state.timerSeconds);
    const min = String(Math.floor(s / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    this.$('timerDisplay').textContent = `${min}:${sec}`;

    const el = this.$('examTimer');
    const total = this.state.examDuration * 60;
    el.classList.remove('timer-warn', 'timer-danger');
    if (s <= 60) {
      el.classList.add('timer-danger');
    } else if (s <= total * 0.25) {
      el.classList.add('timer-warn');
    }
  },

  /* ================================================================
     RENDER QUESTION
     ================================================================ */
  renderQuestion() {
    const q     = this.state.filtered[this.state.current];
    const total = this.state.filtered.length;
    const idx   = this.state.current;
    const ans   = this.state.answers[idx];
    const mode  = this.state.mode;

    // Counters & progress
    this.$('qCurrent').textContent  = idx + 1;
    this.$('qTotal').textContent    = total;
    this.$('progressFill').style.width = `${((idx + 1) / total) * 100}%`;

    // Tags
    const cat      = this.data.categories.find(c => c.id === q.category);
    const catLabel = cat ? `${cat.icon} ${cat.name}` : q.category;
    this.$('qTags').innerHTML = `
      <span class="tag tag-cat">${catLabel}</span>
      <span class="tag tag-topic">${q.topic}</span>
      <span class="tag tag-${q.difficulty}">${q.difficulty}</span>
    `;

    // Review flag
    const flagEl = this.$('reviewFlag');
    flagEl.classList.toggle('hidden', !ans.markedForReview);

    // Text & code
    this.$('qText').textContent = q.question;
    if (q.code) {
      this.$('codeContent').textContent = q.code;
      this.$('codeBlock').style.display = 'block';
    } else {
      this.$('codeBlock').style.display = 'none';
    }

    // Options
    this.renderOptions(q, ans);

    // Explanation — practice only, after answering
    const showExp = mode === 'practice' && ans.selected !== null && !ans.skipped;
    if (showExp) {
      this.$('expBox').classList.remove('hidden');
      this.renderExplanation(ans.correct, q);
    } else {
      this.$('expBox').classList.add('hidden');
    }

    this.updateNavBtns(ans);
    this.updateReviewBtn(ans.markedForReview);
    this.updateSessionStats();
    this.updateNavScore();
    if (this.state.mapOpen) this.renderMap();

    document.querySelector('.main').scrollTo(0, 0);
  },

  /* ================================================================
     RENDER OPTIONS
     ================================================================ */
  renderOptions(q, ans) {
    const labels = ['A', 'B', 'C', 'D'];
    const mode   = this.state.mode;
    const done   = ans.selected !== null || ans.skipped;
    this.$('optionsList').innerHTML = '';

    q.options.forEach((opt, i) => {
      const btn = document.createElement('button');
      btn.className = 'opt-btn';
      btn.innerHTML = `
        <span class="opt-label">${labels[i]}</span>
        <span class="opt-text">${this.escHtml(opt)}</span>
        <span class="opt-icon"></span>
      `;

      if (mode === 'practice') {
        if (done) {
          btn.disabled = true;
          if (i === q.correct) {
            btn.classList.add('opt-correct');
            btn.querySelector('.opt-icon').textContent = '✓';
          } else if (i === ans.selected && ans.selected !== q.correct) {
            btn.classList.add('opt-wrong');
            btn.querySelector('.opt-icon').textContent = '✗';
          } else {
            btn.classList.add('opt-dim');
          }
        } else {
          btn.addEventListener('click', () => this.pickAnswer(i));
        }
      } else {
        // Exam mode — can re-select, no feedback colours
        if (i === ans.selected) btn.classList.add('opt-selected');
        btn.addEventListener('click', () => this.selectExamAnswer(i));
      }

      this.$('optionsList').appendChild(btn);
    });
  },

  /* ================================================================
     ANSWER HANDLING
     ================================================================ */
  pickAnswer(selectedIdx) {
    const q         = this.state.filtered[this.state.current];
    const isCorrect = selectedIdx === q.correct;

    this.state.answers[this.state.current] = {
      ...this.state.answers[this.state.current],
      selected: selectedIdx,
      correct:  isCorrect,
      skipped:  false,
    };

    document.querySelectorAll('.opt-btn').forEach((btn, i) => {
      btn.disabled = true;
      if (i === q.correct) {
        btn.classList.add('opt-correct');
        btn.querySelector('.opt-icon').textContent = '✓';
      } else if (i === selectedIdx && !isCorrect) {
        btn.classList.add('opt-wrong');
        btn.querySelector('.opt-icon').textContent = '✗';
      } else {
        btn.classList.add('opt-dim');
      }
    });

    this.$('expBox').classList.remove('hidden');
    this.renderExplanation(isCorrect, q);
    this.updateNavBtns(this.state.answers[this.state.current]);
    this.updateSessionStats();
    this.updateNavScore();
    if (this.state.mapOpen) this.renderMap();
  },

  selectExamAnswer(idx) {
    const ans = this.state.answers[this.state.current];
    ans.selected = idx;
    // Do NOT set ans.correct here — correctness is only resolved at finishQuiz()
    // so the sidebar never leaks whether the answer was right or wrong during exam.
    ans.skipped  = false;

    // Refresh option highlight only (no feedback)
    document.querySelectorAll('.opt-btn').forEach((btn, i) => {
      btn.classList.toggle('opt-selected', i === idx);
    });

    this.updateNavBtns(ans);
    this.updateSessionStats();
    if (this.state.mapOpen) this.renderMap();
  },

  renderExplanation(isCorrect, q) {
    const labels = ['A', 'B', 'C', 'D'];
    const hdr    = this.$('expHeader');
    hdr.className = 'exp-header ' + (isCorrect ? 'h-correct' : 'h-wrong');
    hdr.innerHTML = isCorrect
      ? `<span>✅</span><span>Correct!</span>`
      : `<span>❌</span><span>Incorrect — Correct answer: <strong>${labels[q.correct]}. ${this.escHtml(q.options[q.correct])}</strong></span>`;
    this.$('expBody').textContent = q.explanation;
  },

  /* ================================================================
     MARK FOR REVIEW
     ================================================================ */
  toggleMarkForReview() {
    const ans = this.state.answers[this.state.current];
    ans.markedForReview = !ans.markedForReview;
    this.updateReviewBtn(ans.markedForReview);
    this.$('reviewFlag').classList.toggle('hidden', !ans.markedForReview);
    this.updateSessionStats();
    if (this.state.mapOpen) this.renderMap();
  },

  updateReviewBtn(isMarked) {
    const btn = this.$('markReviewBtn');
    btn.classList.toggle('is-marked', isMarked);
    btn.textContent = isMarked ? '🚩 Marked' : '🏳 Review';
  },

  /* ================================================================
     NAVIGATION
     ================================================================ */
  saveAndNext() {
    // Exam mode: advance regardless of whether answered
    const total = this.state.filtered.length;
    const idx   = this.state.current;
    if (idx < total - 1) {
      this.state.current++;
      this.renderQuestion();
    } else {
      this.finishQuiz();
    }
  },

  skipQuestion() {
    this.state.answers[this.state.current].skipped = true;
    if (this.state.current < this.state.filtered.length - 1) {
      this.state.current++;
      this.renderQuestion();
    }
  },

  goNext() {
    if (this.state.current < this.state.filtered.length - 1) {
      this.state.current++;
      this.renderQuestion();
    }
  },

  goPrev() {
    if (this.state.current > 0) {
      this.state.current--;
      this.renderQuestion();
    }
  },

  jumpTo(idx) {
    this.state.current = idx;
    // On mobile the map is a full-screen overlay — close after navigating
    // On desktop it's a permanent panel — keep it open
    if (window.innerWidth <= 768) this.closeMap();
    this.renderQuestion();
  },

  /* ================================================================
     NAV BUTTON VISIBILITY
     ================================================================ */
  updateNavBtns(ans) {
    const idx    = this.state.current;
    const total  = this.state.filtered.length;
    const isLast = idx === total - 1;
    const mode   = this.state.mode;

    this.$('prevBtn').disabled = idx === 0;

    if (mode === 'exam') {
      // Always show skip/next, never explanation; finish on last
      this.$('skipBtn').classList.remove('hidden');
      this.$('nextBtn').classList.add('hidden');
      this.$('finishBtn').classList.toggle('hidden', !isLast);

      // Rename Skip to "Save & Next" in exam mode
      const skip = this.$('skipBtn');
      skip.textContent = isLast ? 'Skip' : 'Save & Next';
      skip.onclick = isLast
        ? () => this.skipQuestion()
        : () => this.saveAndNext();
    } else {
      // Practice mode
      const done = ans.selected !== null || ans.skipped;
      if (done) {
        this.$('skipBtn').classList.add('hidden');
        this.$('nextBtn').classList.toggle('hidden',    isLast);
        this.$('finishBtn').classList.toggle('hidden', !isLast);
      } else {
        this.$('skipBtn').classList.remove('hidden');
        this.$('skipBtn').textContent = 'Skip';
        this.$('skipBtn').onclick = () => this.skipQuestion();
        this.$('nextBtn').classList.add('hidden');
        this.$('finishBtn').classList.add('hidden');
      }
    }
  },

  /* ================================================================
     SESSION STATS
     ================================================================ */
  updateSessionStats() {
    const a        = this.state.answers;
    const answered = a.filter(x => x.selected !== null).length;
    const correct  = a.filter(x => x.correct).length;
    const wrong    = a.filter(x => x.selected !== null && !x.correct).length;
    const review   = a.filter(x => x.markedForReview).length;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : null;
    const isExam   = this.state.mode === 'exam';

    this.$('statAnswered').textContent = answered;
    // In exam mode, never reveal correct/wrong counts — they'd give away right answers
    this.$('statCorrect').textContent  = isExam ? '—' : correct;
    this.$('statWrong').textContent    = isExam ? '—' : wrong;
    this.$('statReview').textContent   = review;
    this.$('statAccuracy').textContent = (accuracy !== null && !isExam) ? `${accuracy}%` : '—';
  },

  updateNavScore() {
    const a       = this.state.answers;
    const correct  = a.filter(x => x.correct).length;
    const answered = a.filter(x => x.selected !== null).length;
    if (this.state.mode === 'exam') {
      this.$('navScoreVal').textContent = `${answered} answered`;
    } else {
      this.$('navScoreVal').textContent = `${correct}/${answered}`;
    }
  },

  /* ================================================================
     QUESTION MAP  — permanent right panel during quiz
     ================================================================ */
  openMap() {
    this.state.mapOpen = true;
    this.renderMap();
    this.$('mapPanel').classList.remove('hidden');
  },

  closeMap() {
    this.state.mapOpen = false;
    this.$('mapPanel').classList.add('hidden');
  },

  closeMapOnBackdrop(e) {
    // Mobile only: tap the backdrop area outside the inner box
    if (window.innerWidth <= 768 && e.target === this.$('mapPanel')) this.closeMap();
  },

  renderMap() {
    const grid    = this.$('mapGrid');
    const summary = this.$('mapSummary');
    const mode    = this.state.mode;
    grid.innerHTML = '';

    let nAnswered = 0, nCorrect = 0, nWrong = 0, nReview = 0, nSkipped = 0;

    this.state.answers.forEach((ans, i) => {
      const btn = document.createElement('button');
      btn.className = 'qmap-btn';
      btn.textContent = i + 1;
      btn.title = `Q${i + 1}`;
      btn.onclick = () => this.jumpTo(i);

      if (i === this.state.current) {
        btn.classList.add('qmap-current');
      } else if (mode === 'practice') {
        if (ans.selected !== null) {
          nAnswered++;
          if (ans.correct) { btn.classList.add('qmap-correct'); nCorrect++; }
          else             { btn.classList.add('qmap-wrong');   nWrong++;   }
        } else if (ans.skipped) {
          nSkipped++;
        }
      } else {
        // Exam: only show answered (no correct/wrong feedback)
        if (ans.selected !== null) {
          btn.classList.add('qmap-exam-ans');
          nAnswered++;
        } else if (ans.skipped) {
          nSkipped++;
        }
      }

      if (ans.markedForReview) { btn.classList.add('qmap-review'); nReview++; }

      grid.appendChild(btn);
    });

    const total    = this.state.filtered.length;
    const nPending = total - nAnswered - nSkipped - 1; // -1 for current

    summary.innerHTML = `
      <span class="ms-item">📋 Total: <strong>${total}</strong></span>
      <span class="ms-item">✅ Answered: <strong>${nAnswered}</strong></span>
      ${mode === 'practice'
        ? `<span class="ms-item" style="color:var(--success)">✓ Correct: <strong>${nCorrect}</strong></span>
           <span class="ms-item" style="color:var(--error)">✗ Wrong: <strong>${nWrong}</strong></span>`
        : ''}
      <span class="ms-item" style="color:var(--amber)">🚩 Review: <strong>${nReview}</strong></span>
      <span class="ms-item">⏭ Skipped: <strong>${nSkipped}</strong></span>
    `;
  },

  /* ================================================================
     FINISH & RESULTS
     ================================================================ */
  finishQuiz() {
    this.stopTimer();
    if (this.state.mode === 'practice') this.clearSavedSession();
    this.closeMap();
    // For exam mode: calculate correct/wrong now (was intentionally deferred)
    if (this.state.mode === 'exam') {
      this.state.answers.forEach((ans, i) => {
        if (ans.selected !== null) {
          ans.correct = (ans.selected === this.state.filtered[i].correct);
        }
      });
    }
    this.showScreen('resultsScreen');
    this.renderResults();
    this.$('homeResume').classList.add('hidden');
  },

  renderResults() {
    const a       = this.state.answers;
    const total   = this.state.filtered.length;
    const correct = a.filter(x => x.correct).length;
    const wrong   = a.filter(x => x.selected !== null && !x.correct).length;
    const skipped = a.filter(x => x.skipped || x.selected === null).length;
    const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
    const emoji   = pct >= 90 ? '🏆' : pct >= 75 ? '🎉' : pct >= 50 ? '👍' : pct >= 25 ? '📚' : '💪';

    this.$('resultsEmoji').textContent = emoji;
    this.$('rScore').textContent       = correct;
    this.$('rTotal').textContent       = total;
    this.$('resultsPct').textContent   = `${pct}% Accuracy`;
    this.$('rbCorrect').textContent    = correct;
    this.$('rbWrong').textContent      = wrong;
    this.$('rbSkipped').textContent    = skipped;
  },

  renderReview() {
    const panel = this.$('reviewPanel');
    panel.classList.toggle('hidden');
    if (panel.classList.contains('hidden')) return;

    const labels = ['A', 'B', 'C', 'D'];
    this.$('reviewItems').innerHTML = '';

    this.state.filtered.forEach((q, i) => {
      const ans = this.state.answers[i];
      let dotClass, statusIcon;
      if (ans.skipped || ans.selected === null) {
        dotClass = 'skipped'; statusIcon = '⏭';
      } else {
        dotClass   = ans.correct ? 'correct' : 'wrong';
        statusIcon = ans.correct ? '✓' : '✗';
      }

      const selectedText = (ans.skipped || ans.selected === null)
        ? '<em>Skipped / Not answered</em>'
        : `<strong>${labels[ans.selected]}. ${this.escHtml(q.options[ans.selected])}</strong>`;

      const reviewMark = ans.markedForReview ? ' 🚩' : '';

      const div = document.createElement('div');
      div.className = 'review-item';
      div.innerHTML = `
        <div class="review-item-head" onclick="App.toggleReviewItem(${i})">
          <div class="rdot ${dotClass}"></div>
          <div class="rq-text">Q${i + 1}${reviewMark}. ${this.escHtml(q.question)}</div>
          <span>${statusIcon}</span>
        </div>
        <div class="review-item-body" id="rib-${i}">
          <div class="rib-row">Your answer: ${selectedText}</div>
          <div class="rib-row rib-correct-ans">✓ Correct: ${labels[q.correct]}. ${this.escHtml(q.options[q.correct])}</div>
          <div class="rib-exp">${this.escHtml(q.explanation)}</div>
        </div>
      `;
      this.$('reviewItems').appendChild(div);
    });
  },

  toggleReviewItem(idx) {
    this.$(`rib-${idx}`).classList.toggle('open');
  },

  /* ================================================================
     SCREEN SWITCHER & RESET
     ================================================================ */
  showScreen(id) {
    ['homeScreen', 'quizScreen', 'resultsScreen'].forEach(s => {
      this.$(s).classList.toggle('hidden', s !== id);
    });
  },

  resetToHome(keepSession = false) {
    this.stopTimer();
    this.closeMap();
    this.$('navScore').classList.add('hidden');
    this.$('reviewPanel').classList.add('hidden');
    this.$('examTimer').classList.add('hidden');
    this.$('saveExitBtn').classList.add('hidden');

    this.$('subjectFilter').value    = 'all';
    this.$('categoryFilter').value   = 'all';
    this.$('topicFilter').value      = 'all';
    this.$('difficultyFilter').value = 'all';
    this.refreshCategoryFilter('all');
    this.syncFilterCount();

    if (!keepSession) {
      this.$('homeResume').classList.add('hidden');
    }
    this.showScreen('homeScreen');
  },

  /* ================================================================
     EVENT BINDING
     ================================================================ */
  bindEvents() {
    this.$('darkModeBtn').onclick     = () => this.toggleDarkMode();
    this.$('startQuizBtn').onclick    = () => this.openModeModal();
    this.$('resetFiltersBtn').onclick = () => {
      this.$('subjectFilter').value    = 'all';
      this.$('categoryFilter').value   = 'all';
      this.$('topicFilter').value      = 'all';
      this.$('difficultyFilter').value = 'all';
      this.refreshCategoryFilter('all');
      this.syncFilterCount();
    };
    this.$('subjectFilter').onchange = e => {
      this.refreshCategoryFilter(e.target.value);
      this.$('categoryFilter').value = 'all';
      this.syncFilterCount();
    };
    ['categoryFilter', 'topicFilter', 'difficultyFilter']
      .forEach(id => this.$(id).onchange = () => this.syncFilterCount());

    // Home screen resume/discard
    this.$('homeResumeBtn').onclick  = () => this.resumeFromHomeScreen();
    this.$('homeDiscardBtn').onclick = () => this.discardSavedSession();

    // Quiz navigation
    this.$('prevBtn').onclick     = () => this.goPrev();
    this.$('nextBtn').onclick     = () => this.goNext();
    this.$('skipBtn').onclick     = () => this.skipQuestion();
    this.$('finishBtn').onclick   = () => this.finishQuiz();
    this.$('markReviewBtn').onclick = () => this.toggleMarkForReview();

    // Quiz topbar
    // Map toggle (mobile only — desktop map is always visible)
    this.$('mapToggleBtn').onclick = () => {
      this.state.mapOpen ? this.closeMap() : this.openMap();
    };
    // Mobile: tap the dark backdrop outside the inner box to close map
    this.$('mapPanel').addEventListener('click', e => this.closeMapOnBackdrop(e));
    this.$('saveExitBtn').onclick = () => this.saveAndExit();
    this.$('exitQuizBtn').onclick = () => {
      if (this.state.mode === 'practice') {
        const choice = confirm(
          'Save your session before exiting?\n\nOK = Save & Exit\nCancel = Exit without saving'
        );
        if (choice) { this.saveAndExit(); return; }
      } else {
        if (!confirm('Exit exam? Your progress will be lost.')) return;
      }
      this.stopTimer();
      this.clearSavedSession();
      this.resetToHome();
    };

    // Results
    this.$('reviewAnswersBtn').onclick = () => this.renderReview();
    this.$('newQuizBtn').onclick       = () => this.resetToHome();

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      // Ignore when modal open or typing in input
      if (!this.$('modeModal').classList.contains('hidden')) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const quizVisible = !this.$('quizScreen').classList.contains('hidden');
      if (!quizVisible) return;

      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); this.goPrev();     break;
        case 'ArrowRight': e.preventDefault(); this.goNext();     break;
        case 'm': case 'M': e.preventDefault();
          this.state.mapOpen ? this.closeMap() : this.openMap();
          break;
        case '1': case '2': case '3': case '4': {
          const i = parseInt(e.key) - 1;
          if (this.state.mode === 'exam') {
            this.selectExamAnswer(i);
          } else {
            const ans = this.state.answers[this.state.current];
            if (ans.selected === null && !ans.skipped) this.pickAnswer(i);
          }
          break;
        }
        case 'r': case 'R': e.preventDefault(); this.toggleMarkForReview(); break;
      }
    });
  },

  /* ================================================================
     UTILITIES
     ================================================================ */
  $(id) { return document.getElementById(id); },

  escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  timeAgo(date) {
    const secs = Math.floor((Date.now() - date.getTime()) / 1000);
    if (secs < 60)      return 'just now';
    if (secs < 3600)    return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400)   return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  },
};

App.init();
