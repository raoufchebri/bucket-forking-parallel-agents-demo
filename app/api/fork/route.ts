import { NextRequest, NextResponse } from "next/server";
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { createBucket, get } from "@tigrisdata/storage";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sourceBucketName = url.searchParams.get('bucketName') || 'bucket-with-snapshots';
    const sourceFileName = url.searchParams.get('fileName') || 'original_image.png';

    // Generate a valid fork bucket name: lowercase letters, numbers, hyphens
    const suffix = Math.random().toString(36).slice(2, 10);
    const forkBucketName = `forked-bucket-${suffix}`;

    const forkResult = await createBucket(forkBucketName, { sourceBucketName });
    if ((forkResult as any)?.error) {
      console.error('Error creating bucket fork:', (forkResult as any).error);
      return new NextResponse(`Failed to create bucket fork: ${(forkResult as any).error}`, { status: 500 });
    }

    // Read the requested file from the forked bucket
    const getResult = await get(sourceFileName, 'file', { config: { bucket: forkBucketName } });
    if (getResult.error) {
      console.error('Error getting image from Tigris:', getResult.error);
      return new NextResponse(`Failed to fetch image: ${getResult.error}`, { status: 500 });
    }
    if (!getResult.data) {
      return new NextResponse('Image not found', { status: 404 });
    }

    const arrayBuffer = await getResult.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Normalize content-type: prefer by extension if storage returns octet-stream
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
    let contentType = extToMime[fileExt] || detectedType || 'image/png';
    if (contentType.includes('octet-stream')) {
      contentType = extToMime[fileExt] || 'image/png';
    }

    return new NextResponse(buffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-bucket-name": forkBucketName,
        "x-file-name": sourceFileName,
      },
    });
  } catch (error) {
    console.error('Error in fork API:', error);
    return new NextResponse('Failed to fork and fetch image', { status: 500 });
  }
}



