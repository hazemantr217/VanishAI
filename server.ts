import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import OpenAI, { toFile } from "openai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Route for secure server-side image inpainting and recreation
  app.post("/api/inpaint", async (req, res) => {
    try {
      const { maskedImage, originalImage, dalleMaskImage, prompt, maskColor, model, appMode, aspectRatio, enableOutpainting, outpaintPreserve2D, similarityLevel } = req.body;
      if (!maskedImage) {
        return res.status(400).json({ error: "لم يتم تقديم صورة للتحليل أو المعالجة." });
      }

      // Handle OpenAI model routing (supporting modern gpt-image models)
      if (model === 'openai-dalle' || (model && model.startsWith('gpt-image'))) {
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          return res.status(500).json({ error: "مفتاح OpenAI (OPENAI_API_KEY) غير متاح في السيرفر. يرجى تزويد مفتاح API الخاص بك لتشغيل موديلات OpenAI." });
        }
        const openai = new OpenAI({ apiKey: openaiKey });

        const openAIModelToUse = model.startsWith('gpt-image') ? model : 'gpt-image-2';

        const base64Parts = maskedImage.split(',');
        const base64Data = base64Parts[1];
        const mimeType = base64Parts[0].split(';')[0].split(':')[1] || 'image/png';

        if (appMode === 'reimagine') {
          try {
            const systemPrompt = `Analyze this image and write a detailed prompt to generate a new high-quality image that looks very similar but is recreated. Focus on describing the subject, composition, background, colors, style, and lighting. If there is a user prompt: "${prompt || ''}", make sure to incorporate it so the new image reflects the requested changes while maintaining the style and theme of the original. Only return the prompt text. No preface, no markdown formatting, just the prompt.`;
            
            const gptResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: systemPrompt
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${base64Data}`
                      }
                    }
                  ]
                }
              ]
            });

            const gptPrompt = gptResponse.choices[0]?.message?.content || prompt || "A beautiful high-quality recreation";

            let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024";
            if (aspectRatio === '16:9') {
              size = '1792x1024';
            } else if (aspectRatio === '9:16') {
              size = '1024x1792';
            }

            const dalleResponse = await openai.images.generate({
              model: openAIModelToUse,
              prompt: gptPrompt,
              n: 1,
              size: size,
              response_format: "b64_json"
            });

            const outputBase64 = `data:image/png;base64,${dalleResponse.data[0].b64_json}`;
            return res.json({ resultImage: outputBase64 });
          } catch (gptErr: any) {
            console.error("OpenAI Reimagine Error:", gptErr);
            return res.status(500).json({ error: gptErr.message || "حدث خطأ أثناء معالجة الصورة باستخدام OpenAI GPT/GPT-Image." });
          }
        } else {
          // Modern Inpaint/Vanish/Outpaint using GPT-4o Vision & GPT-Image
          try {
            const origParts = originalImage ? originalImage.split(',') : [null, null];
            const origBase64 = origParts[1] || base64Data;
            
            const colorNames: Record<string, string> = {
              '#00FF00': 'bright green',
              '#FF00FF': 'magenta',
              '#FF0000': 'red',
              '#0000FF': 'blue',
              '#FFFF00': 'yellow',
            };
            const colorName = colorNames[maskColor] || maskColor || 'bright green';

            const userPrompt = prompt && prompt.trim() !== '' 
              ? prompt.trim() 
              : "remove the object in the painted area and fill it with the background seamlessly";

            const systemPrompt = `You are an expert AI image editor.
You will be provided with two images:
1. The original image.
2. The masked image, which is the original image but with a region painted in ${colorName} color. This painted region indicates where the user wants to edit, remove, or fill.

The user's editing instruction is: "${userPrompt}".

Your task is to analyze both images, identify the region painted in ${colorName} color, and write a highly detailed, professional prompt for ${openAIModelToUse} to generate the modified final image.
The generated prompt must describe the ENTIRE scene in detail such that:
- The painted region is modified/replaced/removed according to the user instruction, blending seamlessly with the surrounding pixels and background.
- All other unpainted parts of the image (style, subject, composition, colors, lighting, textures) remain identical to the original image.
- Keep the overall artistic style, mood, and perspective of the original image.

Only return the final prompt text for ${openAIModelToUse}. Do not include any markdown, introductory text, or explanation. Only return the prompt itself in English.`;

            const gptResponse = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: systemPrompt
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${origBase64}`
                      }
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:${mimeType};base64,${base64Data}`
                      }
                    }
                  ]
                }
              ]
            });

            const gptPrompt = gptResponse.choices[0]?.message?.content || userPrompt;

            let size: "1024x1024" | "1792x1024" | "1024x1792" = "1024x1024";
            if (aspectRatio === '16:9') {
              size = '1792x1024';
            } else if (aspectRatio === '9:16') {
              size = '1024x1792';
            }

            const dalleResponse = await openai.images.generate({
              model: openAIModelToUse,
              prompt: gptPrompt,
              n: 1,
              size: size,
              response_format: "b64_json"
            });

            const outputBase64 = `data:image/png;base64,${dalleResponse.data[0].b64_json}`;
            return res.json({ resultImage: outputBase64 });
          } catch (gptErr: any) {
            console.error("OpenAI Inpaint/Edit GPT-4o + GPT-Image Error:", gptErr);
            return res.status(500).json({ error: gptErr.message || `حدث خطأ أثناء معالجة الصورة باستخدام OpenAI GPT-4o و ${openAIModelToUse}.` });
          }
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "العنصر المساعد لمدخل المفتاح (GEMINI_API_KEY) غير متاح في السيرفر." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const base64Parts = maskedImage.split(',');
      const base64Data = base64Parts[1];
      const mimeType = base64Parts[0].split(';')[0].split(':')[1] || 'image/png';

      let instruction = "";

      if (appMode === 'reimagine') {
        const aspectInstruction = !aspectRatio || aspectRatio === 'original'
          ? "Keep the original aspect ratio."
          : `Generate the final image strictly with an aspect ratio of ${aspectRatio}.`;

        const basePrompt = prompt && prompt.trim() !== ''
          ? prompt.trim()
          : "Recreate this image in extremely high quality, adding fine details and beautiful professional lighting.";

        // We check if it is painted (i.e. contains the mask or if the caller specified isPainted)
        // If there's a maskColor and a prompt, we can use selective editing, otherwise whole image recreate
        const hasMaskColor = !!maskColor;
        if (hasMaskColor) {
          const colorNames: Record<string, string> = {
            '#00FF00': 'bright green',
            '#FF00FF': 'magenta',
            '#FF0000': 'red',
            '#0000FF': 'blue',
            '#FFFF00': 'yellow',
          };
          const colorName = colorNames[maskColor] || maskColor;
          instruction = `Recreate and enhance this image. For the region painted with ${colorName} color, transform it according to: "${basePrompt}". For the rest of the image, recreate it in super high quality and keep it consistent. ${aspectInstruction}`;
        } else {
          instruction = `Recreate and enhance this entire image in extremely high quality with fine details and professional resolution. Transform/recreate it based on: "${basePrompt}". Completely generate a clean, modern, high-resolution masterpiece. ${aspectInstruction}`;
        }
      } else {
        const colorNames: Record<string, string> = {
          '#00FF00': 'bright green',
          '#FF00FF': 'magenta',
          '#FF0000': 'red',
          '#0000FF': 'blue',
          '#FFFF00': 'yellow',
        };
        const colorName = colorNames[maskColor] || maskColor;

        if (enableOutpainting) {
          const basePrompt = prompt && prompt.trim() !== '' ? prompt.trim() : "seamlessly extend the scene, keeping the original style, lighting, pattern, and details intact";
          let outpaintInstruction = `The region painted with ${colorName} color is blank space or an extension area. Perform Generative Fill/Outpainting to seamlessly expand and complete the original image into this ${colorName} region. Maintain absolute continuity of the existing objects, textures, background patterns, and lighting. Do not alter the unpainted portion. Guide prompt: "${basePrompt}". Completely remove the ${colorName} color.`;
          if (outpaintPreserve2D) {
            outpaintInstruction += ` This is a 2D graphic design / banner / artwork, NOT a 3D real-world photo or scene. Absolutely DO NOT generate any 3D physical mockups, storefronts, walls, hanging boards, buildings, streets, or realistic physical environments. You must strictly keep it a flat 2D vector graphic design banner. Seamlessly extend only the background graphic patterns, gradients, curves, colors, and design elements into the painted area, preserving the flat, high-contrast, clean corporate style. No physical objects or realistic backgrounds should be added.`;
          }
          instruction = outpaintInstruction;
        } else {
          instruction = prompt && prompt.trim() !== ''
            ? `Replace the ${colorName} painted area with: "${prompt.trim()}". Completely remove the ${colorName} paint and blend the new content naturally. Keep the rest of the image exactly the same.`
            : `Remove the object covered by the ${colorName} paint and fill in the background naturally. Completely remove the ${colorName} paint. Keep the rest of the image exactly the same.`;
        }
      }

      // Fallback to gemini-3.1-flash-lite-image if not specified
      const modelName = model || 'gemini-3.1-flash-lite-image';

      const config: any = {};
      let tempVal = 1.0;
      if (similarityLevel === 'high') {
        tempVal = 0.15;
      } else if (similarityLevel === 'medium') {
        tempVal = 0.5;
      } else {
        tempVal = 1.0;
      }
      config.temperature = tempVal;

      if (aspectRatio && aspectRatio !== 'original') {
        const nativeRatios = ['1:1', '9:16', '16:9', '3:4', '4:3'];
        let mappedRatio = aspectRatio;
        if (!nativeRatios.includes(aspectRatio)) {
          const parts = aspectRatio.split(':');
          if (parts.length === 2) {
            const w = Number(parts[0]);
            const h = Number(parts[1]);
            if (!isNaN(w) && !isNaN(h) && h !== 0) {
              const val = w / h;
              if (val >= 1.5) mappedRatio = '16:9';
              else if (val >= 1.15) mappedRatio = '4:3';
              else if (val >= 0.85) mappedRatio = '1:1';
              else if (val >= 0.6) mappedRatio = '3:4';
              else mappedRatio = '9:16';
            }
          }
        }
        config.imageConfig = {
          aspectRatio: mappedRatio,
        };
      }

      const result = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: instruction,
            },
          ],
        },
        config: config,
      });

      let outputBase64 = null;
      let textResponse = "";
      for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          outputBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        } else if (part.text) {
          textResponse += part.text;
        }
      }

      if (outputBase64) {
        return res.json({ resultImage: outputBase64 });
      } else {
        console.error("Model responded with no image:", JSON.stringify(result, null, 2));
        return res.status(400).json({ error: "حدث خطأ: لم يقم النموذج بتوليد صورة مصححة." });
      }
    } catch (err: any) {
      console.error("Inpainting API Error:", err);
      
      const errString = typeof err === 'object' ? JSON.stringify(err) : String(err);
      if (
        errString.includes("429") || 
        errString.includes("RESOURCE_EXHAUSTED") || 
        errString.includes("quota") || 
        errString.includes("Quota exceeded") ||
        (err.message && (err.message.includes("quota") || err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED")))
      ) {
        return res.status(429).json({ 
          error: "تجاوز حصة الاستخدام المجانية (Quota Exceeded): يتطلب هذا الموديل (Nano Banana) مفتاح API مدفوع ومفعل به خيار الدفع (Billing/Paid Tier) ليعمل بكفاءة وسرعة. يرجى ترقية مفتاح API الخاص بك من خيار الإعدادات في لوحة التحكم بالأعلى (Settings > Secrets) لتخطي هذا القيد فورًا." 
        });
      }
      
      return res.status(500).json({ error: err.message || "فشلت العملية، يرجى التحقق من الاتصال بموديل Gemini." });
    }
  });

  // API Route for combining/merging all batch images into a single image
  app.post("/api/merge-batch", async (req, res) => {
    try {
      const { images, prompt, model, aspectRatio, similarityLevel } = req.body;
      if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ error: "لم يتم تقديم صور للدمج." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "العنصر المساعد لمدخل المفتاح (GEMINI_API_KEY) غير متاح في السيرفر." });
      }

      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      const parts: any[] = images.map((imgUrl: string) => {
        const base64Parts = imgUrl.split(',');
        const base64Data = base64Parts[1];
        const mimeType = base64Parts[0].split(';')[0].split(':')[1] || 'image/png';
        return {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          }
        };
      });

      const defaultMergePrompt = `PROFESSIONAL PHOTOROOM E-COMMERCE PRODUCT STAGING & BUNDLE MERGE:
You are an expert commercial advertising photographer and 3D studio staging artist (like Photoroom Pro).
You are provided with multiple input images containing distinct products, goods, or items.

YOUR GOAL:
Segment and extract the main product/item from EACH input image, and compose them together into ONE single, cohesive, high-end e-commerce product advertisement photograph.

STRICT STAGING & COMPOSITION RULES:
1. EXTRACT ALL DISTINCT PRODUCTS: Identify and include EVERY product/item from every provided image into the unified scene.
2. COMMERCIAL STUDIO SETTING: Place all products neatly and harmoniously arranged together on an elegant, solid 3D commercial surface (such as a sleek modern studio podium, polished marble table, or warm wooden platform) against a clean, aesthetically shaded studio backdrop.
3. REALISTIC CONTACT SHADOWS & LIGHTING: Cast soft realistic contact shadows underneath every product where it rests on the surface, with matching softbox studio reflections, consistent rim lighting, and uniform color temperature across all items.
4. ABSOLUTELY NO ARTIFICIAL CLUTTER OR MERGING MUTATIONS: Do NOT melt or fuse products into one another. Keep each product as a distinct, perfectly preserved item with crisp labels, original colors, sharp text, and accurate shapes.
5. BALANCED PRODUCT ARRANGEMENT: Group the items naturally like a premium product gift box, starter kit, or advertising showcase bundle (taller items towards the back/center, smaller items neatly in front).
6. COMMERCIAL ADVERTISING QUALITY: High resolution, pristine depth-of-field, sharp product edges, and professional lighting.`;

      const finalPromptText = prompt && prompt.trim() !== ''
        ? `${defaultMergePrompt}\n\nUSER'S CUSTOM SCENE & ARRANGEMENT DIRECTION:\n"${prompt.trim()}". Make sure ALL products from all input images are accurately included and harmonized into this scene without flat pasting or collage artifacts.`
        : defaultMergePrompt;

      const aspectInstruction = aspectRatio && aspectRatio !== 'original'
        ? ` Generate the final combined image strictly with an aspect ratio of ${aspectRatio}.`
        : "";

      parts.push({ text: finalPromptText + aspectInstruction });

      const modelName = model || 'gemini-3.1-flash-lite-image';

      let tempVal = 0.5;
      if (similarityLevel === 'high') {
        tempVal = 0.15;
      } else if (similarityLevel === 'medium') {
        tempVal = 0.5;
      } else {
        tempVal = 1.0;
      }

      const config: any = {
        temperature: tempVal,
      };

      if (aspectRatio && aspectRatio !== 'original') {
        const nativeRatios = ['1:1', '9:16', '16:9', '3:4', '4:3'];
        let mappedRatio = aspectRatio;
        if (!nativeRatios.includes(aspectRatio)) {
          const ratioParts = aspectRatio.split(':');
          if (ratioParts.length === 2) {
            const w = Number(ratioParts[0]);
            const h = Number(ratioParts[1]);
            if (!isNaN(w) && !isNaN(h) && h !== 0) {
              const val = w / h;
              if (val >= 1.5) mappedRatio = '16:9';
              else if (val >= 1.15) mappedRatio = '4:3';
              else if (val >= 0.85) mappedRatio = '1:1';
              else if (val >= 0.6) mappedRatio = '3:4';
              else mappedRatio = '9:16';
            }
          }
        }
        config.imageConfig = {
          aspectRatio: mappedRatio,
        };
      }

      const result = await ai.models.generateContent({
        model: modelName,
        contents: {
          parts: parts
        },
        config: config
      });

      let outputBase64 = null;
      for (const part of result.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          outputBase64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }

      if (outputBase64) {
        return res.json({ resultImage: outputBase64 });
      } else {
        return res.status(400).json({ error: "لم يقم النموذج بإرجاع صورة مدمجة." });
      }
    } catch (err: any) {
      console.error("Batch Merge API Error:", err);
      const errString = typeof err === 'object' ? JSON.stringify(err) : String(err);
      if (
        errString.includes("429") || 
        errString.includes("RESOURCE_EXHAUSTED") || 
        errString.includes("quota") || 
        errString.includes("Quota exceeded") ||
        (err.message && (err.message.includes("quota") || err.message.includes("429") || err.message.includes("RESOURCE_EXHAUSTED")))
      ) {
        return res.status(429).json({ 
          error: "تجاوز حصة الاستخدام المجانية (Quota Exceeded): يتطلب هذا الموديل مفتاح API مدفوع أو غير مستهلك الحصة لتشغيله." 
        });
      }
      return res.status(500).json({ error: err.message || "فشلت عملية دمج صور الباتش." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();



