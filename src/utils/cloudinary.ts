import { v2 as cloudinary } from "cloudinary"
import fs from "fs"
import dotenv from "dotenv"
import type { Express } from "express"

dotenv.config()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  timeout: 120000,
})

export const uploadToCloudinary = async (file: Express.Multer.File, folder = "loan-management") => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      use_filename: true,
      unique_filename: true,
      resource_type: "auto",
    })

    // Clean up local file
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
    }
  } catch (error) {
    // Clean up local file on error
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
    throw error
  }
}

export const deleteFromCloudinary = async (publicId: string, resourceType = "image") => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    })
    return result
  } catch (error) {
    throw error
  }
}
