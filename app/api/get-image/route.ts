import { NextResponse } from "next/server";
import { get } from '@tigrisdata/storage';

export async function GET() {
  try {
    // Fetch the original_image.png file from ogbucket
    const result = await get('original_image.png', 'file', {
      config: {
        bucket: 'bucket-with-snapshots',
      },
    });
    
    if (result.error) {
      console.error('Error getting image from Tigris:', result.error);
      return new NextResponse(
        `Failed to fetch image: ${result.error}`, 
        { status: 500 }
      );
    }
    
    if (!result.data) {
      return new NextResponse("Image not found", { status: 404 });
    }
    
    // Convert the File to arrayBuffer and then to Buffer
    const arrayBuffer = await result.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Return the image with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        "content-type": result.data.type || "image/png",
        "cache-control": "public, max-age=3600",
        "content-length": buffer.length.toString(),
      },
    });
    
  } catch (error) {
    console.error("Error fetching image from Tigris:", error);
    return new NextResponse(
      `Failed to fetch image: ${error instanceof Error ? error.message : 'Unknown error'}`, 
      { status: 500 }
    );
  }
}

