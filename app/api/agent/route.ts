import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from '@google/genai';
import { createBucket, get, put } from "@tigrisdata/storage";
import { nanoid } from "nanoid";

async function generateImageEditPrompt(
  ai: GoogleGenAI,
  imageBase64: string,
  mimeType: string
): Promise<string> {
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

  const instruction = `Given the provided image, propose a single concise edit instruction (1-2 sentences) that creatively transforms the image.
- Randomized theme: ${randomTheme}
- Visual style: ${randomStyle}
- Seed: ${randomSeed}

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

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return new NextResponse("GEMINI_API_KEY not configured", { status: 500 });
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    // Determine source bucket/file from query and fork a new bucket
    const url = new URL(req.url);
    const sourceBucketName = url.searchParams.get('bucketName') || 'bucket-with-snapshots';
    const sourceFileName = url.searchParams.get('fileName') || 'original_image.png';

    // Generate a bucket name that matches allowed charset: lowercase letters, numbers, dots, hyphens
    const suffix = Math.random().toString(36).slice(2, 10); // a-z0-9
    const forkBucketName = `forked-bucket-${suffix}`;
    const forkResult = await createBucket(forkBucketName, { sourceBucketName });

    if ((forkResult as any)?.error) {
      console.error('Error creating bucket fork:', (forkResult as any).error);
      return new NextResponse(`Failed to create bucket fork: ${(forkResult as any).error}`, { status: 500 });
    }

    // Load the original image from forked bucket
    const getResult = await get(sourceFileName, 'file', {
      config: { bucket: forkBucketName },
    });

    if (getResult.error) {
      console.error('Error getting image from Tigris:', getResult.error);
      return new NextResponse(`Failed to fetch image: ${getResult.error}`, { status: 500 });
    }

    if (!getResult.data) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const arrayBuffer = await getResult.data.arrayBuffer();
    const originalImageBuffer = Buffer.from(arrayBuffer);
    // Normalize mime type: prefer file extension, treat any octet-stream variants as invalid
    const detectedType = (getResult.data.type || '').toLowerCase();
    const fileExt = (sourceFileName.split('?')[0] || '').toLowerCase().split('.').pop() || '';
    const extToMime: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
      tif: 'image/tiff',
      tiff: 'image/tiff',
    };
    let originalImageMime = extToMime[fileExt] || detectedType || 'image/png';
    if (originalImageMime.includes('octet-stream')) {
      originalImageMime = extToMime[fileExt] || 'image/png';
    }
    const originalImageBase64 = originalImageBuffer.toString('base64');

    // Generate an edit prompt conditioned on the original image
    const prompt = await generateImageEditPrompt(ai, originalImageBase64, originalImageMime);

    const config = {
      responseModalities: ['IMAGE', 'TEXT'],
    };

    const imageModel = 'gemini-2.5-flash-image-preview';

    const contents = [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: originalImageMime, data: originalImageBase64 } },
          { text: prompt },
        ],
      },
    ];
    // We'll upload generated image back into the forked bucket

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

        // Upload generated image to Tigris
        const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] || 'png');
        const objectKey = `generated/${nanoid()}.${ext}`;
        const bucketToUse = forkBucketName;

        try {
          const blob = new Blob([buffer], { type: mimeType });
          const putResult = await put(objectKey, blob, {
            contentType: mimeType,
            config: { bucket: bucketToUse },
          });

          if (putResult?.error) {
            console.error('Error uploading generated image to Tigris:', putResult.error);
          } else {
            console.log('Uploaded generated image to Tigris:', objectKey);
          }
        } catch (e) {
          console.error('Unexpected error uploading image:', e);
        }

        return new NextResponse(buffer, {
          headers: {
            "content-type": mimeType,
            "cache-control": "no-store",
            "x-bucket-name": bucketToUse,
            "x-file-name": objectKey,
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

const createdBucketFork = async (bucketName: string) => {

  const result = await createBucket(bucketName, {
    sourceBucketName: "bucket-with-snapshots"
  });

  if (result.error) {
    console.error("error creating bucket fork", result.error);
  } else {
    console.log("bucket fork created", result);
  }

}