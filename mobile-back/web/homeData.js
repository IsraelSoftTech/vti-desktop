const { pool } = require('../db');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function getSiteSettingsRow() {
  const { rows } = await pool.query(
    `SELECT logo_url, school_name, school_tagline, footer_address, footer_phone,
            footer_email, footer_hours, copyright_text, social_links, updated_at
     FROM web_site_settings
     WHERE id = 1`
  );
  return rows[0] || null;
}

async function getHomeContentRow() {
  const { rows } = await pool.query('SELECT * FROM web_home_content WHERE id = 1');
  return rows[0] || null;
}

async function listPublishedUniquenessItems() {
  const { rows } = await pool.query(
    `SELECT * FROM web_uniqueness_items
     WHERE is_published = TRUE
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

async function listAllUniquenessItems() {
  const { rows } = await pool.query(
    `SELECT * FROM web_uniqueness_items ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

async function listFeaturedPrograms(limit = 6) {
  const { rows } = await pool.query(
    `SELECT * FROM web_programs
     WHERE is_published = TRUE AND is_featured = TRUE
     ORDER BY sort_order ASC, id ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function listAllPrograms() {
  const { rows } = await pool.query(
    `SELECT * FROM web_programs ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

async function listFeaturedDepartments(limit = 4) {
  const { rows } = await pool.query(
    `SELECT * FROM web_departments
     WHERE is_published = TRUE AND is_featured = TRUE
     ORDER BY sort_order ASC, id ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function ensureDefaultHomeContent() {
  await pool.query(
    `INSERT INTO web_home_content (id)
     VALUES (1)
     ON CONFLICT (id) DO NOTHING`
  );

  const { rows } = await pool.query('SELECT hero_headline FROM web_home_content WHERE id = 1');
  if (rows[0]?.hero_headline) return;

  await pool.query(
    `UPDATE web_home_content SET
       hero_headline = $1,
       hero_subheadline = $2,
       hero_cta_primary_label = $3,
       hero_cta_primary_url = $4,
       hero_cta_secondary_label = $5,
       hero_cta_secondary_url = $6,
       intro_title = $7,
       intro_body = $8,
       admission_summary_title = $9,
       admission_summary_body = $10,
       updated_at = NOW()
     WHERE id = 1`,
    [
      'Welcome to MPASAT',
      'The vocational training institute of the Mbakwa Phosphate Academy of Science, Arts and Technology — building practical skills for work and enterprise.',
      'Apply Now',
      '#admissions',
      'Explore Programs',
      '#programs',
      'About Our School',
      'MPASAT delivers hands-on vocational education across agriculture, fashion, food science, computing, industrialization, and animal husbandry.\n\nOur programs connect classroom learning with workshops, projects, and real-world training pathways designed for students, entrepreneurs, and community trainees.',
      'How to Apply',
      '• Obtain and complete the admission form during the application window.\n• Select your preferred program or vocational department.\n• Submit required documents to the admissions office.\n• Await confirmation and enrollment guidance from the school administration.',
    ]
  );
}

async function ensureDefaultSiteSettings() {
  await pool.query(
    `UPDATE web_site_settings SET
       school_name = COALESCE(NULLIF(school_name, ''), 'MPASAT'),
       school_tagline = COALESCE(NULLIF(school_tagline, ''), 'Vocational Training Institute'),
       footer_email = COALESCE(NULLIF(footer_email, ''), 'contact@mpasat.com'),
       copyright_text = COALESCE(NULLIF(copyright_text, ''), 'MPASAT. All rights reserved.')
     WHERE id = 1`
  );
}

async function migrateVtiBrandingToMpasa() {
  await pool.query(`
    UPDATE web_site_settings SET
      school_name = REGEXP_REPLACE(COALESCE(school_name, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      school_tagline = REGEXP_REPLACE(COALESCE(school_tagline, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      copyright_text = REGEXP_REPLACE(COALESCE(copyright_text, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      footer_address = REGEXP_REPLACE(COALESCE(footer_address, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      footer_hours = REGEXP_REPLACE(COALESCE(footer_hours, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      updated_at = NOW()
    WHERE id = 1
      AND (
        COALESCE(school_name, '') ~* 'vti'
        OR COALESCE(school_tagline, '') ~* 'vti'
        OR COALESCE(copyright_text, '') ~* 'vti'
        OR COALESCE(footer_address, '') ~* 'vti'
        OR COALESCE(footer_hours, '') ~* 'vti'
      )
  `);

  await pool.query(`
    UPDATE web_home_content SET
      hero_headline = REGEXP_REPLACE(COALESCE(hero_headline, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      hero_subheadline = REGEXP_REPLACE(COALESCE(hero_subheadline, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      intro_title = REGEXP_REPLACE(COALESCE(intro_title, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      intro_body = REGEXP_REPLACE(COALESCE(intro_body, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      admission_summary_title = REGEXP_REPLACE(COALESCE(admission_summary_title, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      admission_summary_body = REGEXP_REPLACE(COALESCE(admission_summary_body, ''), 'VTI[-\\s]*MPASAT', 'MPASAT', 'gi'),
      updated_at = NOW()
    WHERE id = 1
      AND (
        COALESCE(hero_headline, '') ~* 'vti'
        OR COALESCE(hero_subheadline, '') ~* 'vti'
        OR COALESCE(intro_title, '') ~* 'vti'
        OR COALESCE(intro_body, '') ~* 'vti'
        OR COALESCE(admission_summary_title, '') ~* 'vti'
        OR COALESCE(admission_summary_body, '') ~* 'vti'
      )
  `);

  await pool.query(`
    UPDATE web_site_settings
    SET school_name = 'MPASAT', updated_at = NOW()
    WHERE id = 1 AND school_name ILIKE 'vti%'
  `);
}

module.exports = {
  slugify,
  getSiteSettingsRow,
  getHomeContentRow,
  listPublishedUniquenessItems,
  listAllUniquenessItems,
  listFeaturedPrograms,
  listAllPrograms,
  listFeaturedDepartments,
  ensureDefaultHomeContent,
  ensureDefaultSiteSettings,
  migrateVtiBrandingToMpasa,
};
