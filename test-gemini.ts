import { GoogleGenAI } from '@google/genai';

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  // Create a dummy 1x1 pixel PNG
  const dummyImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            inlineData: {
              data: dummyImage,
              mimeType: 'image/png',
            },
          },
          {
            text: "Remove the magenta highlighted watermarks or objects seamlessly and reconstruct the background naturally.",
          },
        ],
      },
    });
    console.log(JSON.stringify(response, null, 2));
  } catch (e) {
    console.error(e);
  }
}

run();
