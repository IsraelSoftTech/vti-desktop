const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const {
  COOKIE,
  getWebJwtSecret,
  requireWebAdmin,
} = require('./middleware');
const {
  saveWebBase64Image,
  deleteWebImageIfLocal,
  normalizeMpasaText,
  mapDepartment,
  mapHeroSlide,
  mapSiteSettings,
  mapHomeContent,
  mapUniquenessItem,
  mapProgram,
} = require('./helpers');
const {
  slugify,
  getSiteSettingsRow: getFullSiteSettingsRow,
  getHomeContentRow,
  listPublishedUniquenessItems,
  listAllUniquenessItems,
  listFeaturedPrograms,
  listAllPrograms,
  listFeaturedDepartments,
} = require('./homeData');

const router = express.Router();

const SESSION_HOURS = Math.min(
  72,
  Math.max(1, Number(process.env.WEB_SESSION_HOURS) || 12)
);
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

function getWebAdminCredentials() {
  return {
    username: process.env.WEB_ADMIN_USERNAME || 'vti-admin!',
    password: process.env.WEB_ADMIN_PASSWORD || 'vti-admin@',
  };
}

function signWebToken(username) {
  return jwt.sign(
    {
      typ: 'web_admin',
      role: 'web_admin',
      sub: 'web-admin',
      username,
    },
    getWebJwtSecret(),
    { expiresIn: `${SESSION_HOURS}h` }
  );
}

function setWebAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MS,
    path: '/',
  });
}

async function getSiteSettingsRow() {
  return getFullSiteSettingsRow();
}

async function listPublishedHeroSlides() {
  const { rows } = await pool.query(
    `SELECT *
     FROM web_hero_slides
     WHERE is_published = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapHeroSlide);
}

async function listAllHeroSlides() {
  const { rows } = await pool.query(
    `SELECT *
     FROM web_hero_slides
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapHeroSlide);
}

async function listPublishedDepartments() {
  const { rows } = await pool.query(
    `SELECT *
     FROM web_departments
     WHERE is_published = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapDepartment);
}

async function listAllDepartments() {
  const { rows } = await pool.query(
    `SELECT *
     FROM web_departments
     ORDER BY sort_order ASC, id ASC`
  );
  return rows.map(mapDepartment);
}

router.get('/', (req, res) => {
  res.json({ ok: true, module: 'web', version: 1 });
});

router.get('/public/content', async (req, res) => {
  try {
    const settings = await getSiteSettingsRow();
    const departments = await listPublishedDepartments();
    const heroSlides = await listPublishedHeroSlides();
    return res.json({
      ...mapSiteSettings(settings),
      heroSlides,
      departments,
    });
  } catch (err) {
    console.error('[web] public content', err);
    return res.status(500).json({ error: 'Failed to load site content' });
  }
});

router.get('/public/home', async (req, res) => {
  try {
    const settings = await getSiteSettingsRow();
    const homeContent = await getHomeContentRow();
    const heroSlides = await listPublishedHeroSlides();
    const featuredPrograms = (await listFeaturedPrograms(6)).map(mapProgram);
    const uniquenessItems = (await listPublishedUniquenessItems()).map(mapUniquenessItem);
    const featuredDepartments = (await listFeaturedDepartments(4)).map(mapDepartment);

    return res.json({
      settings: mapSiteSettings(settings),
      home: mapHomeContent(homeContent),
      heroSlides,
      featuredPrograms,
      uniquenessItems,
      featuredDepartments,
    });
  } catch (err) {
    console.error('[web] public home', err);
    return res.status(500).json({ error: 'Failed to load home page content' });
  }
});

router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const expected = getWebAdminCredentials();
    if (
      String(username).trim() !== expected.username ||
      String(password) !== expected.password
    ) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signWebToken(expected.username);
    setWebAuthCookie(res, token);
    return res.json({
      ok: true,
      username: expected.username,
      role: 'web_admin',
      token,
    });
  } catch (err) {
    console.error('[web] login', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  return res.json({ ok: true });
});

router.get('/auth/me', requireWebAdmin(), (req, res) => {
  return res.json({
    ok: true,
    username: req.webUser.username,
    role: req.webUser.role,
  });
});

router.get('/admin/site-settings', requireWebAdmin(), async (req, res) => {
  try {
    const settings = await getSiteSettingsRow();
    return res.json(mapSiteSettings(settings));
  } catch (err) {
    console.error('[web] admin site-settings get', err);
    return res.status(500).json({ error: 'Failed to load site settings' });
  }
});

router.put('/admin/site-settings', requireWebAdmin(), async (req, res) => {
  try {
    const {
      schoolName,
      schoolTagline,
      footerAddress,
      footerPhone,
      footerEmail,
      footerHours,
      copyrightText,
      socialLinks,
    } = req.body || {};

    const current = await getSiteSettingsRow();
    const nextSocial =
      socialLinks && typeof socialLinks === 'object'
        ? {
            facebook: socialLinks.facebook ?? current?.social_links?.facebook ?? '',
            instagram: socialLinks.instagram ?? current?.social_links?.instagram ?? '',
            youtube: socialLinks.youtube ?? current?.social_links?.youtube ?? '',
          }
        : current?.social_links || {};

    const { rows } = await pool.query(
      `UPDATE web_site_settings
       SET school_name = $1,
           school_tagline = $2,
           footer_address = $3,
           footer_phone = $4,
           footer_email = $5,
           footer_hours = $6,
           copyright_text = $7,
           social_links = $8::jsonb,
           updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        schoolName != null
          ? normalizeMpasaText(String(schoolName).trim())
          : normalizeMpasaText(current?.school_name),
        schoolTagline != null
          ? normalizeMpasaText(String(schoolTagline).trim())
          : normalizeMpasaText(current?.school_tagline),
        footerAddress != null
          ? normalizeMpasaText(String(footerAddress).trim())
          : normalizeMpasaText(current?.footer_address),
        footerPhone != null ? String(footerPhone).trim() : current?.footer_phone,
        footerEmail != null ? String(footerEmail).trim() : current?.footer_email,
        footerHours != null
          ? normalizeMpasaText(String(footerHours).trim())
          : normalizeMpasaText(current?.footer_hours),
        copyrightText != null
          ? normalizeMpasaText(String(copyrightText).trim())
          : normalizeMpasaText(current?.copyright_text),
        JSON.stringify(nextSocial),
      ]
    );

    return res.json(mapSiteSettings(rows[0]));
  } catch (err) {
    console.error('[web] admin site-settings update', err);
    return res.status(500).json({ error: 'Failed to update site settings' });
  }
});

router.get('/admin/home', requireWebAdmin(), async (req, res) => {
  try {
    const homeContent = await getHomeContentRow();
    const uniquenessItems = (await listAllUniquenessItems()).map(mapUniquenessItem);
    return res.json({
      home: mapHomeContent(homeContent),
      uniquenessItems,
    });
  } catch (err) {
    console.error('[web] admin home get', err);
    return res.status(500).json({ error: 'Failed to load home content' });
  }
});

router.put('/admin/home', requireWebAdmin(), async (req, res) => {
  try {
    const body = req.body || {};
    const current = await getHomeContentRow();

    let introImageUrl = current?.intro_image_url || null;
    let heroBannerUrl = current?.hero_banner_url || null;

    if (body.removeIntroImage) {
      await deleteWebImageIfLocal(introImageUrl);
      introImageUrl = null;
    } else if (body.introImageDataUrl) {
      const nextUrl = await saveWebBase64Image(body.introImageDataUrl, 'intro');
      if (nextUrl) {
        await deleteWebImageIfLocal(introImageUrl);
        introImageUrl = nextUrl;
      }
    }

    if (body.removeHeroBanner) {
      await deleteWebImageIfLocal(heroBannerUrl);
      heroBannerUrl = null;
    } else if (body.heroBannerDataUrl) {
      const nextUrl = await saveWebBase64Image(body.heroBannerDataUrl, 'hero-banner');
      if (nextUrl) {
        await deleteWebImageIfLocal(heroBannerUrl);
        heroBannerUrl = nextUrl;
      }
    }

    const { rows } = await pool.query(
      `UPDATE web_home_content SET
         hero_banner_url = $1,
         hero_headline = $2,
         hero_subheadline = $3,
         hero_cta_primary_label = $4,
         hero_cta_primary_url = $5,
         hero_cta_secondary_label = $6,
         hero_cta_secondary_url = $7,
         intro_title = $8,
         intro_body = $9,
         intro_image_url = $10,
         admission_summary_title = $11,
         admission_summary_body = $12,
         updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        heroBannerUrl,
        body.heroHeadline != null
          ? normalizeMpasaText(String(body.heroHeadline).trim())
          : normalizeMpasaText(current?.hero_headline),
        body.heroSubheadline != null
          ? normalizeMpasaText(String(body.heroSubheadline).trim())
          : normalizeMpasaText(current?.hero_subheadline),
        body.heroCtaPrimaryLabel != null
          ? String(body.heroCtaPrimaryLabel).trim()
          : current?.hero_cta_primary_label,
        body.heroCtaPrimaryUrl != null
          ? String(body.heroCtaPrimaryUrl).trim()
          : current?.hero_cta_primary_url,
        body.heroCtaSecondaryLabel != null
          ? String(body.heroCtaSecondaryLabel).trim()
          : current?.hero_cta_secondary_label,
        body.heroCtaSecondaryUrl != null
          ? String(body.heroCtaSecondaryUrl).trim()
          : current?.hero_cta_secondary_url,
        body.introTitle != null
          ? normalizeMpasaText(String(body.introTitle).trim())
          : normalizeMpasaText(current?.intro_title),
        body.introBody != null
          ? normalizeMpasaText(String(body.introBody).trim())
          : normalizeMpasaText(current?.intro_body),
        introImageUrl,
        body.admissionSummaryTitle != null
          ? normalizeMpasaText(String(body.admissionSummaryTitle).trim())
          : normalizeMpasaText(current?.admission_summary_title),
        body.admissionSummaryBody != null
          ? normalizeMpasaText(String(body.admissionSummaryBody).trim())
          : normalizeMpasaText(current?.admission_summary_body),
      ]
    );

    return res.json({ home: mapHomeContent(rows[0]) });
  } catch (err) {
    console.error('[web] admin home update', err);
    return res.status(500).json({ error: 'Failed to update home content' });
  }
});

router.post('/admin/uniqueness-items', requireWebAdmin(), async (req, res) => {
  try {
    const { title, description, sortOrder, isPublished, iconDataUrl } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const iconUrl = iconDataUrl ? await saveWebBase64Image(iconDataUrl, 'uniqueness') : null;

    const { rows } = await pool.query(
      `INSERT INTO web_uniqueness_items (title, description, icon_url, sort_order, is_published)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        String(title).trim(),
        description ? String(description).trim() : null,
        iconUrl,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        isPublished !== false,
      ]
    );

    return res.status(201).json({ item: mapUniquenessItem(rows[0]) });
  } catch (err) {
    console.error('[web] admin uniqueness create', err);
    return res.status(500).json({ error: 'Failed to create uniqueness item' });
  }
});

router.put('/admin/uniqueness-items/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM web_uniqueness_items WHERE id = $1',
      [id]
    );
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Uniqueness item not found' });
    }

    const { title, description, sortOrder, isPublished, iconDataUrl, removeIcon } = req.body || {};
    let iconUrl = existing.icon_url;
    if (removeIcon) {
      await deleteWebImageIfLocal(iconUrl);
      iconUrl = null;
    } else if (iconDataUrl) {
      const nextUrl = await saveWebBase64Image(iconDataUrl, 'uniqueness');
      if (nextUrl) {
        await deleteWebImageIfLocal(iconUrl);
        iconUrl = nextUrl;
      }
    }

    const { rows } = await pool.query(
      `UPDATE web_uniqueness_items
       SET title = $1,
           description = $2,
           icon_url = $3,
           sort_order = $4,
           is_published = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        title != null ? String(title).trim() : existing.title,
        description != null ? String(description).trim() : existing.description,
        iconUrl,
        sortOrder != null && Number.isFinite(Number(sortOrder))
          ? Number(sortOrder)
          : existing.sort_order,
        isPublished != null ? Boolean(isPublished) : existing.is_published,
        id,
      ]
    );

    return res.json({ item: mapUniquenessItem(rows[0]) });
  } catch (err) {
    console.error('[web] admin uniqueness update', err);
    return res.status(500).json({ error: 'Failed to update uniqueness item' });
  }
});

router.delete('/admin/uniqueness-items/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const { rows } = await pool.query('SELECT * FROM web_uniqueness_items WHERE id = $1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Uniqueness item not found' });
    }

    await deleteWebImageIfLocal(existing.icon_url);
    await pool.query('DELETE FROM web_uniqueness_items WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[web] admin uniqueness delete', err);
    return res.status(500).json({ error: 'Failed to delete uniqueness item' });
  }
});

router.get('/admin/programs', requireWebAdmin(), async (req, res) => {
  try {
    const programs = (await listAllPrograms()).map(mapProgram);
    return res.json({ programs });
  } catch (err) {
    console.error('[web] admin programs list', err);
    return res.status(500).json({ error: 'Failed to load programs' });
  }
});

router.post('/admin/programs', requireWebAdmin(), async (req, res) => {
  try {
    const {
      name,
      category,
      shortDescription,
      fullDescription,
      durationInfo,
      isFeatured,
      isPublished,
      sortOrder,
      coverImageDataUrl,
    } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Program name is required' });
    }

    const coverImageUrl = coverImageDataUrl
      ? await saveWebBase64Image(coverImageDataUrl, 'program')
      : null;
    const programSlug = slugify(name);

    const { rows } = await pool.query(
      `INSERT INTO web_programs
         (name, slug, category, short_description, full_description, cover_image_url,
          duration_info, is_featured, is_published, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        String(name).trim(),
        programSlug || `program-${Date.now()}`,
        category ? String(category).trim() : null,
        shortDescription ? String(shortDescription).trim() : null,
        fullDescription ? String(fullDescription).trim() : null,
        coverImageUrl,
        durationInfo ? String(durationInfo).trim() : null,
        Boolean(isFeatured),
        isPublished !== false,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      ]
    );

    return res.status(201).json({ program: mapProgram(rows[0]) });
  } catch (err) {
    console.error('[web] admin program create', err);
    return res.status(500).json({ error: 'Failed to create program' });
  }
});

router.put('/admin/programs/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid program id' });
    }

    const { rows: existingRows } = await pool.query('SELECT * FROM web_programs WHERE id = $1', [id]);
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    const {
      name,
      category,
      shortDescription,
      fullDescription,
      durationInfo,
      isFeatured,
      isPublished,
      sortOrder,
      coverImageDataUrl,
      removeCoverImage,
    } = req.body || {};

    let coverImageUrl = existing.cover_image_url;
    if (removeCoverImage) {
      await deleteWebImageIfLocal(coverImageUrl);
      coverImageUrl = null;
    } else if (coverImageDataUrl) {
      const nextUrl = await saveWebBase64Image(coverImageDataUrl, 'program');
      if (nextUrl) {
        await deleteWebImageIfLocal(coverImageUrl);
        coverImageUrl = nextUrl;
      }
    }

    const nextName = name != null ? String(name).trim() : existing.name;

    const { rows } = await pool.query(
      `UPDATE web_programs
       SET name = $1,
           slug = $2,
           category = $3,
           short_description = $4,
           full_description = $5,
           cover_image_url = $6,
           duration_info = $7,
           is_featured = $8,
           is_published = $9,
           sort_order = $10,
           updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        nextName,
        slugify(nextName) || existing.slug,
        category != null ? String(category).trim() : existing.category,
        shortDescription != null ? String(shortDescription).trim() : existing.short_description,
        fullDescription != null ? String(fullDescription).trim() : existing.full_description,
        coverImageUrl,
        durationInfo != null ? String(durationInfo).trim() : existing.duration_info,
        isFeatured != null ? Boolean(isFeatured) : existing.is_featured,
        isPublished != null ? Boolean(isPublished) : existing.is_published,
        sortOrder != null && Number.isFinite(Number(sortOrder))
          ? Number(sortOrder)
          : existing.sort_order,
        id,
      ]
    );

    return res.json({ program: mapProgram(rows[0]) });
  } catch (err) {
    console.error('[web] admin program update', err);
    return res.status(500).json({ error: 'Failed to update program' });
  }
});

router.delete('/admin/programs/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid program id' });
    }

    const { rows } = await pool.query('SELECT * FROM web_programs WHERE id = $1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Program not found' });
    }

    await deleteWebImageIfLocal(existing.cover_image_url);
    await pool.query('DELETE FROM web_programs WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[web] admin program delete', err);
    return res.status(500).json({ error: 'Failed to delete program' });
  }
});

router.put('/admin/site-settings/logo', requireWebAdmin(), async (req, res) => {
  try {
    const { imageDataUrl } = req.body || {};
    const logoUrl = await saveWebBase64Image(imageDataUrl, 'logo');
    if (!logoUrl) {
      return res.status(400).json({ error: 'Valid image data required' });
    }

    const current = await getSiteSettingsRow();
    await deleteWebImageIfLocal(current.logo_url);

    const { rows } = await pool.query(
      `UPDATE web_site_settings
       SET logo_url = $1, updated_at = NOW()
       WHERE id = 1
       RETURNING logo_url, hero_image_url, updated_at, school_name, school_tagline,
                 footer_address, footer_phone, footer_email, footer_hours, copyright_text, social_links`,
      [logoUrl]
    );

    return res.json(mapSiteSettings(rows[0]));
  } catch (err) {
    console.error('[web] admin logo upload', err);
    return res.status(500).json({ error: 'Failed to upload logo' });
  }
});

router.delete('/admin/site-settings/logo', requireWebAdmin(), async (req, res) => {
  try {
    const current = await getSiteSettingsRow();
    await deleteWebImageIfLocal(current.logo_url);

    const { rows } = await pool.query(
      `UPDATE web_site_settings
       SET logo_url = NULL, updated_at = NOW()
       WHERE id = 1
       RETURNING logo_url, hero_image_url, updated_at`
    );

    return res.json(mapSiteSettings(rows[0]));
  } catch (err) {
    console.error('[web] admin logo delete', err);
    return res.status(500).json({ error: 'Failed to remove logo' });
  }
});

router.put('/admin/site-settings/hero', requireWebAdmin(), async (req, res) => {
  return res.status(410).json({
    error: 'Single hero upload removed. Use POST /api/web/admin/hero-slides instead.',
  });
});

router.delete('/admin/site-settings/hero', requireWebAdmin(), async (req, res) => {
  return res.status(410).json({
    error: 'Single hero removal removed. Use DELETE /api/web/admin/hero-slides/:id instead.',
  });
});

router.get('/admin/hero-slides', requireWebAdmin(), async (req, res) => {
  try {
    const heroSlides = await listAllHeroSlides();
    return res.json({ heroSlides });
  } catch (err) {
    console.error('[web] admin hero-slides list', err);
    return res.status(500).json({ error: 'Failed to load hero slides' });
  }
});

router.post('/admin/hero-slides', requireWebAdmin(), async (req, res) => {
  try {
    const { imageDataUrl, sortOrder, isPublished } = req.body || {};
    const imageUrl = await saveWebBase64Image(imageDataUrl, 'hero');
    if (!imageUrl) {
      return res.status(400).json({ error: 'Valid image data required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO web_hero_slides (image_url, sort_order, is_published)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        imageUrl,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        isPublished !== false,
      ]
    );

    return res.status(201).json({ heroSlide: mapHeroSlide(rows[0]) });
  } catch (err) {
    console.error('[web] admin hero-slide create', err);
    return res.status(500).json({ error: 'Failed to add hero slide' });
  }
});

router.put('/admin/hero-slides/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid slide id' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM web_hero_slides WHERE id = $1',
      [id]
    );
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Hero slide not found' });
    }

    const { imageDataUrl, sortOrder, isPublished } = req.body || {};
    let imageUrl = existing.image_url;
    if (imageDataUrl) {
      const nextUrl = await saveWebBase64Image(imageDataUrl, 'hero');
      if (nextUrl) {
        await deleteWebImageIfLocal(existing.image_url);
        imageUrl = nextUrl;
      }
    }

    const { rows } = await pool.query(
      `UPDATE web_hero_slides
       SET image_url = $1,
           sort_order = $2,
           is_published = $3
       WHERE id = $4
       RETURNING *`,
      [
        imageUrl,
        sortOrder != null && Number.isFinite(Number(sortOrder))
          ? Number(sortOrder)
          : existing.sort_order,
        isPublished != null ? Boolean(isPublished) : existing.is_published,
        id,
      ]
    );

    return res.json({ heroSlide: mapHeroSlide(rows[0]) });
  } catch (err) {
    console.error('[web] admin hero-slide update', err);
    return res.status(500).json({ error: 'Failed to update hero slide' });
  }
});

router.delete('/admin/hero-slides/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid slide id' });
    }

    const { rows } = await pool.query('SELECT * FROM web_hero_slides WHERE id = $1', [id]);
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Hero slide not found' });
    }

    await deleteWebImageIfLocal(existing.image_url);
    await pool.query('DELETE FROM web_hero_slides WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[web] admin hero-slide delete', err);
    return res.status(500).json({ error: 'Failed to delete hero slide' });
  }
});

router.get('/admin/departments', requireWebAdmin(), async (req, res) => {
  try {
    const departments = await listAllDepartments();
    return res.json({ departments });
  } catch (err) {
    console.error('[web] admin departments list', err);
    return res.status(500).json({ error: 'Failed to load departments' });
  }
});

router.post('/admin/departments', requireWebAdmin(), async (req, res) => {
  try {
    const { name, tag, summary, imageDataUrl, sortOrder, isPublished, isFeatured } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Department name is required' });
    }

    const imageUrl = imageDataUrl
      ? await saveWebBase64Image(imageDataUrl, 'department')
      : null;

    const { rows } = await pool.query(
      `INSERT INTO web_departments (name, tag, summary, image_url, sort_order, is_published, is_featured)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        String(name).trim(),
        tag ? String(tag).trim() : null,
        summary ? String(summary).trim() : null,
        imageUrl,
        Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
        isPublished !== false,
        Boolean(isFeatured),
      ]
    );

    return res.status(201).json({ department: mapDepartment(rows[0]) });
  } catch (err) {
    console.error('[web] admin department create', err);
    return res.status(500).json({ error: 'Failed to create department' });
  }
});

router.put('/admin/departments/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid department id' });
    }

    const { rows: existingRows } = await pool.query(
      'SELECT * FROM web_departments WHERE id = $1',
      [id]
    );
    const existing = existingRows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const { name, tag, summary, imageDataUrl, sortOrder, isPublished, isFeatured, removeImage } =
      req.body || {};

    let imageUrl = existing.image_url;
    if (removeImage) {
      await deleteWebImageIfLocal(existing.image_url);
      imageUrl = null;
    } else if (imageDataUrl) {
      const nextUrl = await saveWebBase64Image(imageDataUrl, 'department');
      if (nextUrl) {
        await deleteWebImageIfLocal(existing.image_url);
        imageUrl = nextUrl;
      }
    }

    const { rows } = await pool.query(
      `UPDATE web_departments
       SET name = $1,
           tag = $2,
           summary = $3,
           image_url = $4,
           sort_order = $5,
           is_published = $6,
           is_featured = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [
        name != null ? String(name).trim() : existing.name,
        tag != null ? String(tag).trim() : existing.tag,
        summary != null ? String(summary).trim() : existing.summary,
        imageUrl,
        sortOrder != null && Number.isFinite(Number(sortOrder))
          ? Number(sortOrder)
          : existing.sort_order,
        isPublished != null ? Boolean(isPublished) : existing.is_published,
        isFeatured != null ? Boolean(isFeatured) : existing.is_featured,
        id,
      ]
    );

    return res.json({ department: mapDepartment(rows[0]) });
  } catch (err) {
    console.error('[web] admin department update', err);
    return res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/admin/departments/:id', requireWebAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'Invalid department id' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM web_departments WHERE id = $1',
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Department not found' });
    }

    await deleteWebImageIfLocal(existing.image_url);
    await pool.query('DELETE FROM web_departments WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[web] admin department delete', err);
    return res.status(500).json({ error: 'Failed to delete department' });
  }
});

module.exports = router;
