import type { z } from 'zod';
import type { inpaintRequestSchema, mergeBatchRequestSchema } from './validation';

type InpaintInput = z.infer<typeof inpaintRequestSchema>;
type MergeInput = z.infer<typeof mergeBatchRequestSchema>;

const MASK_COLOR_NAMES: Record<string, string> = {
  '#00FF00': 'bright green',
  '#FF00FF': 'magenta',
  '#FF0000': 'red',
  '#0000FF': 'blue',
  '#FFFF00': 'yellow',
};

function aspectInstruction(aspectRatio: string): string {
  return aspectRatio === 'original'
    ? 'Keep the exact original aspect ratio.'
    : `Render the final image at exactly ${aspectRatio}.`;
}

export function buildImageEditPrompt(input: InpaintInput): string {
  const userPrompt = input.prompt.trim();
  const colorName = MASK_COLOR_NAMES[input.maskColor || ''] || input.maskColor || 'marked';

  if (input.appMode === 'reimagine') {
    const change = userPrompt ||
      'Improve clarity, fine detail, natural contrast, and professional lighting while preserving the scene.';

    if (input.maskColor) {
      return `LOCALIZED HIGH-FIDELITY IMAGE EDIT.
The supplied image shows the requested edit region painted ${colorName}.
Apply this instruction only inside the painted region: "${change}"
Preserve every pixel-level visual fact outside that region: identity, facial features, expression, pose, body proportions, clothing, logos, readable text, product geometry, composition, perspective, colors, skin texture, and lighting direction. Do not beautify, reshape, move, crop, or redesign anything outside the marked region. Remove every trace of the paint and blend the edited boundary naturally. ${aspectInstruction(input.aspectRatio)}`;
    }

    return `HIGH-FIDELITY IMAGE RECREATION.
Use the supplied image as the exact visual reference and apply: "${change}"
Preserve the same people and identity, facial structure and expression, pose, body proportions, clothes, products, logos, readable text, composition, perspective, and natural skin texture. Improve only what the instruction requires. Avoid plastic skin, invented objects, unwanted warm/orange color casts, and uncontrolled changes. ${aspectInstruction(input.aspectRatio)}`;
  }

  if (input.enableOutpainting) {
    const guide = userPrompt ||
      'Seamlessly extend the existing scene with matching perspective, texture, pattern, color, and lighting.';
    const flatArtworkRule = input.outpaintPreserve2D
      ? 'The source is flat 2D artwork. Keep it as a flat graphic; never turn it into a physical sign, wall, shopfront, mockup, building, or 3D scene.'
      : '';

    return `PRECISE OUTPAINTING TASK.
The supplied image marks the extension area in ${colorName}.
Generate content only in that marked area using this direction: "${guide}"
Continue existing edges, patterns, perspective, and lighting across the boundary. Do not alter any unmarked content. Remove the ${colorName} overlay completely. ${flatArtworkRule} ${aspectInstruction(input.aspectRatio)}`;
  }

  const change = userPrompt ||
    'Remove the covered object and reconstruct the background naturally from the surrounding context.';

  return `STRICT LOCAL INPAINTING TASK.
The supplied image contains the edit region painted ${colorName}.
Perform only this change inside the painted region: "${change}"
Do not modify anything outside the painted region. Preserve exact identity, face, expression, pose, body proportions, clothing, hands, hair, logos, readable text, product shape, composition, crop, perspective, colors, lighting, film grain, and skin texture outside the selection. Reconstruct realistic detail inside the selection, remove all ${colorName} paint, and create a seamless boundary without halos or blur. ${aspectInstruction(input.aspectRatio)}`;
}

export function buildMergePrompt(input: MergeInput): string {
  const customDirection = input.prompt.trim();
  return `PROFESSIONAL E-COMMERCE PRODUCT COMPOSITE.
Extract the main product from every supplied input image and arrange all of them in one cohesive premium advertising image.

Requirements:
1. Include every distinct product exactly once; never fuse, melt, duplicate, omit, or deform products.
2. Preserve original product geometry, branding, labels, colors, materials, and readable text as faithfully as possible.
3. Use a balanced commercial arrangement with taller items behind and smaller items in front where appropriate.
4. Add one consistent studio surface and backdrop, realistic contact shadows, coherent softbox reflections, matching perspective, and a single neutral color temperature.
5. Produce clean, sharp edges and professional depth without collage artifacts or invented clutter.
${customDirection ? `6. Follow this custom scene direction: "${customDirection}"` : ''}
${aspectInstruction(input.aspectRatio)}`;
}
