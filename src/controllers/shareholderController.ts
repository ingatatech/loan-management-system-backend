// @ts-nocheck

import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { Repository } from "typeorm";
import { IndividualShareholder } from "../entities/IndividualShareholder";
import { InstitutionShareholder } from "../entities/InstitutionShareholder";
import { Organization } from "../entities/Organization";
import { UploadToCloud } from "../helpers/cloud";
import dbConnection from "../db";
import { UserRole } from "../entities/User";

const extractOrganizationId = (req: AuthenticatedRequest): number | null => {
  console.log("=== EXTRACTING ORGANIZATION ID ===");
  console.log("req.params:", req.params);
  console.log("req.organizationId:", req.organizationId);
  console.log("req.user?.organizationId:", req.user?.organizationId);
  console.log("req.originalUrl:", req.originalUrl);
  
  // Try to get from params first
  let orgId = parseInt(req.params.organizationId || req.params.orgId || "0");
  console.log("From params:", orgId);
  
  // If params doesn't work, try to extract from URL path
  if (isNaN(orgId) || orgId === 0) {
    const urlMatch = req.originalUrl.match(/\/organizations\/(\d+)\//);
    if (urlMatch) {
      orgId = parseInt(urlMatch[1]);
      console.log("From URL extraction:", orgId);
    }
  }
  
  // If still no valid ID and user is CLIENT, use their organizationId
  if ((isNaN(orgId) || orgId === 0) && req.user?.role === UserRole.CLIENT) {
    orgId = req.user.organizationId || 0;
    console.log("From user context (CLIENT):", orgId);
  }
  
  // Last resort - try req.organizationId
  if (isNaN(orgId) || orgId === 0) {
    orgId = req.organizationId || 0;
    console.log("From req.organizationId:", orgId);
  }
  
  console.log("Final extracted organizationId:", orgId);
  return isNaN(orgId) || orgId === 0 ? null : orgId;
};

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    role: string;
    organizationId: number | null;
    username: string;
    email: string;
  };
  organizationId?: number;
}

class ShareholderController {
  private individualShareholderRepository: Repository<IndividualShareholder>;
  private institutionShareholderRepository: Repository<InstitutionShareholder>;
  private organizationRepository: Repository<Organization>;

  constructor() {
    this.individualShareholderRepository = dbConnection.getRepository(IndividualShareholder);
    this.institutionShareholderRepository = dbConnection.getRepository(InstitutionShareholder);
    this.organizationRepository = dbConnection.getRepository(Organization);
  }

// Fixed ShareholderController methods with proper debugging

createIndividualShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== CREATE INDIVIDUAL SHAREHOLDER DEBUG START ===");
    console.log("Request user:", req.user);
    console.log("Request params:", req.params);
    console.log("Request body:", req.body);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    // Get organization ID from URL parameters
    const organizationId = parseInt(req.params.organizationId);
    console.log("Organization ID from params:", organizationId);
    
    if (isNaN(organizationId)) {
      console.log("ERROR: Invalid organization ID");
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {
      console.log("ERROR: Organization access denied", {
        userRole: req.user?.role,
        userOrgId: req.user?.organizationId,
        requestedOrgId: organizationId
      });
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot create shareholders for this organization.",
      });
      return;
    }

    const shareholderData = req.body;
    console.log("Shareholder data received:", shareholderData);

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      console.log("ERROR: Organization not found");
      res.status(404).json({
        success: false,
        message: "Organization not found",
      });
      return;
    }

    // Check for duplicate ID/Passport
    const existingShareholder = await this.individualShareholderRepository.findOne({
      where: {
        idPassport: shareholderData.idPassport,
        organizationId,
      },
    });

    if (existingShareholder) {
      console.log("ERROR: Duplicate ID/Passport found");
      res.status(400).json({
        success: false,
        message: "Individual with this ID/Passport already exists in the organization",
      });
      return;
    }

    // Check for duplicate email if provided
    if (shareholderData.email) {
      const existingEmailShareholder = await this.individualShareholderRepository.findOne({
        where: {
          email: shareholderData.email,
          organizationId,
        },
      });

      if (existingEmailShareholder) {
        console.log("ERROR: Duplicate email found");
        res.status(400).json({
          success: false,
          message: "Individual with this email already exists in the organization",
        });
        return;
      }
    }

    // Create individual shareholder
    const shareholder = this.individualShareholderRepository.create({
      ...shareholderData,
      organization,
      organizationId,
      isActive: true,
      createdBy: req.user?.id,
    });

    console.log("Creating shareholder:", shareholder);
    const savedShareholder = await this.individualShareholderRepository.save(shareholder);
    console.log("Shareholder created successfully:", savedShareholder.id);

    res.status(201).json({
      success: true,
      message: "Individual shareholder created successfully",
      data: savedShareholder,
    });
  } catch (error: any) {
    console.error("Create individual shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during individual shareholder creation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

createInstitutionShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== CREATE INSTITUTION SHAREHOLDER DEBUG START ===");
    console.log("Request user:", req.user);
    console.log("Request params:", req.params);
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const organizationId = parseInt(req.params.organizationId);
    console.log("Organization ID from params:", organizationId);
    
    if (isNaN(organizationId)) {
      console.log("ERROR: Invalid organization ID");
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {
      console.log("ERROR: Organization access denied", {
        userRole: req.user?.role,
        userOrgId: req.user?.organizationId,
        requestedOrgId: organizationId
      });
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot create shareholders for this organization.",
      });
      return;
    }

    const shareholderData = req.body;
    console.log("Institution shareholder data received");

    // Validate organization
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      console.log("ERROR: Organization not found");
      res.status(404).json({
        success: false,
        message: "Organization not found",
      });
      return;
    }

    // Check for duplicate trading license
    const existingShareholder = await this.institutionShareholderRepository.findOne({
      where: {
        tradingLicenseNumber: shareholderData.tradingLicenseNumber,
        organizationId,
      },
    });

    if (existingShareholder) {
      console.log("ERROR: Duplicate trading license found");
      res.status(400).json({
        success: false,
        message: "Institution with this trading license number already exists in the organization",
      });
      return;
    }

    // Check for duplicate institution name
    const existingNameShareholder = await this.institutionShareholderRepository.findOne({
      where: {
        institutionName: shareholderData.institutionName,
        organizationId,
      },
    });

    if (existingNameShareholder) {
      console.log("ERROR: Duplicate institution name found");
      res.status(400).json({
        success: false,
        message: "Institution with this name already exists in the organization",
      });
      return;
    }

    // Create institution shareholder
    const shareholder = this.institutionShareholderRepository.create({
      ...shareholderData,
      organization,
      organizationId,
      isActive: true,
      createdBy: req.user?.id,
    });

    console.log("Creating institution shareholder");
    const savedShareholder = await this.institutionShareholderRepository.save(shareholder);
    console.log("Institution shareholder created successfully:", savedShareholder.id);

    res.status(201).json({
      success: true,
      message: "Institution shareholder created successfully",
      data: savedShareholder,
    });
  } catch (error: any) {
    console.error("Create institution shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during institution shareholder creation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
updateInstitutionShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const shareholderId = parseInt(req.params.id);
    const organizationId = req.organizationId || parseInt(req.params.organizationId);
    const updateData = req.body;

    // Find shareholder
    const shareholder = await this.institutionShareholderRepository.findOne({
      where: {
        id: shareholderId,
        organizationId,
      },
    });

    if (!shareholder) {
      res.status(404).json({
        success: false,
        message: "Institution shareholder not found or access denied",
      });
      return;
    }

    // Check for duplicate trading license if being changed
    if (updateData.tradingLicenseNumber && updateData.tradingLicenseNumber !== shareholder.tradingLicenseNumber) {
      const existingShareholder = await this.institutionShareholderRepository.findOne({
        where: {
          tradingLicenseNumber: updateData.tradingLicenseNumber,
          organizationId,
        },
      });

      if (existingShareholder && existingShareholder.id !== shareholderId) {
        res.status(400).json({
          success: false,
          message: "Institution with this trading license number already exists in the organization",
        });
        return;
      }
    }

    // Check for duplicate institution name if being changed
    if (updateData.institutionName && updateData.institutionName !== shareholder.institutionName) {
      const existingNameShareholder = await this.institutionShareholderRepository.findOne({
        where: {
          institutionName: updateData.institutionName,
          organizationId,
        },
      });

      if (existingNameShareholder && existingNameShareholder.id !== shareholderId) {
        res.status(400).json({
          success: false,
          message: "Institution with this name already exists in the organization",
        });
        return;
      }
    }

    // Create a clean update object without relational data and invalid properties
    const { shareCapitals, physicalAddress, ...cleanUpdateData } = updateData;

    // If physicalAddress is provided, map it to fullAddress
    if (physicalAddress) {
      cleanUpdateData.fullAddress = physicalAddress;
    }

    // Update shareholder basic information
    await this.institutionShareholderRepository.update(shareholderId, {
      ...cleanUpdateData,
      updatedBy: req.user?.id,
    });

    // Get updated shareholder with relations
    const updatedShareholder = await this.institutionShareholderRepository.findOne({
      where: { id: shareholderId },
      relations: ["shareCapitals"],
    });

    res.status(200).json({
      success: true,
      message: "Institution shareholder updated successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    console.error("Update institution shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during institution shareholder update",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getIndividualShareholders = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== GET INDIVIDUAL SHAREHOLDERS DEBUG START ===");
    console.log("Request URL:", req.originalUrl);
    console.log("Request user:", req.user);
    console.log("Request params:", req.params);
    console.log("Request query:", req.query);
    
    // Use the helper function to extract organization ID
    const organizationId = extractOrganizationId(req);
    
    if (!organizationId) {
      console.log("ERROR: Could not extract valid organization ID");
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
        debug: process.env.NODE_ENV === "development" ? {
          params: req.params,
          originalUrl: req.originalUrl,
          user: req.user
        } : undefined
      });
      return;
    }

    // Validate organization access based on user role
    console.log("Validating organization access:", {
      userRole: req.user?.role,
      userOrgId: req.user?.organizationId,
      requestedOrgId: organizationId
    });

    if (req.user?.role === UserRole.CLIENT && req.user?.organizationId !== organizationId) {
      console.log("ERROR: CLIENT user trying to access different organization data");
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot access this organization's data.",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const isActive = req.query.isActive;
    const includeShareCapital = req.query.includeShareCapital === "true";

    console.log("Query parameters:", { page, limit, search, isActive, includeShareCapital });

    const skip = (page - 1) * limit;

    console.log("Building query for organizationId:", organizationId);
    const queryBuilder = this.individualShareholderRepository.createQueryBuilder("shareholder")
      .where("shareholder.organizationId = :organizationId", { organizationId });

    if (includeShareCapital) {
      queryBuilder.leftJoinAndSelect("shareholder.shareCapitals", "shareCapitals");
    }

    if (search) {
      queryBuilder.andWhere(
        "(shareholder.firstname ILIKE :search OR shareholder.lastname ILIKE :search OR shareholder.email ILIKE :search OR shareholder.idPassport ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere("shareholder.isActive = :isActive", { 
        isActive: isActive === "true" 
      });
    }

    queryBuilder
      .orderBy("shareholder.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    console.log("Executing query...");
    const [shareholders, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    console.log("Query results:", { 
      foundShareholders: shareholders.length, 
      totalCount: total,
      totalPages 
    });

    res.status(200).json({
      success: true,
      message: "Individual shareholders retrieved successfully",
      data: {
        shareholders,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error("Get individual shareholders controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching individual shareholders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getInstitutionShareholders = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== GET INSTITUTION SHAREHOLDERS DEBUG START ===");
    console.log("Request URL:", req.originalUrl);
    console.log("Request user:", req.user);
    console.log("Request params:", req.params);
    
    // Use the helper function to extract organization ID
    const organizationId = extractOrganizationId(req);
    
    if (!organizationId) {
      console.log("ERROR: Could not extract valid organization ID");
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
        debug: process.env.NODE_ENV === "development" ? {
          params: req.params,
          originalUrl: req.originalUrl,
          user: req.user
        } : undefined
      });
      return;
    }

    // Validate organization access
    console.log("Validating organization access:", {
      userRole: req.user?.role,
      userOrgId: req.user?.organizationId,
      requestedOrgId: organizationId
    });

    if (req.user?.role === UserRole.CLIENT && req.user?.organizationId !== organizationId) {
      console.log("ERROR: CLIENT user trying to access different organization data");
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot access this organization's data.",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const isActive = req.query.isActive;
    const includeShareCapital = req.query.includeShareCapital === "true";

    console.log("Query parameters:", { page, limit, search, isActive, includeShareCapital });

    const skip = (page - 1) * limit;

    console.log("Building query for organizationId:", organizationId);
    const queryBuilder = this.institutionShareholderRepository.createQueryBuilder("shareholder")
      .where("shareholder.organizationId = :organizationId", { organizationId });

    if (includeShareCapital) {
      queryBuilder.leftJoinAndSelect("shareholder.shareCapitals", "shareCapitals");
    }

    if (search) {
      queryBuilder.andWhere(
        "(shareholder.institutionName ILIKE :search OR shareholder.tradingLicenseNumber ILIKE :search OR shareholder.email ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    if (isActive !== undefined) {
      queryBuilder.andWhere("shareholder.isActive = :isActive", { 
        isActive: isActive === "true" 
      });
    }

    queryBuilder
      .orderBy("shareholder.createdAt", "DESC")
      .skip(skip)
      .take(limit);

    console.log("Executing query...");
    const [shareholders, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    console.log("Query results:", { 
      foundShareholders: shareholders.length, 
      totalCount: total,
      totalPages 
    });

    res.status(200).json({
      success: true,
      message: "Institution shareholders retrieved successfully",
      data: {
        shareholders,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error: any) {
    console.error("Get institution shareholders controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching institution shareholders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
uploadShareholderDocument = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shareholderType = req.params.type; // 'individual' or 'institution'
    const shareholderId = parseInt(req.params.id);
    const documentType = req.body.documentType; // 'idProof', 'passportPhoto', etc.

    console.log('Upload request details:', {
      shareholderType,
      shareholderId,
      documentType,
      hasFiles: !!req.files,
      files: req.files,
      body: req.body
    });

    // Get the uploaded file from req.files
    let uploadedFile: Express.Multer.File | undefined;

    if (req.files) {
      // Check for file in different possible field names
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      // Try common field names
      if (files['document'] && files['document'].length > 0) {
        uploadedFile = files['document'][0];
      } else if (files[documentType] && files[documentType].length > 0) {
        uploadedFile = files[documentType][0];
      } else {
        // Check all fields for any uploaded file
        const allFiles = Object.values(files).flat();
        if (allFiles.length > 0) {
          uploadedFile = allFiles[0];
        }
      }
    }

    if (!uploadedFile) {
      console.log('No file found in request:', {
        files: req.files,
        body: req.body
      });
      
      res.status(400).json({
        success: false,
        message: "No document file uploaded",
        debug: process.env.NODE_ENV === "development" ? {
          files: req.files,
          body: req.body
        } : undefined
      });
      return;
    }

    console.log('File found:', {
      filename: uploadedFile.filename,
      originalname: uploadedFile.originalname,
      size: uploadedFile.size,
      mimetype: uploadedFile.mimetype
    });

    try {
      // Upload to cloud storage
      const uploadResult = await UploadToCloud(uploadedFile);
      
      let updateData: any = {};
      
      // Map document type to field
      switch (documentType) {
        case 'idProof':
          updateData.idProofDocumentUrl = uploadResult.secure_url;
          break;
        case 'passportPhoto':
          updateData.passportPhotoUrl = uploadResult.secure_url;
          break;
        case 'proofOfResidence':
          updateData.proofOfResidenceUrl = uploadResult.secure_url;
          break;
        case 'tradingLicense':
          updateData.tradingLicenseUrl = uploadResult.secure_url;
          break;
        case 'certificateOfIncorporation':
          updateData.certificateOfIncorporationUrl = uploadResult.secure_url;
          break;
        default:
          res.status(400).json({
            success: false,
            message: "Invalid document type",
          });
          return;
      }

      // Update shareholder record
      if (shareholderType === 'individual') {
        await this.individualShareholderRepository.update(shareholderId, updateData);
      } else if (shareholderType === 'institution') {
        await this.institutionShareholderRepository.update(shareholderId, updateData);
      }

      res.status(200).json({
        success: true,
        message: "Document uploaded successfully",
        data: {
          shareholderId,
          documentType,
          documentUrl: uploadResult.secure_url,
          uploadDetails: {
            originalName: uploadedFile.originalname,
            size: uploadedFile.size,
            mimeType: uploadedFile.mimetype,
            publicId: uploadResult.public_id,
          },
        },
      });
    } catch (uploadError: any) {
      console.error('Cloud upload error:', uploadError);
      res.status(500).json({
        success: false,
        message: "Failed to upload document to cloud storage",
        error: process.env.NODE_ENV === "development" ? uploadError.message : "Upload failed"
      });
    }
  } catch (error: any) {
    console.error("Upload shareholder document controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during document upload",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
updateIndividualShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const shareholderId = parseInt(req.params.id);
    const organizationId = req.organizationId || parseInt(req.params.organizationId);
    const updateData = req.body;

    // Find shareholder
    const shareholder = await this.individualShareholderRepository.findOne({
      where: {
        id: shareholderId,
        organizationId,
      },
    });

    if (!shareholder) {
      res.status(404).json({
        success: false,
        message: "Individual shareholder not found or access denied",
      });
      return;
    }

    // Check for duplicate ID/Passport if being changed
    if (updateData.idPassport && updateData.idPassport !== shareholder.idPassport) {
      const existingShareholder = await this.individualShareholderRepository.findOne({
        where: {
          idPassport: updateData.idPassport,
          organizationId,
        },
      });

      if (existingShareholder && existingShareholder.id !== shareholderId) {
        res.status(400).json({
          success: false,
          message: "Individual with this ID/Passport already exists in the organization",
        });
        return;
      }
    }

    // Create a clean update object without relational data
    const { shareCapitals, ...cleanUpdateData } = updateData;

    // Update shareholder basic information
    await this.individualShareholderRepository.update(shareholderId, {
      ...cleanUpdateData,
      updatedBy: req.user?.id,
    });

    // Get updated shareholder with relations
    const updatedShareholder = await this.individualShareholderRepository.findOne({
      where: { id: shareholderId },
      relations: ["shareCapitals"],
    });

    res.status(200).json({
      success: true,
      message: "Individual shareholder updated successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    console.error("Update individual shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during individual shareholder update",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

  deleteIndividualShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const shareholderId = parseInt(req.params.id);
      const organizationId = req.organizationId || parseInt(req.params.organizationId);

      // Find shareholder with share capitals
      const shareholder = await this.individualShareholderRepository.findOne({
        where: {
          id: shareholderId,
          organizationId,
        },
        relations: ["shareCapitals"],
      });

      if (!shareholder) {
        res.status(404).json({
          success: false,
          message: "Individual shareholder not found or access denied",
        });
        return;
      }

      // Check if shareholder has active share capitals
      const activeShareCapitals = shareholder.shareCapitals?.filter(sc => sc.isActive) || [];
      if (activeShareCapitals.length > 0) {
        res.status(400).json({
          success: false,
          message: "Cannot delete shareholder with active share capital contributions",
          data: {
            activeContributionsCount: activeShareCapitals.length,
            totalValue: activeShareCapitals.reduce((sum, sc) => sum + sc.totalContributedCapitalValue, 0),
          },
        });
        return;
      }

      // Delete shareholder (cascade will handle related records)
      await this.individualShareholderRepository.delete(shareholderId);

      res.status(200).json({
        success: true,
        message: "Individual shareholder deleted successfully",
      });
    } catch (error: any) {
      console.error("Delete individual shareholder controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during individual shareholder deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

extendIndividualShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== EXTEND INDIVIDUAL SHAREHOLDER DEBUG START ===");
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const shareholderId = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const extendedData = req.body;

    console.log("Extending shareholder:", shareholderId, "with data:", extendedData);

    if (isNaN(organizationId) || isNaN(shareholderId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID or shareholder ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot extend shareholders for this organization.",
      });
      return;
    }

    // Find existing shareholder
    const shareholder = await this.individualShareholderRepository.findOne({
      where: {
        id: shareholderId,
        organizationId,
      },
    });

    if (!shareholder) {
      res.status(404).json({
        success: false,
        message: "Individual shareholder not found",
      });
      return;
    }

    // Update only the extended fields
    const updateFields = {
      accountNumber: extendedData.accountNumber || shareholder.accountNumber,
      forename2: extendedData.forename2 || shareholder.forename2,
      forename3: extendedData.forename3 || shareholder.forename3,
      passportNo: extendedData.passportNo || shareholder.passportNo,
      placeOfBirth: extendedData.placeOfBirth || shareholder.placeOfBirth,
      postalAddressLine1: extendedData.postalAddressLine1 || shareholder.postalAddressLine1,
      postalAddressLine2: extendedData.postalAddressLine2 || shareholder.postalAddressLine2,
      town: extendedData.town || shareholder.town,
      country: extendedData.country || shareholder.country,
      updatedBy: req.user?.id,
    };

    await this.individualShareholderRepository.update(shareholderId, updateFields);

    // Get updated shareholder
    const updatedShareholder = await this.individualShareholderRepository.findOne({
      where: { id: shareholderId },
      relations: ["shareCapitals"],
    });

    console.log("Individual shareholder extended successfully:", shareholderId);

    res.status(200).json({
      success: true,
      message: "Individual shareholder extended successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    console.error("Extend individual shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during individual shareholder extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

extendInstitutionShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log("=== EXTEND INSTITUTION SHAREHOLDER DEBUG START ===");
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const shareholderId = parseInt(req.params.id);
    const organizationId = parseInt(req.params.organizationId);
    const extendedData = req.body;

    console.log("Extending institution shareholder:", shareholderId, "with data:", extendedData);

    if (isNaN(organizationId) || isNaN(shareholderId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID or shareholder ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {
      res.status(403).json({
        success: false,
        message: "Access denied. You cannot extend shareholders for this organization.",
      });
      return;
    }

    // Find existing shareholder
    const shareholder = await this.institutionShareholderRepository.findOne({
      where: {
        id: shareholderId,
        organizationId,
      },
    });

    if (!shareholder) {
      res.status(404).json({
        success: false,
        message: "Institution shareholder not found",
      });
      return;
    }

    // Update only the extended fields
    const updateFields = {
      accountNumber: extendedData.accountNumber || shareholder.accountNumber,
      tradingName: extendedData.tradingName || shareholder.tradingName,
      companyRegNo: extendedData.companyRegNo || shareholder.companyRegNo,
      postalAddressLine1: extendedData.postalAddressLine1 || shareholder.postalAddressLine1,
      postalAddressLine2: extendedData.postalAddressLine2 || shareholder.postalAddressLine2,
      town: extendedData.town || shareholder.town,
      country: extendedData.country || shareholder.country,
      updatedBy: req.user?.id,
    };

    await this.institutionShareholderRepository.update(shareholderId, updateFields);

    // Get updated shareholder
    const updatedShareholder = await this.institutionShareholderRepository.findOne({
      where: { id: shareholderId },
      relations: ["shareCapitals"],
    });

    console.log("Institution shareholder extended successfully:", shareholderId);

    res.status(200).json({
      success: true,
      message: "Institution shareholder extended successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    console.error("Extend institution shareholder controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during institution shareholder extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
}

export default new ShareholderController();