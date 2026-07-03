/* ═══════════════════════════════════════════════════
   APP.JS — Logique principale
═══════════════════════════════════════════════════ */

// ─── Éléments DOM ───
const pageHome     = document.getElementById('page-home');
const pageLoading  = document.getElementById('page-loading');
const pageResults  = document.getElementById('page-results');
const urlInput     = document.getElementById('url-input');
const btnAnalyze   = document.getElementById('btn-analyze');
const inputError   = document.getElementById('input-error');
const loadingUrl   = document.getElementById('loading-url');
const loadingBar   = document.getElementById('loading-bar');
const btnNewAnalysis    = document.getElementById('btn-new-analysis');
const btnDownloadPdf    = document.getElementById('btn-download-pdf');
const btnDownloadPdf2   = document.getElementById('btn-download-pdf-2');

// Données globales du dernier rapport
let currentReport = null;

/* ═══════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════ */
function showPage(pageId) {
  [pageHome, pageLoading, pageResults].forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  const target = document.getElementById(pageId);
  target.classList.remove('hidden');
  target.classList.add('active');
  window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════
   VALIDATION URL
═══════════════════════════════════════════════════ */
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeUrl(url) {
  url = url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

/* ═══════════════════════════════════════════════════
   ANIMATION DE CHARGEMENT
═══════════════════════════════════════════════════ */
const steps = ['step-1','step-2','step-3','step-4','step-5','step-6'];
const stepDurations = [10, 25, 40, 60, 80, 95];

function startLoadingAnimation() {
  steps.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active','done');
    el.querySelector('.step-icon').textContent = '⟳';
  });
  loadingBar.style.width = '0%';

  let currentStep = 0;

  const interval = setInterval(() => {
    if (currentStep < steps.length) {
      if (currentStep > 0) {
        const prevEl = document.getElementById(steps[currentStep - 1]);
        prevEl.classList.remove('active');
        prevEl.classList.add('done');
        prevEl.querySelector('.step-icon').textContent = '✓';
      }
      const el = document.getElementById(steps[currentStep]);
      el.classList.add('active');
      loadingBar.style.width = stepDurations[currentStep] + '%';
      currentStep++;
    } else {
      clearInterval(interval);
    }
  }, 1000);

  return interval;
}

function finishLoadingAnimation(interval) {
  clearInterval(interval);
  loadingBar.style.width = '100%';
  steps.forEach(id => {
    const el = document.getElementById(id);
    el.classList.remove('active');
    el.classList.add('done');
    el.querySelector('.step-icon').textContent = '✓';
  });
}

/* ═══════════════════════════════════════════════════
   LANCEMENT DE L'ANALYSE
═══════════════════════════════════════════════════ */
async function launchAnalysis() {
  let url = urlInput.value;
  url = normalizeUrl(url);

  if (!isValidUrl(url)) {
    inputError.classList.remove('hidden');
    urlInput.focus();
    return;
  }

  inputError.classList.add('hidden');
  loadingUrl.textContent = url;

  showPage('page-loading');
  const loadingInterval = startLoadingAnimation();

  try {
    const response = await fetch('/.netlify/functions/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error(`Erreur serveur: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    finishLoadingAnimation(loadingInterval);
    currentReport = data;

    setTimeout(() => {
      renderResults(data);
      showPage('page-results');
    }, 600);

  } catch (err) {
    clearInterval(loadingInterval);
    showPage('page-home');
    inputError.textContent = '⚠ ' + (err.message || 'Erreur lors de l\'analyse. Vérifiez l\'URL et réessayez.');
    inputError.classList.remove('hidden');
  }
}

/* ═══════════════════════════════════════════════════
   RENDU DES RÉSULTATS
═══════════════════════════════════════════════════ */
function getScoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 50) return 'medium';
  return 'bad';
}

function getScoreLabel(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Très bon';
  if (score >= 70) return 'Bon';
  if (score >= 50) return 'Moyen';
  if (score >= 30) return 'Faible';
  return 'Critique';
}

function getScoreSummary(score) {
  if (score >= 80) return 'Ce site présente d\'excellentes pratiques. Quelques optimisations mineures restent possibles.';
  if (score >= 60) return 'Ce site a de bonnes bases. Plusieurs améliorations importantes peuvent booster ses performances.';
  if (score >= 40) return 'Ce site nécessite des améliorations significatives dans plusieurs domaines.';
  return 'Ce site présente des problèmes critiques qui nécessitent une attention immédiate.';
}

function renderResults(data) {
  // URL & date
  document.getElementById('report-url').textContent = data.url;
  document.getElementById('report-date').textContent =
    new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // Score global
  const globalScore = data.scores.global;
  const scoreClass = getScoreClass(globalScore);

  const scoreNumber = document.getElementById('global-score-number');
  const scoreProgress = document.getElementById('score-progress');
  const scoreLabel = document.getElementById('global-score-label');
  const scoreSummary = document.getElementById('score-summary');

  scoreProgress.classList.add(`stroke-${scoreClass}`);
  scoreLabel.textContent = getScoreLabel(globalScore);
  scoreLabel.className = `score-label-text score-${scoreClass}`;
  scoreSummary.textContent = getScoreSummary(globalScore);

  // Animation du chiffre
  animateNumber(scoreNumber, 0, globalScore, 1500);

  // Animation du cercle (circumférence = 534)
  setTimeout(() => {
    const offset = 534 - (534 * globalScore / 100);
    scoreProgress.style.strokeDashoffset = offset;
  }, 100);

  // Scores catégories
  const categories = {
    seo: data.scores.seo,
    performance: data.scores.performance,
    security: data.scores.security,
    mobile: data.scores.mobile,
    accessibility: data.scores.accessibility
  };

  Object.entries(categories).forEach(([cat, score]) => {
    const bar = document.getElementById(`bar-${cat}`);
    const scoreEl = document.getElementById(`score-${cat}`);
    const cls = getScoreClass(score);

    scoreEl.textContent = `${score}/100`;
    scoreEl.className = `cat-score-number score-${cls}`;

    setTimeout(() => {
      bar.style.width = score + '%';
      bar.className = `cat-bar-fill fill-${cls}`;
    }, 200);
  });

  // Points forts
  renderItems('strengths-list', 'strengths-count', data.strengths, 'success');
  // Points faibles
  renderItems('weaknesses-list', 'weaknesses-count', data.weaknesses, 'error');
  // Avertissements
  renderItems('warnings-list', 'warnings-count', data.warnings, 'warning');

  // Technologies
  renderTechnologies(data.technologies);
}

function renderItems(listId, countId, items, type) {
  const list = document.getElementById(listId);
  const count = document.getElementById(countId);

  list.innerHTML = '';
  count.textContent = items.length;

  if (items.length === 0) {
    list.innerHTML = `<p style="color: var(--grey); font-size: 14px; padding: 12px 0;">Aucun élément dans cette catégorie.</p>`;
    return;
  }

  items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `report-item ${type}`;
    div.style.animationDelay = `${index * 0.05}s`;

    div.innerHTML = `
      <div class="item-header">
        <span class="item-title">${item.title}</span>
        <span class="item-badge badge-${item.category}">${item.category}</span>
      </div>
      ${item.detail ? `<span class="item-detail">${item.detail}</span>` : ''}
      ${item.recommendation ? `<span class="item-recommendation">💡 ${item.recommendation}</span>` : ''}
    `;

    list.appendChild(div);
  });
}

function renderTechnologies(technologies) {
  const grid = document.getElementById('technologies-list');
  grid.innerHTML = '';

  if (!technologies || technologies.length === 0) {
    grid.innerHTML = '<p style="color: var(--grey); font-size: 14px;">Aucune technologie détectée avec certitude.</p>';
    return;
  }

  technologies.forEach(tech => {
    const div = document.createElement('div');
    div.className = 'tech-tag';
    div.innerHTML = `
      <span>${tech.name}</span>
      <span class="tech-category">${tech.category}</span>
    `;
    grid.appendChild(div);
  });
}

function animateNumber(el, start, end, duration) {
  const startTime = performance.now();
  const update = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(start + (end - start) * eased);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════════════
   GÉNÉRATION PDF
═══════════════════════════════════════════════════ */
function generatePDF() {
  if (!currentReport) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];
  const ACCENT = [109, 0, 26];
  const GREY = [136, 136, 136];
  const GREY_LIGHT = [240, 240, 240];
  const SUCCESS = [76, 175, 80];
  const WARNING = [255, 152, 0];
  const ERROR = [244, 67, 54];

  const W = 210;
  let y = 0;

  function getScoreColorArr(score) {
    if (score >= 80) return SUCCESS;
    if (score >= 50) return WARNING;
    return ERROR;
  }

  // ─── Page 1 : Header + Score global ───
  // Fond noir
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, W, 297, 'F');

  // Bande accent en haut
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, W, 2, 'F');

  // Logo
  y = 20;
  doc.setTextColor(...ACCENT);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('◆ SITEANALYZER', 20, y);

  // Titre rapport
  y = 40;
  doc.setTextColor(...WHITE);
  doc.setFontSize(28);
  doc.text('RAPPORT D\'ANALYSE', 20, y);

  // URL
  y = 52;
  doc.setTextColor(...ACCENT);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(currentReport.url, 20, y);

  // Date
  y = 60;
  doc.setTextColor(...GREY);
  doc.setFontSize(10);
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(dateStr, 20, y);

  // Ligne séparatrice
  y = 68;
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.5);
  doc.line(20, y, W - 20, y);

  // Score global
  y = 85;
  doc.setTextColor(...WHITE);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SCORE GLOBAL', 20, y);

  y = 100;
  const globalScore = currentReport.scores.global;
  const scoreColor = getScoreColorArr(globalScore);
  doc.setTextColor(...scoreColor);
  doc.setFontSize(52);
  doc.setFont('helvetica', 'bold');
  doc.text(`${globalScore}`, 20, y);
  doc.setTextColor(...GREY);
  doc.setFontSize(20);
  doc.text('/100', 48, y);

  doc.setTextColor(...scoreColor);
  doc.setFontSize(12);
  doc.text(getScoreLabel(globalScore).toUpperCase(), 20, 108);

  // Scores catégories
  y = 125;
  doc.setTextColor(...WHITE);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('SCORES PAR CATÉGORIE', 20, y);

  y = 135;
  const cats = [
    { name: '🔍 SEO', score: currentReport.scores.seo },
    { name: '🚀 Performance', score: currentReport.scores.performance },
    { name: '🔒 Sécurité', score: currentReport.scores.security },
    { name: '📱 Mobile', score: currentReport.scores.mobile },
    { name: '♿ Accessibilité', score: currentReport.scores.accessibility },
  ];

  cats.forEach(cat => {
    const color = getScoreColorArr(cat.score);
    const barW = (W - 80) * cat.score / 100;

    doc.setTextColor(...GREY_LIGHT);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(cat.name, 20, y);

    doc.setFillColor(30, 30, 30);
    doc.roundedRect(80, y - 4, W - 100, 6, 1, 1, 'F');
    doc.setFillColor(...color);
    if (barW > 0) doc.roundedRect(80, y - 4, barW, 6, 1, 1, 'F');

    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.text(`${cat.score}/100`, W - 18, y, { align: 'right' });

    y += 14;
  });

  // ─── Page 2 : Points forts & faibles ───
  doc.addPage();
  doc.setFillColor(...BLACK);
  doc.rect(0, 0, W, 297, 'F');
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, W, 2, 'F');

  y = 20;

  function renderPDFSection(title, items, color) {
    if (items.length === 0) return;

    doc.setTextColor(...color);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 20, y);
    y += 10;

    items.slice(0, 8).forEach(item => {
      if (y > 270) {
        doc.addPage();
        doc.setFillColor(...BLACK);
        doc.rect(0, 0, W, 297, 'F');
        y = 20;
      }

      doc.setFillColor(17, 17, 17);
      doc.roundedRect(20, y, W - 40, 14, 2, 2, 'F');

      doc.setTextColor(...WHITE);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');

      const titleText = doc.splitTextToSize(item.title, W - 70);
      doc.text(titleText[0], 26, y + 9);

      doc.setTextColor(...GREY);
      doc.setFontSize(8);
      doc.text(item.category.toUpperCase(), W - 24, y + 9, { align: 'right' });

      y += 18;
    });

    y += 8;
  }

  renderPDFSection('✅ POINTS FORTS', currentReport.strengths, SUCCESS);
  renderPDFSection('❌ POINTS FAIBLES', currentReport.weaknesses, ERROR);
  renderPDFSection('⚠️ AVERTISSEMENTS', currentReport.warnings, WARNING);

  // Technologies
  if (currentReport.technologies && currentReport.technologies.length > 0) {
    if (y > 240) {
      doc.addPage();
      doc.setFillColor(...BLACK);
      doc.rect(0, 0, W, 297, 'F');
      y = 20;
    }

    doc.setTextColor(...WHITE);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('🛠️ TECHNOLOGIES DÉTECTÉES', 20, y);
    y += 10;

    const techsPerRow = 3;
    const techW = (W - 50) / techsPerRow;

    currentReport.technologies.forEach((tech, i) => {
      const col = i % techsPerRow;
      const xPos = 20 + col * (techW + 5);

      if (col === 0 && i > 0) y += 12;
      if (y > 280) return;

      doc.setFillColor(17, 17, 17);
      doc.roundedRect(xPos, y, techW, 10, 2, 2, 'F');
      doc.setTextColor(...WHITE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(tech.name, xPos + techW / 2, y + 6.5, { align: 'center' });
    });
  }

  // Footer sur chaque page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...ACCENT);
    doc.rect(0, 293, W, 4, 'F');
    doc.setTextColor(...GREY);
    doc.setFontSize(8);
    doc.text('SITE ANALYZER · Gratuit · Aucune donnée stockée', 20, 291);
    doc.text(`${i}/${pageCount}`, W - 20, 291, { align: 'right' });
  }

  const domain = currentReport.url.replace(/https?:\/\//, '').replace(/\//g, '_');
  doc.save(`rapport-${domain}-${Date.now()}.pdf`);
}

/* ═══════════════════════════════════════════════════
   ÉVÉNEMENTS
═══════════════════════════════════════════════════ */
btnAnalyze.addEventListener('click', launchAnalysis);

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') launchAnalysis();
});

urlInput.addEventListener('input', () => {
  if (!inputError.classList.contains('hidden')) {
    inputError.classList.add('hidden');
  }
});

btnNewAnalysis.addEventListener('click', () => {
  showPage('page-home');
  urlInput.value = '';
  currentReport = null;
});

btnDownloadPdf.addEventListener('click', generatePDF);
btnDownloadPdf2.addEventListener('click', generatePDF);