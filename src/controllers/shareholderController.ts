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

  
  // Try to get from params first
  let orgId = parseInt(req.params.organizationId || req.params.orgId || "0");

  
  // If params doesn't work, try to extract from URL path
  if (isNaN(orgId) || orgId === 0) {
    const urlMatch = req.originalUrl.match(/\/organizations\/(\d+)\//);
    if (urlMatch) {
      orgId = parseInt(urlMatch[1]);

    }
  }
  
  // If still no valid ID and user is CLIENT, use their organizationId
  if ((isNaN(orgId) || orgId === 0) && req.user?.role === UserRole.CLIENT) {
    orgId = req.user.organizationId || 0;
    
  }
  
  // Last resort - try req.organizationId
  if (isNaN(orgId) || orgId === 0) {
    orgId = req.organizationId || 0;
   
  }
  

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

    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    // Get organization ID from URL parameters
    const organizationId = parseInt(req.params.organizationId);
    
    if (isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {

      res.status(403).json({
        success: false,
        message: "Access denied. You cannot create shareholders for this organization.",
      });
      return;
    }

    const shareholderData = req.body;

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
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

    const savedShareholder = await this.individualShareholderRepository.save(shareholder);

    res.status(201).json({
      success: true,
      message: "Individual shareholder created successfully",
      data: savedShareholder,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Internal server error during individual shareholder creation",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

createInstitutionShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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

    const organizationId = parseInt(req.params.organizationId);
    
    if (isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID provided",
      });
      return;
    }

    // Validate organization access
    if (req.user?.role !== UserRole.SYSTEM_OWNER && req.user?.organizationId !== organizationId) {

      res.status(403).json({
        success: false,
        message: "Access denied. You cannot create shareholders for this organization.",
      });
      return;
    }

    const shareholderData = req.body;

    // Validate organization
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
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

    const savedShareholder = await this.institutionShareholderRepository.save(shareholder);

    res.status(201).json({
      success: true,
      message: "Institution shareholder created successfully",
      data: savedShareholder,
    });
  } catch (error: any) {
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
    res.status(500).json({
      success: false,
      message: "Internal server error during institution shareholder update",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getIndividualShareholders = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {

    
    // Use the helper function to extract organization ID
    const organizationId = extractOrganizationId(req);
    
    if (!organizationId) {
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

    if (req.user?.role === UserRole.CLIENT && req.user?.organizationId !== organizationId) {
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


    const skip = (page - 1) * limit;

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

    const [shareholders, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);


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
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching individual shareholders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getInstitutionShareholders = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {

    
    const organizationId = extractOrganizationId(req);
    
    if (!organizationId) {
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



    if (req.user?.role === UserRole.CLIENT && req.user?.organizationId !== organizationId) {
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


    const skip = (page - 1) * limit;

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

    const [shareholders, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);


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
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching institution shareholders",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
uploadShareholderDocument = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const shareholderType = req.params.type; 
    const shareholderId = parseInt(req.params.id);
    const documentType = req.body.documentType;


    let uploadedFile: Express.Multer.File | undefined;

    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (files['document'] && files['document'].length > 0) {
        uploadedFile = files['document'][0];
      } else if (files[documentType] && files[documentType].length > 0) {
        uploadedFile = files[documentType][0];
      } else {
        const allFiles = Object.values(files).flat();
        if (allFiles.length > 0) {
          uploadedFile = allFiles[0];
        }
      }
    }

    if (!uploadedFile) {

      
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
      res.status(500).json({
        success: false,
        message: "Failed to upload document to cloud storage",
        error: process.env.NODE_ENV === "development" ? uploadError.message : "Upload failed"
      });
    }
  } catch (error: any) {
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
      res.status(500).json({
        success: false,
        message: "Internal server error during individual shareholder deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

extendIndividualShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const organizationId = parseInt(req.params.organizationId);
    const extendedData = req.body;


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


    res.status(200).json({
      success: true,
      message: "Individual shareholder extended successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Internal server error during individual shareholder extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

extendInstitutionShareholder = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const organizationId = parseInt(req.params.organizationId);
    const extendedData = req.body;


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


    res.status(200).json({
      success: true,
      message: "Institution shareholder extended successfully",
      data: updatedShareholder,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Internal server error during institution shareholder extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
}

export default new ShareholderController();