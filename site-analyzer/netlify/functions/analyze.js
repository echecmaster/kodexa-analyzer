const fetch = require('node-fetch');
const cheerio = require('cheerio');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };
  }

  let url;
  try {
    const body = JSON.parse(event.body);
    url = body.url;
    if (!url) throw new Error('URL manquante');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Corps de requête invalide' }) };
  }

  try {
    // ─── Fetch de la page ───
    const startTime = Date.now();
    let response, html, responseHeaders, finalUrl;

    try {
      response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SiteAnalyzer/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
        timeout: 8000
      });

      html = await response.text();
      responseHeaders = response.headers;
      finalUrl = response.url || url;
    } catch (fetchErr) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error: `Impossible d'accéder à ce site : ${fetchErr.message}` })
      };
    }

    const responseTime = Date.now() - startTime;
    const $ = cheerio.load(html);

    // ─── Robots.txt & Sitemap ───
    const baseUrl = new URL(finalUrl).origin;
    let hasRobots = false, hasSitemap = false;

    try {
      const robotsRes = await fetch(`${baseUrl}/robots.txt`, { timeout: 3000 });
      hasRobots = robotsRes.status === 200;
    } catch {}

    try {
      const sitemapRes = await fetch(`${baseUrl}/sitemap.xml`, { timeout: 3000 });
      hasSitemap = sitemapRes.status === 200;
    } catch {}

    // ════════════════════════════════════════
    // ANALYSE SEO
    // ════════════════════════════════════════
    const seoIssues = { strengths: [], weaknesses: [], warnings: [] };
    let seoScore = 100;

    // Title
    const title = $('title').first().text().trim();
    if (!title) {
      seoIssues.weaknesses.push({
        title: 'Balise <title> manquante',
        detail: 'Aucune balise title trouvée sur cette page.',
        recommendation: 'Ajoutez une balise <title> unique et descriptive (30-60 caractères).',
        category: 'seo'
      });
      seoScore -= 15;
    } else if (title.length < 30) {
      seoIssues.warnings.push({
        title: `Balise <title> trop courte (${title.length} caractères)`,
        detail: `"${title.substring(0, 60)}"`,
        recommendation: 'Allongez le titre à 30-60 caractères pour un meilleur référencement.',
        category: 'seo'
      });
      seoScore -= 5;
    } else if (title.length > 60) {
      seoIssues.warnings.push({
        title: `Balise <title> trop longue (${title.length} caractères)`,
        detail: `"${title.substring(0, 60)}..."`,
        recommendation: 'Raccourcissez le titre à 30-60 caractères pour éviter la troncature dans Google.',
        category: 'seo'
      });
      seoScore -= 5;
    } else {
      seoIssues.strengths.push({
        title: `Balise <title> bien optimisée (${title.length} caractères)`,
        detail: `"${title.substring(0, 70)}"`,
        category: 'seo'
      });
    }

    // Meta description
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    if (!metaDesc) {
      seoIssues.weaknesses.push({
        title: 'Meta description manquante',
        detail: 'Aucune meta description trouvée.',
        recommendation: 'Ajoutez une meta description de 120-160 caractères qui décrit le contenu de la page.',
        category: 'seo'
      });
      seoScore -= 10;
    } else if (metaDesc.length < 100) {
      seoIssues.warnings.push({
        title: `Meta description trop courte (${metaDesc.length} caractères)`,
        detail: `"${metaDesc.substring(0, 80)}"`,
        recommendation: 'Visez 120-160 caractères pour une meta description optimale.',
        category: 'seo'
      });
      seoScore -= 3;
    } else if (metaDesc.length > 160) {
      seoIssues.warnings.push({
        title: `Meta description trop longue (${metaDesc.length} caractères)`,
        detail: `"${metaDesc.substring(0, 80)}..."`,
        recommendation: 'La meta description sera tronquée par Google. Limitez à 160 caractères.',
        category: 'seo'
      });
      seoScore -= 3;
    } else {
      seoIssues.strengths.push({
        title: `Meta description bien optimisée (${metaDesc.length} caractères)`,
        detail: `"${metaDesc.substring(0, 80)}"`,
        category: 'seo'
      });
    }

    // H1
    const h1Tags = $('h1');
    if (h1Tags.length === 0) {
      seoIssues.weaknesses.push({
        title: 'Balise H1 manquante',
        detail: 'Aucune balise H1 trouvée sur la page.',
        recommendation: 'Ajoutez exactement une balise H1 par page avec le mot-clé principal.',
        category: 'seo'
      });
      seoScore -= 10;
    } else if (h1Tags.length > 1) {
      seoIssues.warnings.push({
        title: `Plusieurs balises H1 détectées (${h1Tags.length})`,
        detail: 'Une seule balise H1 est recommandée par page.',
        recommendation: 'Gardez uniquement un H1 et utilisez H2, H3 pour les sous-titres.',
        category: 'seo'
      });
      seoScore -= 5;
    } else {
      seoIssues.strengths.push({
        title: 'Balise H1 unique et présente',
        detail: `"${h1Tags.first().text().trim().substring(0, 80)}"`,
        category: 'seo'
      });
    }

    // Structure des titres
    const h2Count = $('h2').length;
    const h3Count = $('h3').length;
    if (h2Count > 0) {
      seoIssues.strengths.push({
        title: `Structure des titres présente (${h2Count} H2, ${h3Count} H3)`,
        detail: 'La hiérarchie des titres est bien structurée.',
        category: 'seo'
      });
    }

    // Images sans alt
    const allImages = $('img');
    const imagesWithoutAlt = $('img:not([alt]), img[alt=""]');
    if (imagesWithoutAlt.length > 0) {
      seoIssues.weaknesses.push({
        title: `${imagesWithoutAlt.length} image(s) sans attribut alt`,
        detail: `Sur ${allImages.length} images au total, ${imagesWithoutAlt.length} n'ont pas d'attribut alt.`,
        recommendation: 'Ajoutez un texte alternatif descriptif à chaque image pour le SEO et l\'accessibilité.',
        category: 'seo'
      });
      seoScore -= Math.min(15, imagesWithoutAlt.length * 2);
    } else if (allImages.length > 0) {
      seoIssues.strengths.push({
        title: `Toutes les images ont un attribut alt (${allImages.length} images)`,
        detail: 'Excellent pour le SEO et l\'accessibilité.',
        category: 'seo'
      });
    }

    // Robots.txt
    if (hasRobots) {
      seoIssues.strengths.push({ title: 'Fichier robots.txt présent', detail: `${baseUrl}/robots.txt`, category: 'seo' });
    } else {
      seoIssues.warnings.push({
        title: 'Fichier robots.txt absent',
        detail: `Aucun robots.txt trouvé à ${baseUrl}/robots.txt`,
        recommendation: 'Créez un fichier robots.txt pour guider les moteurs de recherche.',
        category: 'seo'
      });
      seoScore -= 5;
    }

    // Sitemap
    if (hasSitemap) {
      seoIssues.strengths.push({ title: 'Sitemap XML présent', detail: `${baseUrl}/sitemap.xml`, category: 'seo' });
    } else {
      seoIssues.warnings.push({
        title: 'Sitemap XML absent',
        detail: `Aucun sitemap.xml trouvé à ${baseUrl}/sitemap.xml`,
        recommendation: 'Créez un sitemap.xml et soumettez-le à Google Search Console.',
        category: 'seo'
      });
      seoScore -= 5;
    }

    // Canonical
    const canonical = $('link[rel="canonical"]').attr('href');
    if (canonical) {
      seoIssues.strengths.push({ title: 'Balise canonical présente', detail: canonical, category: 'seo' });
    } else {
      seoIssues.warnings.push({
        title: 'Balise canonical absente',
        recommendation: 'Ajoutez une balise canonical pour éviter le contenu dupliqué.',
        category: 'seo'
      });
      seoScore -= 3;
    }

    // Open Graph
    const ogTitle = $('meta[property="og:title"]').attr('content');
    const ogDesc = $('meta[property="og:description"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');
    const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;

    if (ogCount === 3) {
      seoIssues.strengths.push({ title: 'Balises Open Graph complètes', detail: 'og:title, og:description et og:image présents.', category: 'seo' });
    } else if (ogCount > 0) {
      seoIssues.warnings.push({
        title: `Balises Open Graph incomplètes (${ogCount}/3)`,
        recommendation: 'Complétez og:title, og:description et og:image pour un meilleur partage sur les réseaux sociaux.',
        category: 'seo'
      });
      seoScore -= 3;
    } else {
      seoIssues.warnings.push({
        title: 'Aucune balise Open Graph',
        recommendation: 'Ajoutez les balises og: pour optimiser le partage sur les réseaux sociaux.',
        category: 'seo'
      });
      seoScore -= 5;
    }

    // Lang
    const lang = $('html').attr('lang');
    if (lang) {
      seoIssues.strengths.push({ title: `Attribut lang présent (${lang})`, detail: 'La langue de la page est définie pour les moteurs de recherche.', category: 'seo' });
    } else {
      seoIssues.warnings.push({
        title: 'Attribut lang manquant sur <html>',
        recommendation: 'Ajoutez lang="fr" (ou la langue appropriée) à votre balise <html>.',
        category: 'seo'
      });
      seoScore -= 3;
    }

    seoScore = Math.max(0, Math.min(100, seoScore));

    // ════════════════════════════════════════
    // ANALYSE PERFORMANCE
    // ════════════════════════════════════════
    const perfIssues = { strengths: [], weaknesses: [], warnings: [] };
    let perfScore = 100;

    // Temps de réponse
    if (responseTime < 200) {
      perfIssues.strengths.push({ title: `Temps de réponse excellent (${responseTime}ms)`, detail: 'Le serveur répond très rapidement.', category: 'performance' });
    } else if (responseTime < 500) {
      perfIssues.strengths.push({ title: `Temps de réponse correct (${responseTime}ms)`, detail: 'Le serveur répond dans un délai acceptable.', category: 'performance' });
    } else if (responseTime < 1000) {
      perfIssues.warnings.push({ title: `Temps de réponse lent (${responseTime}ms)`, recommendation: 'Optimisez votre serveur ou utilisez un CDN pour réduire le temps de réponse.', category: 'performance' });
      perfScore -= 10;
    } else {
      perfIssues.weaknesses.push({ title: `Temps de réponse très lent (${responseTime}ms)`, recommendation: 'Votre serveur est trop lent. Envisagez un hébergement plus performant ou un CDN.', category: 'performance' });
      perfScore -= 20;
    }

    // Compression GZIP
    const encoding = responseHeaders.get('content-encoding') || '';
    if (encoding.includes('gzip') || encoding.includes('br')) {
      perfIssues.strengths.push({ title: `Compression activée (${encoding})`, detail: 'La compression réduit significativement la taille des transferts.', category: 'performance' });
    } else {
      perfIssues.weaknesses.push({
        title: 'Compression GZIP/Brotli non activée',
        recommendation: 'Activez la compression sur votre serveur pour réduire jusqu\'à 70% la taille des transferts.',
        category: 'performance'
      });
      perfScore -= 15;
    }

    // Scripts async/defer
    const scripts = $('script[src]');
    const syncScripts = $('script[src]:not([async]):not([defer])');
    if (syncScripts.length === 0 && scripts.length > 0) {
      perfIssues.strengths.push({ title: 'Tous les scripts externes sont asynchrones', detail: `${scripts.length} script(s) avec async ou defer.`, category: 'performance' });
    } else if (syncScripts.length > 0) {
      perfIssues.warnings.push({
        title: `${syncScripts.length} script(s) bloquants sans async/defer`,
        detail: 'Ces scripts ralentissent le chargement de la page.',
        recommendation: 'Ajoutez l\'attribut async ou defer à vos balises <script>.',
        category: 'performance'
      });
      perfScore -= syncScripts.length * 5;
    }

    // Lazy loading images
    const imgsWithLazy = $('img[loading="lazy"]').length;
    if (imgsWithLazy > 0) {
      perfIssues.strengths.push({ title: `Lazy loading activé sur ${imgsWithLazy} image(s)`, detail: 'Le chargement différé des images améliore les performances.', category: 'performance' });
    } else if (allImages.length > 3) {
      perfIssues.warnings.push({
        title: 'Pas de lazy loading sur les images',
        recommendation: 'Ajoutez loading="lazy" à vos images pour améliorer les performances.',
        category: 'performance'
      });
      perfScore -= 5;
    }

    // Images WebP
    const webpImages = $('img[src*=".webp"], source[type="image/webp"]').length;
    if (webpImages > 0) {
      perfIssues.strengths.push({ title: `Format WebP utilisé (${webpImages} ressource(s))`, detail: 'WebP offre une meilleure compression que PNG/JPG.', category: 'performance' });
    } else if (allImages.length > 0) {
      perfIssues.warnings.push({
        title: 'Format WebP non utilisé',
        recommendation: 'Convertissez vos images en WebP pour réduire leur poids jusqu\'à 30%.',
        category: 'performance'
      });
      perfScore -= 5;
    }

    // CSS dans le head
    const cssLinks = $('head link[rel="stylesheet"]').length;
    const cssInBody = $('body link[rel="stylesheet"]').length;
    if (cssInBody > 0) {
      perfIssues.warnings.push({
        title: `${cssInBody} feuille(s) CSS chargée(s) dans le body`,
        recommendation: 'Chargez vos CSS dans le <head> pour éviter le flash de contenu sans style.',
        category: 'performance'
      });
      perfScore -= 5;
    } else if (cssLinks > 0) {
      perfIssues.strengths.push({ title: `CSS correctement placés dans le <head> (${cssLinks})`, category: 'performance' });
    }

    // Inline CSS excessif
    const inlineStyles = $('[style]').length;
    if (inlineStyles > 20) {
      perfIssues.warnings.push({
        title: `Nombreux styles inline détectés (${inlineStyles} éléments)`,
        recommendation: 'Centralisez vos styles dans des fichiers CSS externes pour une meilleure maintenabilité.',
        category: 'performance'
      });
      perfScore -= 5;
    }

    perfScore = Math.max(0, Math.min(100, perfScore));

    // ════════════════════════════════════════
    // ANALYSE SÉCURITÉ
    // ════════════════════════════════════════
    const secIssues = { strengths: [], weaknesses: [], warnings: [] };
    let secScore = 100;

    // HTTPS
    if (url.startsWith('https://')) {
      secIssues.strengths.push({ title: 'HTTPS activé', detail: 'La connexion est chiffrée et sécurisée.', category: 'security' });
    } else {
      secIssues.weaknesses.push({
        title: 'HTTPS non activé',
        detail: 'Le site utilise HTTP non sécurisé.',
        recommendation: 'Installez un certificat SSL/TLS (gratuit avec Let\'s Encrypt).',
        category: 'security'
      });
      secScore -= 30;
    }

    // Headers de sécurité
    const securityHeaders = {
      'content-security-policy': { label: 'Content-Security-Policy (CSP)', points: 15 },
      'x-content-type-options': { label: 'X-Content-Type-Options', points: 8 },
      'x-frame-options': { label: 'X-Frame-Options', points: 8 },
      'strict-transport-security': { label: 'Strict-Transport-Security (HSTS)', points: 10 },
      'referrer-policy': { label: 'Referrer-Policy', points: 5 },
      'permissions-policy': { label: 'Permissions-Policy', points: 5 },
    };

    Object.entries(securityHeaders).forEach(([header, info]) => {
      const value = responseHeaders.get(header);
      if (value) {
        secIssues.strengths.push({ title: `Header ${info.label} présent`, detail: value.substring(0, 80), category: 'security' });
      } else {
        secIssues.weaknesses.push({
          title: `Header ${info.label} manquant`,
          recommendation: `Configurez le header ${header} sur votre serveur pour renforcer la sécurité.`,
          category: 'security'
        });
        secScore -= info.points;
      }
    });

    // Server header (information disclosure)
    const serverHeader = responseHeaders.get('server') || '';
    if (serverHeader && (serverHeader.includes('/') || /\d/.test(serverHeader))) {
      secIssues.warnings.push({
        title: `Header Server expose des informations (${serverHeader})`,
        recommendation: 'Masquez la version du serveur dans le header Server pour limiter les informations exposées.',
        category: 'security'
      });
      secScore -= 5;
    } else if (serverHeader) {
      secIssues.strengths.push({ title: 'Header Server ne révèle pas la version', category: 'security' });
    }

    // X-Powered-By
    const poweredBy = responseHeaders.get('x-powered-by') || '';
    if (poweredBy) {
      secIssues.warnings.push({
        title: `Header X-Powered-By expose la technologie (${poweredBy})`,
        recommendation: 'Supprimez ou masquez le header X-Powered-By.',
        category: 'security'
      });
      secScore -= 5;
    }

    secScore = Math.max(0, Math.min(100, secScore));

    // ════════════════════════════════════════
    // ANALYSE MOBILE
    // ════════════════════════════════════════
    const mobileIssues = { strengths: [], weaknesses: [], warnings: [] };
    let mobileScore = 100;

    // Viewport
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    if (viewport) {
      if (viewport.includes('width=device-width')) {
        mobileIssues.strengths.push({ title: 'Viewport correctement configuré', detail: viewport, category: 'mobile' });
      } else {
        mobileIssues.warnings.push({
          title: 'Viewport présent mais mal configuré',
          detail: viewport,
          recommendation: 'Utilisez <meta name="viewport" content="width=device-width, initial-scale=1">',
          category: 'mobile'
        });
        mobileScore -= 10;
      }
    } else {
      mobileIssues.weaknesses.push({
        title: 'Meta viewport manquant',
        recommendation: 'Ajoutez <meta name="viewport" content="width=device-width, initial-scale=1"> dans votre <head>.',
        category: 'mobile'
      });
      mobileScore -= 25;
    }

    // Media queries
    const htmlStr = $.html();
    const hasMediaQueries = htmlStr.includes('@media') || $('link[media]').length > 0;
    if (hasMediaQueries) {
      mobileIssues.strengths.push({ title: 'Media queries CSS détectées', detail: 'Le design semble responsive.', category: 'mobile' });
    } else {
      mobileIssues.warnings.push({
        title: 'Aucune media query détectée',
        recommendation: 'Ajoutez des media queries CSS pour adapter l\'affichage aux mobiles.',
        category: 'mobile'
      });
      mobileScore -= 20;
    }

    // Touch icons
    const touchIcon = $('link[rel*="apple-touch-icon"]').length ||
                      $('link[rel="icon"]').length;
    if (touchIcon > 0) {
      mobileIssues.strengths.push({ title: 'Icône(s) de raccourci présente(s)', detail: 'Favicon et/ou apple-touch-icon définis.', category: 'mobile' });
    } else {
      mobileIssues.warnings.push({
        title: 'Aucune icône de raccourci définie',
        recommendation: 'Ajoutez un favicon et un apple-touch-icon pour une meilleure expérience mobile.',
        category: 'mobile'
      });
      mobileScore -= 5;
    }

    // Input types
    const emailInputs = $('input[type="email"]').length;
    const telInputs = $('input[type="tel"]').length;
    const numberInputs = $('input[type="number"]').length;
    if (emailInputs + telInputs + numberInputs > 0) {
      mobileIssues.strengths.push({ title: 'Types d\'input appropriés utilisés', detail: `email: ${emailInputs}, tel: ${telInputs}, number: ${numberInputs}`, category: 'mobile' });
    }

    // Manifest PWA
    const manifest = $('link[rel="manifest"]').attr('href');
    if (manifest) {
      mobileIssues.strengths.push({ title: 'Web App Manifest présent (PWA)', detail: manifest, category: 'mobile' });
    } else {
      mobileIssues.warnings.push({
        title: 'Pas de Web App Manifest',
        recommendation: 'Ajoutez un manifest.json pour permettre l\'installation comme application.',
        category: 'mobile'
      });
      mobileScore -= 5;
    }

    mobileScore = Math.max(0, Math.min(100, mobileScore));

    // ════════════════════════════════════════
    // ANALYSE ACCESSIBILITÉ
    // ════════════════════════════════════════
    const a11yIssues = { strengths: [], weaknesses: [], warnings: [] };
    let a11yScore = 100;

    // Lang
    if (lang) {
      a11yIssues.strengths.push({ title: `Langue définie sur <html> (lang="${lang}")`, detail: 'Les lecteurs d\'écran connaissent la langue du contenu.', category: 'accessibility' });
    } else {
      a11yIssues.weaknesses.push({
        title: 'Attribut lang manquant sur <html>',
        recommendation: 'Ajoutez lang="fr" pour les lecteurs d\'écran.',
        category: 'accessibility'
      });
      a11yScore -= 15;
    }

    // Images alt (accessibilité)
    if (imagesWithoutAlt.length > 0) {
      a11yIssues.weaknesses.push({
        title: `${imagesWithoutAlt.length} image(s) sans texte alternatif`,
        detail: 'Les utilisateurs de lecteurs d\'écran ne peuvent pas comprendre ces images.',
        recommendation: 'Ajoutez un attribut alt descriptif à chaque image.',
        category: 'accessibility'
      });
      a11yScore -= Math.min(20, imagesWithoutAlt.length * 3);
    } else if (allImages.length > 0) {
      a11yIssues.strengths.push({ title: 'Toutes les images ont un attribut alt', category: 'accessibility' });
    }

    // Labels formulaires
    const inputs = $('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const inputsWithoutLabel = [];
    inputs.each((_, el) => {
      const id = $(el).attr('id');
      const ariaLabel = $(el).attr('aria-label');
      const ariaLabelledby = $(el).attr('aria-labelledby');
      if (!ariaLabel && !ariaLabelledby && (!id || $(`label[for="${id}"]`).length === 0)) {
        inputsWithoutLabel.push(el);
      }
    });

    if (inputs.length > 0) {
      if (inputsWithoutLabel.length === 0) {
        a11yIssues.strengths.push({ title: 'Tous les champs ont un label associé', detail: `${inputs.length} champ(s) correctement labellisés.`, category: 'accessibility' });
      } else {
        a11yIssues.weaknesses.push({
          title: `${inputsWithoutLabel.length} champ(s) sans label`,
          recommendation: 'Ajoutez un <label for="..."> ou aria-label à chaque champ de formulaire.',
          category: 'accessibility'
        });
        a11yScore -= Math.min(15, inputsWithoutLabel.length * 5);
      }
    }

    // Structure sémantique
    const hasMain = $('main').length > 0;
    const hasNav = $('nav').length > 0;
    const hasHeader = $('header').length > 0;
    const hasFooter = $('footer').length > 0;
    const semanticCount = [hasMain, hasNav, hasHeader, hasFooter].filter(Boolean).length;

    if (semanticCount >= 3) {
      a11yIssues.strengths.push({ title: `Structure sémantique HTML5 (${semanticCount}/4 éléments)`, detail: `main: ${hasMain}, nav: ${hasNav}, header: ${hasHeader}, footer: ${hasFooter}`, category: 'accessibility' });
    } else {
      a11yIssues.warnings.push({
        title: `Structure sémantique incomplète (${semanticCount}/4 éléments)`,
        recommendation: 'Utilisez les éléments HTML5 sémantiques : <main>, <nav>, <header>, <footer>.',
        category: 'accessibility'
      });
      a11yScore -= (4 - semanticCount) * 5;
    }

    // ARIA roles
    const ariaRoles = $('[role]').length;
    if (ariaRoles > 0) {
      a11yIssues.strengths.push({ title: `Attributs ARIA présents (${ariaRoles} éléments)`, category: 'accessibility' });
    } else {
      a11yIssues.warnings.push({
        title: 'Aucun attribut ARIA détecté',
        recommendation: 'Ajoutez des attributs ARIA pour améliorer l\'accessibilité des composants interactifs.',
        category: 'accessibility'
      });
      a11yScore -= 5;
    }

    // Skip link
    const skipLink = $('a[href="#main"], a[href="#content"], a[href="#skip"]').length;
    if (skipLink > 0) {
      a11yIssues.strengths.push({ title: 'Lien "skip to content" présent', detail: 'Facilite la navigation au clavier.', category: 'accessibility' });
    } else {
      a11yIssues.warnings.push({
        title: 'Pas de lien "skip to content"',
        recommendation: 'Ajoutez un lien de navigation rapide pour les utilisateurs au clavier.',
        category: 'accessibility'
      });
      a11yScore -= 5;
    }

    // Liens "cliquez ici"
    const badLinks = [];
    $('a').each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (['cliquez ici', 'click here', 'ici', 'here', 'lire la suite', 'en savoir plus'].includes(text)) {
        badLinks.push(text);
      }
    });
    if (badLinks.length > 0) {
      a11yIssues.warnings.push({
        title: `${badLinks.length} lien(s) avec texte non descriptif`,
        detail: `Textes trouvés: ${[...new Set(badLinks)].join(', ')}`,
        recommendation: 'Utilisez des textes de liens descriptifs qui indiquent la destination.',
        category: 'accessibility'
      });
      a11yScore -= 5;
    }

    // outline: none (CSS inline)
    const noOutline = $('[style*="outline: none"], [style*="outline:none"]').length;
    if (noOutline > 0) {
      a11yIssues.warnings.push({
        title: `${noOutline} élément(s) avec outline désactivé`,
        recommendation: 'Ne désactivez pas l\'outline CSS, il est essentiel pour la navigation au clavier.',
        category: 'accessibility'
      });
      a11yScore -= 5;
    }

    a11yScore = Math.max(0, Math.min(100, a11yScore));

    // ════════════════════════════════════════
    // DÉTECTION TECHNOLOGIES
    // ════════════════════════════════════════
    const technologies = [];
    const htmlLower = html.toLowerCase();
    const serverH = (responseHeaders.get('server') || '').toLowerCase();
    const poweredByH = (responseHeaders.get('x-powered-by') || '').toLowerCase();

    const techChecks = [
      { name: 'WordPress', category: 'CMS', check: () => html.includes('/wp-content/') || html.includes('/wp-includes/') },
      { name: 'Drupal', category: 'CMS', check: () => html.includes('Drupal') || html.includes('/sites/default/') },
      { name: 'Joomla', category: 'CMS', check: () => html.includes('/components/com_') },
      { name: 'Shopify', category: 'E-commerce', check: () => html.includes('cdn.shopify.com') || html.includes('Shopify.theme') },
      { name: 'WooCommerce', category: 'E-commerce', check: () => html.includes('woocommerce') },
      { name: 'React', category: 'Framework JS', check: () => html.includes('__REACT') || html.includes('data-reactroot') || html.includes('react.development') || html.includes('react.production') },
      { name: 'Vue.js', category: 'Framework JS', check: () => html.includes('__vue__') || html.includes('data-v-') || html.includes('vue.min.js') },
      { name: 'Angular', category: 'Framework JS', check: () => html.includes('ng-version') || html.includes('ng-app') || html.includes('angular.min.js') },
      { name: 'Next.js', category: 'Framework JS', check: () => html.includes('__NEXT_DATA__') },
      { name: 'Nuxt.js', category: 'Framework JS', check: () => html.includes('__NUXT__') },
      { name: 'jQuery', category: 'Librairie JS', check: () => htmlLower.includes('jquery') },
      { name: 'Bootstrap', category: 'CSS Framework', check: () => htmlLower.includes('bootstrap') },
      { name: 'Tailwind CSS', category: 'CSS Framework', check: () => html.includes('tailwind') || html.includes('tw-') },
      { name: 'Font Awesome', category: 'Icônes', check: () => htmlLower.includes('font-awesome') || htmlLower.includes('fontawesome') },
      { name: 'Google Analytics', category: 'Analytics', check: () => html.includes('google-analytics.com') || html.includes('gtag(') || html.includes('ga(') },
      { name: 'Google Tag Manager', category: 'Analytics', check: () => html.includes('googletagmanager.com') },
      { name: 'Google Fonts', category: 'Fonts', check: () => html.includes('fonts.googleapis.com') },
      { name: 'Cloudflare', category: 'CDN/Sécurité', check: () => responseHeaders.get('cf-ray') || responseHeaders.get('cf-cache-status') },
      { name: 'Nginx', category: 'Serveur', check: () => serverH.includes('nginx') },
      { name: 'Apache', category: 'Serveur', check: () => serverH.includes('apache') },
      { name: 'PHP', category: 'Backend', check: () => poweredByH.includes('php') || html.includes('.php') },
      { name: 'Node.js', category: 'Backend', check: () => poweredByH.includes('node') || poweredByH.includes('express') },
      { name: 'Netlify', category: 'Hébergement', check: () => responseHeaders.get('x-nf-request-id') || serverH.includes('netlify') },
      { name: 'Vercel', category: 'Hébergement', check: () => responseHeaders.get('x-vercel-id') },
    ];

    techChecks.forEach(tech => {
      try {
        if (tech.check()) {
          technologies.push({ name: tech.name, category: tech.category });
        }
      } catch {}
    });

    // ════════════════════════════════════════
    // CALCUL SCORE GLOBAL
    // ════════════════════════════════════════
    const globalScore = Math.round(
      (seoScore * 0.25) +
      (perfScore * 0.25) +
      (secScore * 0.20) +
      (mobileScore * 0.15) +
      (a11yScore * 0.15)
    );

    // ════════════════════════════════════════
    // CONSOLIDATION DES RÉSULTATS
    // ════════════════════════════════════════
    const allStrengths = [
      ...seoIssues.strengths,
      ...perfIssues.strengths,
      ...secIssues.strengths,
      ...mobileIssues.strengths,
      ...a11yIssues.strengths,
    ];

    const allWeaknesses = [
      ...seoIssues.weaknesses,
      ...perfIssues.weaknesses,
      ...secIssues.weaknesses,
      ...mobileIssues.weaknesses,
      ...a11yIssues.weaknesses,
    ];

    const allWarnings = [
      ...seoIssues.warnings,
      ...perfIssues.warnings,
      ...secIssues.warnings,
      ...mobileIssues.warnings,
      ...a11yIssues.warnings,
    ];

    // ════════════════════════════════════════
    // RÉPONSE FINALE
    // ════════════════════════════════════════
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        url,
        scores: {
          global: globalScore,
          seo: seoScore,
          performance: perfScore,
          security: secScore,
          mobile: mobileScore,
          accessibility: a11yScore,
        },
        strengths: allStrengths,
        weaknesses: allWeaknesses,
        warnings: allWarnings,
        technologies,
      })
    };

  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ error: `Erreur d'analyse : ${err.message}` })
    };
  }
};