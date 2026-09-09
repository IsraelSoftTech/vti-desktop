const crypto = require('crypto');
const { uploadBuffer, deleteByPublicUrl } = require('../storage');

async function saveWebBase64Image(dataUrl, prefix = 'web') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,(.+)$/i);
  if (!match) return null;
  let ext = match[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';
  const buf = Buffer.from(match[2], 'base64');
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  return uploadBuffer(buf, filename, 'web');
}

async function deleteWebImageIfLocal(imageUrl) {
  await deleteByPublicUrl(imageUrl);
}

function mapDepartment(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    tag: row.tag || '',
    summary: row.summary || '',
    imageUrl: row.image_url || null,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    isFeatured: row.is_featured ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHeroSlide(row) {
  if (!row) return null;
  return {
    id: row.id,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

function normalizeMpasaText(value) {
  if (value == null || value === '') return value;
  return String(value)
    .replace(/VTI-MPASAT/gi, 'MPASAT')
    .replace(/VTI\s*[-–—]?\s*MPASAT/gi, 'MPASAT')
    .replace(/\bVTI\b/g, 'MPASAT');
}

function mapSiteSettings(row) {
  const socialLinks =
    row?.social_links && typeof row.social_links === 'object' ? row.social_links : {};
  const schoolName = normalizeMpasaText(row?.school_name) || 'MPASAT';
  return {
    logoUrl: row?.logo_url || null,
    schoolName,
    schoolTagline: normalizeMpasaText(row?.school_tagline) || 'Vocational Training Institute',
    footerAddress: normalizeMpasaText(row?.footer_address) || '',
    footerPhone: row?.footer_phone || '',
    footerEmail: row?.footer_email || '',
    footerHours: normalizeMpasaText(row?.footer_hours) || '',
    copyrightText: normalizeMpasaText(row?.copyright_text) || '',
    socialLinks: {
      facebook: socialLinks.facebook || '',
      instagram: socialLinks.instagram || '',
      youtube: socialLinks.youtube || '',
    },
    updatedAt: row?.updated_at || null,
  };
}

function mapHomeContent(row) {
  if (!row) return null;
  return {
    heroBannerUrl: row.hero_banner_url || null,
    heroHeadline: normalizeMpasaText(row.hero_headline) || '',
    heroSubheadline: normalizeMpasaText(row.hero_subheadline) || '',
    heroCtaPrimaryLabel: row.hero_cta_primary_label || 'Apply Now',
    heroCtaPrimaryUrl: row.hero_cta_primary_url || '#admissions',
    heroCtaSecondaryLabel: row.hero_cta_secondary_label || 'Explore Programs',
    heroCtaSecondaryUrl: row.hero_cta_secondary_url || '#programs',
    introTitle: normalizeMpasaText(row.intro_title) || '',
    introBody: normalizeMpasaText(row.intro_body) || '',
    introImageUrl: row.intro_image_url || null,
    admissionSummaryTitle: normalizeMpasaText(row.admission_summary_title) || 'How to Apply',
    admissionSummaryBody: normalizeMpasaText(row.admission_summary_body) || '',
    updatedAt: row.updated_at || null,
  };
}

function mapUniquenessItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    iconUrl: row.icon_url || null,
    title: row.title,
    description: row.description || '',
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProgram(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || '',
    category: row.category || '',
    shortDescription: row.short_description || '',
    fullDescription: row.full_description || '',
    coverImageUrl: row.cover_image_url || null,
    durationInfo: row.duration_info || '',
    isFeatured: row.is_featured ?? false,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  saveWebBase64Image,
  deleteWebImageIfLocal,
  normalizeMpasaText,
  mapDepartment,
  mapHeroSlide,
  mapSiteSettings,
  mapHomeContent,
  mapUniquenessItem,
  mapProgram,
};
