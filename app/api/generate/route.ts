import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from '@google/genai';
import { get, put, remove } from "@tigrisdata/storage";

async function generateImageEditPrompt(
  ai: GoogleGenAI,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const promptGenerationModel = 'gemini-2.0-flash-exp';

  // Add variety by randomly selecting a theme/category and style, mirroring @agent/
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

  const instruction = `Given the provided image, propose a single concise edit instruction (1-2 sentences) that creatively transforms the image.
- Randomized theme: ${randomTheme}
- Visual style: ${randomStyle}
- Seed: ${randomSeed}

Requirements to ensure a noticeable difference from the original:
- Make a bold transformation; avoid minor tweaks or mere enhancements.
- Change at least three of: color palette, lighting, composition/perspective, texture/style, background/foreground elements, time of day, or mood.
- It is acceptable to add/remove elements or alter the scene's perspective.

Focus on edit guidance (what to change/add/transform), not describing the current image. Output only the edit instruction.`;

  const response = await ai.models.generateContent({
    model: promptGenerationModel,
    config: { temperature: 0.1 },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: imageBase64 } },
          { text: instruction },
        ],
      },
    ],
  });

  const generatedPrompt = response.text?.trim() || "Apply a creative color grading and lighting shift to evoke a cinematic, atmospheric mood.";
  console.log("Generated edit prompt:", generatedPrompt);
  return generatedPrompt;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new NextResponse("GEMINI_API_KEY not configured", { status: 500 });
    }

    const url = new URL(req.url);
    const bucketName = url.searchParams.get('bucketName');
    const fileName = url.searchParams.get('fileName');
    const targetFileNameParam = url.searchParams.get('targetFileName');
    if (!bucketName || !fileName) {
      return new NextResponse('bucketName and fileName are required', { status: 400 });
    }
    const targetFileName = targetFileNameParam || fileName;

    const ai = new GoogleGenAI({ apiKey });

    // Load the base image from the provided bucket
    const getResult = await get(fileName, 'file', { config: { bucket: bucketName } });
    if (getResult.error) {
      console.error('Error getting image from Tigris:', getResult.error);
      return new NextResponse(`Failed to fetch image: ${getResult.error}`, { status: 500 });
    }
    if (!getResult.data) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const arrayBuffer = await getResult.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detectedType = (getResult.data.type || '').toLowerCase();
    const fileExt = (fileName.split('?')[0] || '').toLowerCase().split('.').pop() || '';
    const extToMime: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
    };
    let baseMime = extToMime[fileExt] || detectedType || 'image/png';
    if (baseMime.includes('octet-stream')) baseMime = extToMime[fileExt] || 'image/png';
    const imageBase64 = buffer.toString('base64');

    // Generate edit instruction and new image
    const prompt = await generateImageEditPrompt(ai, imageBase64, baseMime);
    const config = { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.9, topP: 0.95 };
    const imageModel = 'gemini-2.5-flash-image-preview';
    const contents = [{ role: 'user' as const, parts: [{ inlineData: { mimeType: baseMime, data: imageBase64 } }, { text: prompt }] }];
    const response = await ai.models.generateContentStream({ model: imageModel, config, contents });

    // Stream and write the output image into target file in the same bucket
    for await (const chunk of response) {
      const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData) continue;
      const outBuffer = Buffer.from(inlineData.data || '', 'base64');
      const outMime = inlineData.mimeType || baseMime;

      try {
        const blob = new Blob([outBuffer], { type: outMime });
        const putResult = await put(targetFileName, blob, { contentType: outMime, config: { bucket: bucketName } });
        if (putResult?.error) {
          console.error('Error replacing image in Tigris:', putResult.error);
          return new NextResponse(`Failed to upload image: ${putResult.error}`, { status: 500 });
        }

        console.log('Uploaded generated image to Tigris File Name:', targetFileName);
        console.log('Uploaded generated image to Tigris Bucket:', bucketName);

        return NextResponse.json({ 
          imageUrl: `${putResult.data.url}?r=${Date.now()}`, // random prefix to avoid caching
          bucketName: bucketName,
          fileName: targetFileName,
        }, { status: 200 });
      } catch (e) {
        console.error('Unexpected error uploading image:', e);
        return new NextResponse('Failed to upload image', { status: 500 });
      }

      // return new NextResponse(outBuffer, {
      //   headers: {
      //     'content-type': outMime,
      //     'cache-control': 'no-store',
      //     'x-bucket-name': bucketName,
      //     'x-file-name': targetFileName,
      //   },
      // });
    }

    return new NextResponse('No image generated', { status: 500 });
  } catch (error) {
    console.error('Error generating image:', error);
    return new NextResponse('Failed to generate image', { status: 500 });
  }
}


