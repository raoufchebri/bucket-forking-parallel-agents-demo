import { NextRequest, NextResponse } from "next/server";
import { get } from "@tigrisdata/storage";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const bucketName = url.searchParams.get("bucketName");
    const fileName = url.searchParams.get("fileName");
    if (!bucketName || !fileName) {
      return new NextResponse("bucketName and fileName are required", { status: 400 });
    }

    const result = await get(fileName, "file", { config: { bucket: bucketName } });
    if (result.error) {
      console.error("Error getting image from Tigris:", result.error);
      return new NextResponse(`Failed to fetch image: ${result.error}`, { status: 500 });
    }
    if (!result.data) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const arrayBuffer = await result.data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = result.data.type || "image/png";

    return new NextResponse(buffer, {
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-bucket-name": bucketName,
        "x-file-name": fileName,
      },
    });
  } catch (error) {
    console.error("Error fetching image from Tigris:", error);
    return new NextResponse(
      `Failed to fetch image: ${error instanceof Error ? error.message : "Unknown error"}`,
      { status: 500 },
    );
  }
}



