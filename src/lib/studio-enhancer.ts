/**
 * Advanced Commercial Studio Synthesis & Visual Enhancer Engine
 * Generates photorealistic studio environments, dynamic pedestals, contact shadows,
 * softbox lighting, reflections, and cinematic color grades directly in Canvas.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('فشل تحميل الصورة'));
    img.src = src;
  });
}

export interface StudioEnhanceOptions {
  prompt?: string;
  appMode?: string;
  aspectRatio?: string;
  similarityLevel?: 'low' | 'medium' | 'high';
}

/**
 * Creates an ultra-realistic commercial studio composite or enhancement
 */
export async function enhanceStudioScene(
  imageUrl: string,
  options: StudioEnhanceOptions = {},
): Promise<string> {
  const { prompt = '', appMode = 'reimagine', aspectRatio = 'original' } = options;
  const img = await loadImage(imageUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  // Compute output dimensions based on requested aspect ratio
  let targetW = srcW;
  let targetH = srcH;

  if (aspectRatio === '1:1') {
    const size = Math.max(srcW, srcH);
    targetW = size;
    targetH = size;
  } else if (aspectRatio === '16:9') {
    targetW = Math.max(srcW, 1280);
    targetH = Math.round((targetW * 9) / 16);
  } else if (aspectRatio === '9:16') {
    targetH = Math.max(srcH, 1280);
    targetW = Math.round((targetH * 9) / 16);
  } else if (aspectRatio === '4:3') {
    targetW = Math.max(srcW, 1024);
    targetH = Math.round((targetW * 3) / 4);
  } else if (aspectRatio === '3:4') {
    targetH = Math.max(srcH, 1024);
    targetW = Math.round((targetH * 3) / 4);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  const pLower = prompt.toLowerCase();
  const isLuxuryStudio = pLower.includes('luxury') || pLower.includes('pedestal') || pLower.includes('استوديو') || pLower.includes('فاخر') || pLower.includes('stone') || pLower.includes('studio');
  const isCyberpunk = pLower.includes('cyberpunk') || pLower.includes('neon') || pLower.includes('سايبربانك');
  const isFood = pLower.includes('food') || pLower.includes('مأكولات') || pLower.includes('appetizing');
  const isBeauty = pLower.includes('beauty') || pLower.includes('organic') || pLower.includes('تجميل') || pLower.includes('عناية');
  const isCleanStore = pLower.includes('متجر') || pLower.includes('e-commerce') || pLower.includes('white background') || pLower.includes('خلفية بيضاء');
  const isCinematicPortrait = pLower.includes('portrait') || pLower.includes('بورتريه') || pLower.includes('cinematic');

  if (isCleanStore) {
    // 1. Clean Infinity White / Light Gray Studio
    const grad = ctx.createLinearGradient(0, 0, 0, targetH);
    grad.addColorStop(0, '#f8fafc');
    grad.addColorStop(0.7, '#f1f5f9');
    grad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, targetW, targetH);

    // Vignette light
    const radial = ctx.createRadialGradient(targetW / 2, targetH * 0.45, 50, targetW / 2, targetH * 0.45, targetW * 0.7);
    radial.addColorStop(0, 'rgba(255,255,255,0.9)');
    radial.addColorStop(1, 'rgba(226,232,240,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, targetW, targetH);

    // Center image with soft grounding contact shadow
    const scale = Math.min((targetW * 0.75) / srcW, (targetH * 0.75) / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const drawX = (targetW - drawW) / 2;
    const drawY = (targetH - drawH) / 2 - targetH * 0.04;

    // Contact shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(targetW / 2, drawY + drawH + 8, drawW * 0.45, drawH * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    ctx.filter = 'blur(16px)';
    ctx.fill();
    ctx.restore();

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    return canvas.toDataURL('image/png');
  }

  if (isCyberpunk) {
    // 2. Neon Cyberpunk Scene
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, targetW, targetH);

    // Neon ambient glows
    const cyanGlow = ctx.createRadialGradient(targetW * 0.2, targetH * 0.3, 20, targetW * 0.2, targetH * 0.3, targetW * 0.6);
    cyanGlow.addColorStop(0, 'rgba(6, 182, 212, 0.35)');
    cyanGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = cyanGlow;
    ctx.fillRect(0, 0, targetW, targetH);

    const magentaGlow = ctx.createRadialGradient(targetW * 0.8, targetH * 0.4, 20, targetW * 0.8, targetH * 0.4, targetW * 0.6);
    magentaGlow.addColorStop(0, 'rgba(236, 72, 153, 0.32)');
    magentaGlow.addColorStop(1, 'rgba(236, 72, 153, 0)');
    ctx.fillStyle = magentaGlow;
    ctx.fillRect(0, 0, targetW, targetH);

    // Wet dark ground
    const groundGrad = ctx.createLinearGradient(0, targetH * 0.65, 0, targetH);
    groundGrad.addColorStop(0, 'rgba(10, 15, 30, 0.95)');
    groundGrad.addColorStop(1, '#020307');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, targetH * 0.65, targetW, targetH * 0.35);

    const scale = Math.min((targetW * 0.8) / srcW, (targetH * 0.8) / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const drawX = (targetW - drawW) / 2;
    const drawY = targetH * 0.65 - drawH + targetH * 0.05;

    // Floor mirror reflection
    ctx.save();
    ctx.translate(drawX, drawY + drawH * 2);
    ctx.scale(1, -1);
    ctx.globalAlpha = 0.25;
    ctx.filter = 'blur(6px)';
    ctx.drawImage(img, 0, 0, drawW, drawH);
    ctx.restore();

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    return canvas.toDataURL('image/png');
  }

  // 3. Default or Luxury Studio Scene (Luxury Studio / Pedestal / Commercial Hero)
  // Background gradient (Dark brushed slate + architectural softbox light)
  const bgGrad = ctx.createLinearGradient(0, 0, 0, targetH);
  if (isBeauty) {
    bgGrad.addColorStop(0, '#f1f5f9');
    bgGrad.addColorStop(0.5, '#e2e8f0');
    bgGrad.addColorStop(1, '#cbd5e1');
  } else {
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.4, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, targetW, targetH);

  // Softbox Key Spotlight
  const softbox = ctx.createRadialGradient(
    targetW * 0.5,
    targetH * 0.35,
    40,
    targetW * 0.5,
    targetH * 0.35,
    targetW * 0.65,
  );
  if (isBeauty) {
    softbox.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    softbox.addColorStop(0.6, 'rgba(255, 255, 255, 0.2)');
    softbox.addColorStop(1, 'rgba(255, 255, 255, 0)');
  } else {
    softbox.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    softbox.addColorStop(0.5, 'rgba(148, 163, 184, 0.08)');
    softbox.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = softbox;
  ctx.fillRect(0, 0, targetW, targetH);

  // Subtle warm/cool edge rim lights
  const rimLight = ctx.createRadialGradient(targetW * 0.85, targetH * 0.2, 10, targetW * 0.85, targetH * 0.2, targetW * 0.4);
  rimLight.addColorStop(0, isBeauty ? 'rgba(251, 191, 36, 0.15)' : 'rgba(56, 189, 248, 0.15)');
  rimLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = rimLight;
  ctx.fillRect(0, 0, targetW, targetH);

  // Pedestal Stage
  const pedestalY = targetH * 0.72;
  const pedestalW = targetW * 0.68;
  const pedestalH = targetH * 0.18;
  const pedestalX = (targetW - pedestalW) / 2;

  // Pedestal Top Surface (Ellipse)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(targetW / 2, pedestalY, pedestalW / 2, pedestalH * 0.38, 0, 0, Math.PI * 2);
  const surfaceGrad = ctx.createLinearGradient(pedestalX, pedestalY - 20, pedestalX + pedestalW, pedestalY + 20);
  if (isBeauty) {
    surfaceGrad.addColorStop(0, '#ffffff');
    surfaceGrad.addColorStop(0.5, '#f8fafc');
    surfaceGrad.addColorStop(1, '#e2e8f0');
  } else {
    surfaceGrad.addColorStop(0, '#334155');
    surfaceGrad.addColorStop(0.5, '#1e293b');
    surfaceGrad.addColorStop(1, '#0f172a');
  }
  ctx.fillStyle = surfaceGrad;
  ctx.fill();

  // Pedestal Base (Cylinder body)
  ctx.beginPath();
  ctx.rect(pedestalX, pedestalY, pedestalW, pedestalH);
  const baseGrad = ctx.createLinearGradient(pedestalX, 0, pedestalX + pedestalW, 0);
  if (isBeauty) {
    baseGrad.addColorStop(0, '#e2e8f0');
    baseGrad.addColorStop(0.5, '#cbd5e1');
    baseGrad.addColorStop(1, '#94a3b8');
  } else {
    baseGrad.addColorStop(0, '#0f172a');
    baseGrad.addColorStop(0.3, '#1e293b');
    baseGrad.addColorStop(0.7, '#334155');
    baseGrad.addColorStop(1, '#0b0f19');
  }
  ctx.fillStyle = baseGrad;
  ctx.fill();

  // Pedestal Lower Curve
  ctx.beginPath();
  ctx.ellipse(targetW / 2, pedestalY + pedestalH, pedestalW / 2, pedestalH * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = isBeauty ? '#94a3b8' : '#070a10';
  ctx.fill();
  ctx.restore();

  // Calculate Product Placement on Pedestal
  const scale = Math.min((targetW * 0.6) / srcW, (targetH * 0.58) / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const drawX = (targetW - drawW) / 2;
  const drawY = pedestalY - drawH + targetH * 0.05;

  // Realistic Mirror Reflection of the Product on the Pedestal Top
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(targetW / 2, pedestalY, pedestalW / 2 - 8, pedestalH * 0.36, 0, 0, Math.PI * 2);
  ctx.clip(); // Clip to pedestal top surface
  ctx.translate(drawX, drawY + drawH * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = isBeauty ? 0.22 : 0.18;
  ctx.filter = 'blur(4px)';
  ctx.drawImage(img, 0, 0, drawW, drawH);
  ctx.restore();

  // Contact Shadow between product and pedestal
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(targetW / 2, drawY + drawH - 4, drawW * 0.4, drawH * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.filter = 'blur(12px)';
  ctx.fill();
  ctx.restore();

  // Ambient Occlusion core
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(targetW / 2, drawY + drawH - 2, drawW * 0.25, drawH * 0.02, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.filter = 'blur(4px)';
  ctx.fill();
  ctx.restore();

  // Draw the Main Product
  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Micro-texture / film grain synthesis overlay for cinematic photography look
  const imgData = ctx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 4;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL('image/png');
}

/**
 * Merges multiple images onto a unified luxury commercial composite stage
 */
export async function enhanceMergeBatch(
  images: string[],
  prompt: string = '',
  aspectRatio: string = '16:9',
): Promise<string> {
  const targetW = 1280;
  const targetH = 720;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas context unavailable');

  // Luxury Studio Composite Backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, targetH);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#1e293b');
  bgGrad.addColorStop(1, '#050811');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, targetW, targetH);

  // Overhead softbox
  const softbox = ctx.createRadialGradient(targetW / 2, targetH * 0.35, 50, targetW / 2, targetH * 0.35, targetW * 0.6);
  softbox.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
  softbox.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = softbox;
  ctx.fillRect(0, 0, targetW, targetH);

  // Wide stage floor
  const floorY = targetH * 0.7;
  const floorGrad = ctx.createLinearGradient(0, floorY, 0, targetH);
  floorGrad.addColorStop(0, '#1e293b');
  floorGrad.addColorStop(1, '#070a12');
  ctx.fillStyle = floorGrad;
  ctx.fillRect(0, floorY, targetW, targetH - floorY);

  const loadedImgs = await Promise.all(images.map((url) => loadImage(url)));
  const count = loadedImgs.length;
  const slotW = (targetW * 0.9) / Math.max(count, 1);

  for (let i = 0; i < count; i++) {
    const limg = loadedImgs[i];
    const iw = limg.naturalWidth || limg.width;
    const ih = limg.naturalHeight || limg.height;
    const scale = Math.min((slotW * 0.85) / iw, (targetH * 0.5) / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const cx = targetW * 0.05 + slotW * i + slotW / 2;
    const dx = cx - dw / 2;
    const dy = floorY - dh + 20;

    // Contact shadow
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, dy + dh, dw * 0.45, dh * 0.06, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.filter = 'blur(10px)';
    ctx.fill();
    ctx.restore();

    ctx.drawImage(limg, dx, dy, dw, dh);
  }

  return canvas.toDataURL('image/png');
}
