import { NextRequest, NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { GoogleGenAI } from '@google/genai';
import { put } from "@tigrisdata/storage";

function generateRandomImagePrompt(): string {
  const themes = [
    "nature landscape with mountains and lake",
    "futuristic sci-fi city skyline",
    "cozy cabin in a snowy forest",
    "underwater coral reef with fish",
    "desert dunes at golden hour",
    "fantasy castle floating in the sky",
    "cyberpunk neon street at night",
    "ancient temple in a jungle",
    "space nebula and distant planets",
    "wildlife scene with elephants",
  ];
  const styles = [
    "photorealistic",
    "studio lighting",
    "watercolor painting",
    "oil painting",
    "digital art illustration",
    "3D render",
    "isometric",
    "minimalist",
    "cinematic",
    "volumetric lighting",
  ];
  const moods = [
    "serene",
    "dramatic",
    "mysterious",
    "bright and cheerful",
    "moody",
  ];
  const extras = [
    "high detail, sharp focus",
    "soft lighting, natural colors",
    "vibrant colors, dynamic composition",
    "subtle grain, film look",
    "ultra wide angle perspective",
  ];

  const theme = themes[Math.floor(Math.random() * themes.length)];
  const style = styles[Math.floor(Math.random() * styles.length)];
  const mood = moods[Math.floor(Math.random() * moods.length)];
  const extra = extras[Math.floor(Math.random() * extras.length)];
  const seed = Math.floor(Math.random() * 10000);

  return `Generate a ${style} ${theme}, ${mood} mood, ${extra}. Seed ${seed}.`;
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
      // Keep API shape for compatibility with callers; we ignore fileName for random gen
      return new NextResponse('bucketName and fileName are required', { status: 400 });
    }
    const targetFileName = targetFileNameParam || fileName;

    const ai = new GoogleGenAI({ apiKey });

    // Generate a random image from a text-only prompt
    const prompt = generateRandomImagePrompt();
    const config = { responseModalities: ['IMAGE', 'TEXT'], temperature: 0.9, topP: 0.95 };
    const imageModel = 'gemini-2.5-flash-image-preview';
    const contents = [{ role: 'user' as const, parts: [{ text: prompt }] }];
    const response = await ai.models.generateContentStream({ model: imageModel, config, contents });

    // Stream and write the output image into target file in the same bucket
    for await (const chunk of response) {
      const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData) continue;
      const outBuffer = Buffer.from(inlineData.data || '', 'base64');
      const outMime = inlineData.mimeType || 'image/png';

      try {
        const blob = new Blob([outBuffer], { type: outMime });
        // Save to requested target file (agent-specific)
        const putResult = await put(targetFileName, blob, { contentType: outMime, config: { bucket: bucketName } });
        if (putResult?.error) {
          console.error('Error replacing image in Tigris:', putResult.error);
          return new NextResponse(`Failed to upload image: ${putResult.error}`, { status: 500 });
        }

        // Also update the canonical original image in the same bucket
        try {
          await put('original_image.png', blob, { contentType: outMime, config: { bucket: bucketName } });
        } catch (e) {
          console.error('Unexpected error uploading canonical image:', e);
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


