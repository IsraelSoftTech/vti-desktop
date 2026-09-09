const { pool } = require('../db');
const { runDdl } = require('../schemaGuard');
const {
  ensureDefaultHomeContent,
  ensureDefaultSiteSettings,
  migrateVtiBrandingToMpasa,
} = require('./homeData');

async function initWebTables() {
  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_site_settings (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      logo_url TEXT,
      hero_image_url TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    INSERT INTO web_site_settings (id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS school_name VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS school_tagline VARCHAR(500)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS footer_address TEXT
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS footer_phone VARCHAR(50)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS footer_email VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS footer_hours VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS copyright_text VARCHAR(255)
  `);
  await runDdl(`
    ALTER TABLE web_site_settings ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_departments (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      tag VARCHAR(128),
      summary TEXT,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    ALTER TABLE web_departments ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_web_departments_sort
    ON web_departments (is_published, sort_order, id)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_hero_slides (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_web_hero_slides_sort
    ON web_hero_slides (is_published, sort_order, id)
  `);

  await pool.query(`
    INSERT INTO web_hero_slides (image_url, sort_order, is_published)
    SELECT hero_image_url, 0, TRUE
    FROM web_site_settings
    WHERE hero_image_url IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM web_hero_slides LIMIT 1)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_home_content (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      hero_banner_url TEXT,
      hero_headline VARCHAR(255),
      hero_subheadline TEXT,
      hero_cta_primary_label VARCHAR(100),
      hero_cta_primary_url VARCHAR(500),
      hero_cta_secondary_label VARCHAR(100),
      hero_cta_secondary_url VARCHAR(500),
      intro_title VARCHAR(255),
      intro_body TEXT,
      intro_image_url TEXT,
      admission_summary_title VARCHAR(255),
      admission_summary_body TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_uniqueness_items (
      id SERIAL PRIMARY KEY,
      icon_url TEXT,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_web_uniqueness_sort
    ON web_uniqueness_items (is_published, sort_order, id)
  `);

  await runDdl(`
    CREATE TABLE IF NOT EXISTS web_programs (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE,
      category VARCHAR(50),
      short_description TEXT,
      full_description TEXT,
      cover_image_url TEXT,
      duration_info VARCHAR(100),
      is_featured BOOLEAN NOT NULL DEFAULT FALSE,
      is_published BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await runDdl(`
    CREATE INDEX IF NOT EXISTS idx_web_programs_featured
    ON web_programs (is_published, is_featured, sort_order, id)
  `);

  await ensureDefaultHomeContent();
  await ensureDefaultSiteSettings();
  await migrateVtiBrandingToMpasa();
  await seedDefaultUniquenessItems();
}

async function seedDefaultUniquenessItems() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM web_uniqueness_items');
  if (rows[0]?.count > 0) return;

  const defaults = [
    {
      title: 'Hands-on Training',
      description:
        'Workshops, labs, and practical projects that connect classroom learning to real skills.',
      sort_order: 0,
    },
    {
      title: 'Experienced Faculty',
      description:
        'Dedicated instructors who guide students through vocational pathways with mentorship and support.',
      sort_order: 1,
    },
    {
      title: 'Career-Ready Pathways',
      description:
        'Programs designed for employment, entrepreneurship, and further studies after graduation.',
      sort_order: 2,
    },
  ];

  for (const item of defaults) {
    await pool.query(
      `INSERT INTO web_uniqueness_items (title, description, sort_order, is_published)
       VALUES ($1, $2, $3, TRUE)`,
      [item.title, item.description, item.sort_order]
    );
  }
}

module.exports = {
  initWebTables,
};
