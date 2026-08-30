import type { Preset } from '../types';

export const DEFAULT_PRESETS: Preset[] = [
  {
    name: '🌟 النمط الإعلاني الشامل (لكافة المنتجات والمشاهد)',
    prompt: 'Create a premium commercial hero image from the supplied reference. Keep the exact product identity, geometry, proportions, brand colors, labels, logos, and readable text. Upgrade only the presentation with a deliberate composition, clean studio lighting, realistic contact shadows and reflections, refined material texture, neutral accurate color, crisp natural detail, and controlled depth of field. Do not invent accessories, duplicate parts, warp packaging, or replace typography.',
  },
  {
    name: '🚀 إعلان تجاري سينمائي (منتج حركي طاير بالأجواء)',
    prompt: 'Build a dynamic cinematic product advertisement while preserving the product exactly. Suspend the product naturally in mid-air with a believable sense of motion, restrained thematic particles, directional rim light, a coherent background, and selective motion blur only on surrounding moving elements. Keep the product, logo, label, text, color, and edges sharp and unchanged; avoid visual clutter, deformation, duplicated elements, or fake branding.',
  },
  {
    name: '✨ إعلان منتج فاخر في استوديو احترافي (Luxury Studio)',
    prompt: 'Place the unchanged product in an elegant luxury studio scene on a dark stone, brushed metal, or clean architectural pedestal chosen to suit the product. Use large softbox key light, subtle rim light, physically plausible reflections, realistic contact shadow, refined material detail, and a restrained premium palette. Preserve all packaging geometry, colors, logos, labels, and readable text exactly. Keep the frame clean and sophisticated without smoke covering the product.',
  },
  {
    name: '💥 إعلان حركي مع تطاير سوائل وعناصر (Action Splash)',
    prompt: 'Create a high-speed commercial action photograph around the unchanged product. Add physically believable liquid splashes, droplets, or relevant ingredients with frozen motion, clean separation, realistic refraction, and coherent studio lighting. Preserve the product shape, cap, logo, label, colors, and readable text exactly; splashes must never obscure important branding or merge into the package.',
  },
  {
    name: '🍔 إعلان مأكولات ومشروبات ديناميكي (Levitating Food Ad)',
    prompt: 'Create an appetizing premium food or beverage advertisement with natural texture, accurate ingredient color, realistic steam or condensation where appropriate, and a balanced dynamic arrangement of relevant ingredients. Preserve the exact main dish, package, logo, label, and serving identity. Use believable studio light and contact shadows; avoid plastic-looking food, excessive saturation, unrelated ingredients, duplicated items, and illegible text.',
  },
  {
    name: '🌿 إعلان منتجات العناية والتجميل (Natural Organic Beauty)',
    prompt: 'Create a clean natural beauty campaign around the unchanged cosmetic product. Use soft neutral daylight, subtle leaf shadows, restrained botanical elements, a natural stone surface, delicate water droplets, and realistic glossy or matte material response. Preserve exact packaging geometry, shade, logo, label, and readable text. Avoid orange color casts, excessive greenery, fake flowers, warped containers, and airbrushed product texture.',
  },
  {
    name: '📱 إعلان إلكترونيات وتقنية سينمائي (3D Tech & Gadget Ad)',
    prompt: 'Create a precise futuristic technology advertisement while keeping the device industrial design completely faithful. Use a clean dark-to-neutral studio environment, controlled accent lighting, accurate metal and glass reflections, subtle light trails, and crisp edge separation. Preserve ports, buttons, screen proportions, logos, materials, and product color. Do not add impossible hardware, alter the display, duplicate components, or turn the device into a different model.',
  },
  {
    name: '🌸 دمج الإضاءة والواقعية (Seamless Blend)',
    prompt: 'Blend the existing foreground and background into one physically coherent photograph. Match light direction, color temperature, exposure, perspective, depth of field, edge softness, reflected color, contact shadows, ambient occlusion, grain, and camera sharpness. Keep every subject, face, product, logo, text, pose, and composition unchanged; correct only the visual mismatch between layers.',
  },
  {
    name: '🚀 جودة فائقة وتحسين التفاصيل',
    prompt: 'Perform a faithful restoration and professional enhancement, not a redesign. Recover natural fine texture, local contrast, edge clarity, balanced exposure, and accurate neutral color while preserving every person, facial feature, expression, product, logo, readable text, object position, crop, and background detail. Remove compression artifacts and mild noise without oversharpening, halos, plastic skin, invented detail, or warm orange tint.',
  },
  {
    name: '📸 بورتريه سينمائي واقعي',
    prompt: 'Create a refined cinematic portrait while preserving the person’s exact identity, age, facial structure, expression, skin tone, hairstyle, body proportions, clothing, and pose. Use soft directional key light, subtle eye catchlights, realistic skin pores and fine hair, neutral color balance, gentle depth of field, and controlled contrast. No face reshaping, beauty-filter skin, enlarged eyes, altered makeup, orange tint, or invented accessories.',
  },
  {
    name: '🎨 لوجو ديجيتال خلفية بيضاء',
    prompt: 'Faithfully redraw the supplied logo or flat design as clean digital artwork on a pure solid white background. Preserve the exact symbol geometry, spacing, alignment, colors, letterforms, punctuation, and wording. Produce smooth consistent curves, crisp edges, solid fills, and no shadows unless they are part of the original. Do not reinterpret the logo, change the font, misspell text, add a mockup, wall, paper texture, or 3D scene.',
  },
  {
    name: '👾 طابع السايبربانك المضيء',
    prompt: 'Apply a controlled cinematic cyberpunk art direction to the environment while preserving all people, identities, products, logos, readable text, pose, and composition. Add purposeful neon accents, cool atmospheric haze, realistic wet-surface reflections, and high-tech environmental detail with coherent light direction. Keep skin tones believable and avoid neon covering faces, excessive magenta, random signage, duplicated limbs, or clutter.',
  },
  {
    name: '✏️ رسم فني قلم رصاص',
    prompt: 'Translate the reference faithfully into a detailed graphite and charcoal drawing on light natural paper. Preserve identity, facial structure, pose, composition, proportions, clothing, objects, and all important contours. Use confident line weight, controlled cross-hatching, realistic tonal range, clean negative space, and subtle paper grain. Avoid caricature, anatomy changes, muddy shading, and unrelated marks.',
  },
  {
    name: '🏢 تصميم معماري 3D',
    prompt: 'Create a photoreal architectural visualization that keeps the exact building massing, facade openings, floor count, perspective, site boundaries, and camera view. Improve materials, glazing, landscaping, ambient light, and physically plausible shadows with a professional neutral presentation. Do not move doors or windows, add floors, change structural geometry, bend verticals, or invent signage.',
  },
  {
    name: '✏️ أنمي ورسم كرتوني ثلاثي الأبعاد',
    prompt: 'Recreate the reference as a polished stylized 3D animated-film frame while preserving each character’s identity cues, expression, pose, clothing colors, body proportions, object placement, and composition. Use appealing stylized materials, expressive but faithful facial detail, clean global illumination, and coherent cinematic color. Avoid extra fingers, changed clothing, duplicated characters, text corruption, or unrelated props.',
  },
  {
    name: '🧹 تنظيف الصورة وإزالة النويز',
    prompt: 'Clean and restore the image conservatively. Remove sensor noise, dust, compression blocks, color banding, and minor artifacts; correct exposure and white balance; recover natural edges and texture. Preserve exact faces, skin pores, hair, text, logos, fabric, product geometry, background, grain character, and original composition. Do not smooth skin, hallucinate detail, oversharpen, change colors, or alter any object.',
  },
  {
    name: '🌤️ إضاءة نهارية محايدة وواقعية',
    prompt: 'Relight the scene with clean believable neutral daylight while preserving every subject and object exactly. Balance highlights and shadows, keep skin and product colors accurate, add soft natural directionality and realistic bounce light, and retain the original atmosphere. Avoid yellow, orange, green, or magenta casts; do not change faces, materials, text, logos, composition, or background content.',
  },
  {
    name: '🛍️ صورة متجر إلكتروني نظيفة',
    prompt: 'Create a clean e-commerce product image with the exact product centered and fully visible against a seamless neutral white or very light gray background. Preserve product geometry, color, material, branding, labels, and readable text. Use soft even studio light, a realistic subtle grounding shadow, accurate white balance, and crisp edges. No props, decoration, distortion, duplicated parts, or fake labels.',
  },
  {
    name: '🧱 تطوير الخلفية فقط مع تثبيت العنصر',
    prompt: 'Redesign only the background into a polished context appropriate for the subject. Keep the foreground subject or product pixel-faithful in identity, geometry, colors, labels, readable text, pose, scale, and position. Match the new background perspective, focus, light direction, reflections, and contact shadow to the foreground without changing or beautifying it.',
  },
  {
    name: '📝 تثبيت النصوص والشعارات والهوية',
    prompt: 'Enhance the overall presentation while treating every logo, label, piece of typography, brand color, face, and product shape as locked reference information. Preserve spelling, letterforms, layout, spacing, identity, proportions, and object placement exactly. Improve only lighting, tonal balance, material realism, and background polish; reject any change that makes text unreadable or branding inaccurate.',
  },
];
