// @ts-nocheck
import { v2 as cloudinary } from "cloudinary"
import dotenv from "dotenv"
import { Readable } from 'stream';
dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000,
})

export const UploadToCloud = async (file: Express.Multer.File, res?: Response, retries = 3) => {
  let lastError: any;

  // Pre-upload validation
  if (!file.buffer) {
    throw new Error(`File buffer is missing for: ${file.originalname}`);
  }

  try {
    await cloudinary.api.ping();
  } catch (connectionError: any) {
    console.warn('Cloudinary connection warning:', connectionError.message);
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let uploadResponse;
      const baseUploadOptions: any = {
        use_filename: true,
        unique_filename: true,
        timeout: 120000,
        chunk_size: 6000000,
        overwrite: false,
        invalidate: true,
      };

      // Upload from buffer using upload_stream
      const uploadFromBuffer = (buffer: Buffer, options: any): Promise<any> => {
        return new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            options,
            (error, result) => {
              if (error) {
                reject(error);
              } else {
                resolve(result);
              }
            }
          );

          // Create a readable stream from buffer
          const bufferStream = Readable.from(buffer);
          bufferStream.pipe(uploadStream);
        });
      };

      if (file.mimetype.startsWith("image/")) {
        const imageOptions = {
          ...baseUploadOptions,
          folder: "task_images/",
          transformation: [
            { quality: "auto:good" },
            { fetch_format: "auto" },
          ],
          allowed_formats: ["jpg", "png", "gif", "webp", "bmp", "tiff"]
        };
        
        uploadResponse = await uploadFromBuffer(file.buffer, imageOptions);
        
      } else if (file.mimetype.startsWith("audio/")) {
        const audioOptions = {
          ...baseUploadOptions,
          folder: "task_audio/",
          resource_type: "video",
        };
        
        uploadResponse = await uploadFromBuffer(file.buffer, audioOptions);
        
      } else if (file.mimetype.startsWith("video/")) {
        const videoOptions = {
          ...baseUploadOptions,
          folder: "task_videos/",
          resource_type: "video",
          transformation: [
            { quality: "auto:good" },
          ],
        };
        
        uploadResponse = await uploadFromBuffer(file.buffer, videoOptions);
        
      } else {
        const documentOptions = {
          ...baseUploadOptions,
          folder: "task_documents/",
          resource_type: "raw",
        };
        
        uploadResponse = await uploadFromBuffer(file.buffer, documentOptions);
      }

      // Test the uploaded URL
      try {
        const https = require('https');
        const http = require('http');
        const urlModule = require('url');
        
        const parsedUrl = urlModule.parse(uploadResponse.secure_url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const testPromise = new Promise((resolve, reject) => {
          const req = client.request({
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'HEAD',
            timeout: 10000
          }, (res: any) => {
            if (res.statusCode === 200) {
              resolve(true);
            } else {
              reject(new Error(`URL test failed with status: ${res.statusCode}`));
            }
          });
          
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('URL test timeout'));
          });
          
          req.end();
        });
        
        await testPromise;
      } catch (urlTestError: any) {
        console.warn('URL test warning:', urlTestError.message);
      }

      const result = {
        secure_url: uploadResponse.secure_url,
        public_id: uploadResponse.public_id,
        resource_type: uploadResponse.resource_type,
        format: uploadResponse.format,
        bytes: uploadResponse.bytes,
        original_filename: file.originalname,
        upload_timestamp: new Date().toISOString(),
        width: uploadResponse.width,
        height: uploadResponse.height,
        version: uploadResponse.version,
        created_at: uploadResponse.created_at
      };

      return result;

    } catch (error: any) {
      lastError = error;

      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
        console.warn(`Network error on attempt ${attempt}:`, error.code);
      }
      
      const retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'TimeoutError'];
      const isRetryable = retryableErrors.includes(error.name) || 
                         retryableErrors.includes(error.code) || 
                         error.http_code === 499 ||
                         (error.message && error.message.includes('timeout'));

      if (attempt < retries && isRetryable) {
        const waitTime = Math.min(attempt * 2000, 10000);
        console.log(`Retrying upload for ${file.originalname} in ${waitTime}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      if (attempt === retries) {
        break;
      } 
    }
  }

  throw new Error(
    `Failed to upload ${file.originalname} after ${retries} attempts: ${lastError?.message || "Unknown error"}`
  );
}

// Function to delete files from Cloudinary with retry
export const DeleteFromCloud = async (
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
  retries = 3,
) => {
  let lastError: any

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const deleteResponse = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        timeout: 60000, // 1 minute timeout for delete
      })
      return deleteResponse
    } catch (error: any) {
      lastError = error

      if (attempt < retries) {
        const waitTime = attempt * 1000 // 1s, 2s, 3s
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }
    }
  }

  throw new Error(`Failed to delete ${publicId} after ${retries} attempts: ${lastError?.message || "Unknown error"}`)
}

// Function to get file info from Cloudinary with retry
export const GetCloudinaryFileInfo = async (
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
  retries = 3,
) => {
  let lastError: any

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await cloudinary.api.resource(publicId, {
        resource_type: resourceType,
        timeout: 30000, // 30 seconds timeout
      })
      return result
    } catch (error: any) {
      lastError = error

      if (attempt < retries) {
        const waitTime = attempt * 1000
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }
    }
  }

  throw new Error(
    `Failed to get file info for ${publicId} after ${retries} attempts: ${lastError?.message || "Unknown error"}`,
  )
}

// Utility function to validate file before upload
export const validateFileForUpload = (file: Express.Multer.File): { isValid: boolean; error?: string } => {
  const maxSize = 10 * 1024 * 1024 // 10MB
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/avi",
    "video/mov",
    "video/wmv",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
    "application/x-rar-compressed",
  ]

  if (file.size > maxSize) {
    return { isValid: false, error: `File ${file.originalname} exceeds 10MB limit` }
  }

  if (!allowedTypes.includes(file.mimetype)) {
    return { isValid: false, error: `File type ${file.mimetype} is not allowed` }
  }

  return { isValid: true }
}

// Batch upload function for multiple files with sequential processing
export const UploadMultipleToCloud = async (files: Express.Multer.File[]): Promise<any[]> => {
  const results: any[] = []
  const errors: any[] = []

  // Process files sequentially to avoid overwhelming Cloudinary
  for (const file of files) {
    try {
      // Validate file before upload
      const validation = validateFileForUpload(file)
      if (!validation.isValid) {
        errors.push({ file: file.originalname, error: validation.error })
        continue
      }

      const result = await UploadToCloud(file)
      results.push(result)
    } catch (error: any) {
      errors.push({ file: file.originalname, error: error.message })
    }
  }

  if (errors.length > 0) {
    console.warn('Some files failed to upload:', errors)
  }

  return results
}