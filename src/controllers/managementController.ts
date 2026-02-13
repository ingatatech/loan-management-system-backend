import type { Response, NextFunction } from "express"
import { validationResult } from "express-validator"
import dbConnection from "../db";
import { UploadToCloud } from "../helpers/cloud";
import { BoardDirector } from "../entities/BoardDirector"
import { SeniorManagement } from "../entities/SeniorManagement"
import { Organization } from "../entities/Organization"
import { ManagementService } from "../services/managementService"
import type { AuthenticatedRequest } from "../middleware/auth"

export class ManagementController {
  private managementService: ManagementService

  constructor() {
    this.managementService = new ManagementService(
      dbConnection.getRepository(BoardDirector),
      dbConnection.getRepository(SeniorManagement),
      dbConnection.getRepository(Organization),
    )
  }
addBoardDirector = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      })
    }

    const organizationId = req.user!.organizationId!
    const directorData = req.body

    // Handle file uploads
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }
    
    if (files) {
      // Upload ID Proof Document
      if (files.idProofDocument && files.idProofDocument[0]) {
        const idProofResult = await UploadToCloud(files.idProofDocument[0])
        directorData.idProofDocumentUrl = idProofResult.secure_url
      }

      // Upload CV Document
      if (files.cvDocument && files.cvDocument[0]) {
        const cvResult = await UploadToCloud(files.cvDocument[0])
        directorData.cvDocumentUrl = cvResult.secure_url
      }

      // Upload Appointment Letter
      if (files.appointmentLetter && files.appointmentLetter[0]) {
        const appointmentResult = await UploadToCloud(files.appointmentLetter[0])
        directorData.appointmentLetterUrl = appointmentResult.secure_url
      }

      // Upload Qualification Certificates (multiple)
      if (files.qualificationCertificates && files.qualificationCertificates.length > 0) {
        const qualificationUrls = []
        for (const file of files.qualificationCertificates) {
          const result = await UploadToCloud(file)
          qualificationUrls.push(result.secure_url)
        }
        directorData.qualificationCertificates = qualificationUrls
      }

      // Upload Additional Documents (multiple)
      if (files.additionalDocuments && files.additionalDocuments.length > 0) {
        const additionalUrls = []
        for (const file of files.additionalDocuments) {
          const result = await UploadToCloud(file)
          additionalUrls.push(result.secure_url)
        }
        directorData.additionalDocuments = additionalUrls
      }
    }

    const director = await this.managementService.addBoardDirector(directorData, organizationId)

    res.status(201).json({
      success: true,
      message: "Board director added successfully",
      data: director,
    })
  } catch (error: any) {
    // Handle unique constraint errors specifically
    if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
      return res.status(409).json({
        success: false,
        message: "A board director with the same ID/Passport or email already exists in this organization",
        error: error.message,
      })
    }
    
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add board director",
    })
  }
}
  addSeniorManagement = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const organizationId = req.user!.organizationId!
      const managementData = req.body

      // Handle file uploads for senior management
      const files = req.files as { [fieldname: string]: Express.Multer.File[] }
      
      if (files) {
        // Upload CV Document
        if (files.cvDocument && files.cvDocument[0]) {
          const cvResult = await UploadToCloud(files.cvDocument[0])
          managementData.cvDocumentUrl = cvResult.secure_url
        }

        // Upload Appointment Letter
        if (files.appointmentLetter && files.appointmentLetter[0]) {
          const appointmentResult = await UploadToCloud(files.appointmentLetter[0])
          managementData.appointmentLetterUrl = appointmentResult.secure_url
        }

        // Upload Qualification Certificates
        if (files.qualificationCertificates && files.qualificationCertificates.length > 0) {
          const qualificationUrls = []
          for (const file of files.qualificationCertificates) {
            const result = await UploadToCloud(file)
            qualificationUrls.push(result.secure_url)
          }
          managementData.qualificationCertificates = qualificationUrls
        }
      }

      const management = await this.managementService.addSeniorManagement(managementData, organizationId)

      res.status(201).json({
        success: true,
        message: "Senior management added successfully",
        data: management,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to add senior management",
      })
    }
  }

  getBoardDirectors = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user!.organizationId!
      const directors = await this.managementService.getBoardDirectors(organizationId)

      res.status(200).json({
        success: true,
        data: directors,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch board directors",
      })
    }
  }

  getSeniorManagement = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user!.organizationId!
      const management = await this.managementService.getSeniorManagement(organizationId)

      res.status(200).json({
        success: true,
        data: management,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch senior management",
      })
    }
  }

  getManagementTeam = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user!.organizationId!
      const managementTeam = await this.managementService.getManagementTeam(organizationId)

      res.status(200).json({
        success: true,
        data: managementTeam,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: "Failed to fetch management team",
      })
    }
  }

  updateBoardDirector = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const directorId = Number.parseInt(id)

      const director = await this.managementService.updateBoardDirector(directorId, req.body)

      res.status(200).json({
        success: true,
        message: "Board director updated successfully",
        data: director,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update board director",
      })
    }
  }

  updateSeniorManagement = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const managementId = Number.parseInt(id)

      const management = await this.managementService.updateSeniorManagement(managementId, req.body)

      res.status(200).json({
        success: true,
        message: "Senior management updated successfully",
        data: management,
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update senior management",
      })
    }
  }

  deleteBoardDirector = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const directorId = Number.parseInt(id)

      await this.managementService.deleteBoardDirector(directorId)

      res.status(200).json({
        success: true,
        message: "Board director deleted successfully",
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete board director",
      })
    }
  }

  deleteSeniorManagement = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params
      const managementId = Number.parseInt(id)

      await this.managementService.deleteSeniorManagement(managementId)

      res.status(200).json({
        success: true,
        message: "Senior management deleted successfully",
      })
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete senior management",
      })
    }
  }

   extendBoardDirector = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        })
      }

      const organizationId = req.user!.organizationId!
      const directorId = parseInt(req.params.id)
      const extendedData = req.body

      const updatedDirector = await this.managementService.extendBoardDirector(
        directorId,
        organizationId,
        extendedData
      )

      res.status(200).json({
        success: true,
        message: "Board director extended successfully",
        data: updatedDirector,
      })
    } catch (error: any) {
      if (error.message.includes("duplicate key") || error.message.includes("unique constraint") || error.message.includes("account number")) {
        return res.status(409).json({
          success: false,
          message: error.message,
          error: error.message,
        })
      }
      
      res.status(500).json({
        success: false,
        message: error.message || "Failed to extend board director information",
      })
    }
  }
}
