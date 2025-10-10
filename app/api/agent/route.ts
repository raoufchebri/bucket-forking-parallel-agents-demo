import { NextResponse } from "next/server";
import { GoogleGenAI } from '@google/genai';

async function generateImagePrompt(ai: GoogleGenAI): Promise<string> {
  const promptGenerationModel = 'gemini-2.0-flash-exp';
  
  // Add variety by randomly selecting a theme/category
  const themes = [
    "nature and landscapes",
    "urban and architecture", 
    "abstract and geometric",
    "surreal and dreamlike",
    "minimalist and clean",
    "fantasy and magical",
    "sci-fi and futuristic",
    "underwater scenes",
    "cosmic and space",
    "wildlife and animals",
    "food and culinary",
    "vintage and retro",
    "cyberpunk and neon",
    "mystical and spiritual",
    "seasonal scenes",
  ];
  
  const styles = [
    "photorealistic",
    "painterly",
    "watercolor",
    "oil painting",
    "digital art",
    "3D render",
    "illustration",
    "sketch",
    "cinematic",
    "atmospheric",
  ];
  
  const randomTheme = themes[Math.floor(Math.random() * themes.length)];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];
  const randomSeed = Math.floor(Math.random() * 10000);
  
  const systemPrompt = `Generate a single creative and detailed image prompt with these constraints:
- Theme: ${randomTheme}
- Visual style: ${randomStyle}
- Seed: ${randomSeed}

Include specific details about:
- Subject/scene
- Mood and atmosphere
- Colors and lighting
- Composition or perspective

Keep it concise (1-2 sentences max). Be creative and original.
Output ONLY the image prompt, nothing else.`;

  const response = await ai.models.generateContent({
    model: promptGenerationModel,
    config: {
      temperature: 0.1,
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },
    ],
  });

  const generatedPrompt = response.text?.trim() || "A beautiful abstract composition with vibrant colors";
  console.log("Generated prompt:", generatedPrompt);
  return generatedPrompt;
}

export async function GET() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return new NextResponse("GEMINI_API_KEY not configured", { status: 500 });
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    // First, generate a creative prompt using LLM
    const prompt = await generateImagePrompt(ai);

    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    };

    const imageModel = 'gemini-2.5-flash-image-preview';
    
    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ];

    const response = await ai.models.generateContentStream({
      model: imageModel,
      config,
      contents,
    });

    // Collect image data from stream
    for await (const chunk of response) {
      if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
        continue;
      }
      
      if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        const inlineData = chunk.candidates[0].content.parts[0].inlineData;
        const buffer = Buffer.from(inlineData.data || '', 'base64');
        const mimeType = inlineData.mimeType || 'image/png';

        return new NextResponse(buffer, {
          headers: {
            "content-type": mimeType,
            "cache-control": "no-store",
          },
        });
      }
    }

    return new NextResponse("No image generated", { status: 500 });
    
  } catch (error) {
    console.error("Error generating image:", error);
    return new NextResponse("Failed to generate image", { status: 500 });
  }
}

