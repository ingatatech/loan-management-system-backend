
// @ts-nocheck
import { Repository } from "typeorm";
import { BorrowerProfile, Gender, MaritalStatus, RelationshipType, BorrowerProfileData, Address, ExtendedBorrowerData } from "../entities/BorrowerProfile";
import { Organization } from "../entities/Organization";

export interface BorrowerResponse {
  success: boolean;
  message: string;
  data?: BorrowerProfile | BorrowerProfile[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  validationErrors?: Array<{
    field: string;
    message: string;
  }>;
  error?: string;
}

export interface BorrowerValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
}

export class BorrowerService {
  constructor(
    private borrowerRepository: Repository<BorrowerProfile>,
    private organizationRepository: Repository<Organization>
  ) {}

  // ===== VALIDATION SERVICES =====
  
  /**
   * Field-level validation for borrower data
   */
  private validateBorrowerData(data: BorrowerProfileData): BorrowerValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Table 2.1 - Column 2: Names validation
    if (!data.firstName || data.firstName.trim().length < 2 || data.firstName.trim().length > 100) {
      errors.push({
        field: 'firstName',
        message: 'First name must be between 2 and 100 characters'
      });
    }

    if (!data.lastName || data.lastName.trim().length < 2 || data.lastName.trim().length > 100) {
      errors.push({
        field: 'lastName',
        message: 'Last name must be between 2 and 100 characters'
      });
    }

    // Table 2.1 - Column 3: National ID validation (16 digits)
    if (!data.nationalId || !/^\d{16}$/.test(data.nationalId)) {
      errors.push({
        field: 'nationalId',
        message: 'National ID must be exactly 16 digits'
      });
    }

    // Table 2.1 - Column 4: Telephone validation (Format: +XXX-XXX-XXXX)
    if (!data.primaryPhone || !/^\+?[1-9]\d{1,14}$/.test(data.primaryPhone)) {
      errors.push({
        field: 'primaryPhone',
        message: 'Invalid phone number format. Use +XXX-XXX-XXXX format'
      });
    }

    // Table 2.1 - Column 5: Gender validation
    if (!Object.values(Gender).includes(data.gender)) {
      errors.push({
        field: 'gender',
        message: 'Gender must be M, F, or Other'
      });
    }

    // Age validation (18-100 years)
    if (data.dateOfBirth) {
      const birthDate = new Date(data.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      
      if (age < 18 || age > 100) {
        errors.push({
          field: 'dateOfBirth',
          message: 'Age must be between 18 and 100 years'
        });
      }
    } else {
      errors.push({
        field: 'dateOfBirth',
        message: 'Date of birth is required'
      });
    }

    // Table 2.1 - Column 7: Marital status validation
    if (!Object.values(MaritalStatus).includes(data.maritalStatus)) {
      errors.push({
        field: 'maritalStatus',
        message: 'Invalid marital status'
      });
    }

    // Table 2.2 - Column 13-16: Address validation
    if (!data.address || !data.address.district) {
      errors.push({
        field: 'address.district',
        message: 'District is required'
      });
    }

    if (!data.address || !data.address.sector) {
      errors.push({
        field: 'address.sector',
        message: 'Sector is required'
      });
    }

    // Email validation (if provided)
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Cross-field validation
   */
  private performCrossFieldValidation(data: BorrowerProfileData): string[] {
    const warnings: string[] = [];

    // Check if alternative phone is same as primary
    if (data.alternativePhone && data.alternativePhone === data.primaryPhone) {
      warnings.push('Alternative phone should be different from primary phone');
    }

    // Validate income consistency
    if (data.monthlyIncome && data.monthlyIncome > 0 && !data.incomeSource) {
      warnings.push('Income source should be provided when monthly income is specified');
    }

    return warnings;
  }

  /**
   * Business rule validation
   */
  private async validateBusinessRules(
    data: BorrowerProfileData,
    organizationId: number,
    borrowerId?: number
  ): Promise<string[]> {
    const errors: string[] = [];

    // Check for duplicate National ID
    const existingBorrower = await this.borrowerRepository.findOne({
      where: {
        nationalId: data.nationalId,
        organizationId,
        isActive: true
      }
    });

    if (existingBorrower && (!borrowerId || existingBorrower.id !== borrowerId)) {
      errors.push('A borrower with this National ID already exists');
    }

    return errors;
  }

  // ===== DATA TRANSFORMATION SERVICES =====

  /**
   * Transform entity to table 2.1 format
   */
  transformToTable2_1(borrower: BorrowerProfile): Record<string, any> {
    return {
      no: borrower.id,
      namesOfBorrowers: borrower.fullName,
      idOfTheBorrower: borrower.nationalId,
      telephoneNumber: borrower.primaryPhone,
      gender: borrower.gender,
      relationshipWithNDFSP: borrower.relationshipWithNDFSP,
      maritalStatus: borrower.maritalStatus,
      previousLoansPaidOnTime: borrower.previousLoansPaidOnTime > 0,
      purposeOfTheLoan: borrower.defaultLoanPurpose || ''
    };
  }

  /**
   * Transform entity to table 2.2 format (address details)
   */
  transformToTable2_2(borrower: BorrowerProfile): Record<string, any> {
    return {
      district: borrower.address.district || '',
      sector: borrower.address.sector || '',
      cell: borrower.address.cell || '',
      village: borrower.address.village || ''
    };
  }

  // ===== CRUD OPERATIONS =====

  async createBorrowerProfile(
    borrowerData: BorrowerProfileData,
    organizationId: number
  ): Promise<BorrowerResponse> {
    try {
      // Field-level validation
      const validation = this.validateBorrowerData(borrowerData);
      if (!validation.isValid) {
        return {
          success: false,
          message: "Validation failed",
          validationErrors: validation.errors
        };
      }

      // Business rule validation
      const businessRuleErrors = await this.validateBusinessRules(borrowerData, organizationId);
      if (businessRuleErrors.length > 0) {
        return {
          success: false,
          message: businessRuleErrors.join(', '),
          validationErrors: businessRuleErrors.map(err => ({
            field: 'general',
            message: err
          }))
        };
      }

      // Validate organization
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId, isActive: true }
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found or inactive"
        };
      }

      // Generate unique borrower ID (Table 2.1 - Column 1)
      const borrowerId = await this.generateBorrowerId(organizationId);

      // Create borrower profile
      const borrowerProfile = this.borrowerRepository.create({
        borrowerId: borrowerId,
        firstName: borrowerData.firstName,
        lastName: borrowerData.lastName,
        middleName: borrowerData.middleName || null,
        nationalId: borrowerData.nationalId,
        gender: borrowerData.gender,
        dateOfBirth: borrowerData.dateOfBirth,
        maritalStatus: borrowerData.maritalStatus,
        primaryPhone: borrowerData.primaryPhone,
        alternativePhone: borrowerData.alternativePhone || null,
        email: borrowerData.email || null,
        address: borrowerData.address,
        occupation: borrowerData.occupation || null,
        monthlyIncome: borrowerData.monthlyIncome || null,
        incomeSource: borrowerData.incomeSource || null,
        relationshipWithNDFSP: borrowerData.relationshipWithNDFSP || RelationshipType.NONE,
        previousLoansPaidOnTime: borrowerData.previousLoansPaidOnTime || 0,
        notes: borrowerData.notes || null,
        organizationId: organizationId,
        isActive: true
      });

      const savedBorrower = await this.borrowerRepository.save(borrowerProfile);

      // Cross-field validation warnings
      const warnings = this.performCrossFieldValidation(borrowerData);
      
      return {
        success: true,
        message: warnings.length > 0 
          ? `Borrower created successfully. Note: ${warnings.join(', ')}` 
          : "Borrower profile created successfully",
        data: savedBorrower
      };

    } catch (error: any) {
      console.error("Create borrower profile error:", error);
      return {
        success: false,
        message: "Failed to create borrower profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async getBorrowerProfiles(
    organizationId: number,
    page: number = 1,
    limit: number = 10,
    search?: string,
    isActive?: boolean
  ): Promise<BorrowerResponse> {
    try {
      const skip = (page - 1) * limit;
      const queryBuilder = this.borrowerRepository.createQueryBuilder("borrower")
        .where("borrower.organizationId = :organizationId", { organizationId })
        .leftJoinAndSelect("borrower.loans", "loans");

      if (search) {
        queryBuilder.andWhere(
          "(borrower.firstName ILIKE :search OR borrower.lastName ILIKE :search OR borrower.nationalId ILIKE :search OR borrower.borrowerId ILIKE :search)",
          { search: `%${search}%` }
        );
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere("borrower.isActive = :isActive", { isActive });
      }

      queryBuilder
        .orderBy("borrower.createdAt", "DESC")
        .skip(skip)
        .take(limit);

      const [borrowers, total] = await queryBuilder.getManyAndCount();
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: "Borrower profiles retrieved successfully",
        data: borrowers,
        pagination: {
          page,
          limit,
          total,
          totalPages
        }
      };
    } catch (error: any) {
      console.error("Get borrower profiles error:", error);
      return {
        success: false,
        message: "Failed to retrieve borrower profiles",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async getBorrowerById(borrowerId: number, organizationId: number): Promise<BorrowerResponse> {
    try {
      const borrower = await this.borrowerRepository.findOne({
        where: { id: borrowerId, organizationId },
        relations: ["loans", "loans.collaterals", "loans.repaymentSchedules", "loans.transactions"]
      });

      if (!borrower) {
        return {
          success: false,
          message: "Borrower profile not found"
        };
      }

      return {
        success: true,
        message: "Borrower profile retrieved successfully",
        data: borrower
      };
    } catch (error: any) {
      console.error("Get borrower by ID error:", error);
      return {
        success: false,
        message: "Failed to retrieve borrower profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async updateBorrowerProfile(
    borrowerId: number,
    updateData: Partial<BorrowerProfileData>,
    organizationId: number
  ): Promise<BorrowerResponse> {
    try {
      const borrower = await this.borrowerRepository.findOne({
        where: { id: borrowerId, organizationId }
      });

      if (!borrower) {
        return {
          success: false,
          message: "Borrower profile not found"
        };
      }

      // Validate update data
      if (Object.keys(updateData).length > 0) {
        const fullData: BorrowerProfileData = {
          ...borrower,
          ...updateData,
          dateOfBirth: updateData.dateOfBirth || borrower.dateOfBirth
        };

        const validation = this.validateBorrowerData(fullData);
        if (!validation.isValid) {
          return {
            success: false,
            message: "Validation failed",
            validationErrors: validation.errors
          };
        }

        // Business rule validation for National ID
        if (updateData.nationalId && updateData.nationalId !== borrower.nationalId) {
          const businessRuleErrors = await this.validateBusinessRules(
            fullData,
            organizationId,
            borrowerId
          );

          if (businessRuleErrors.length > 0) {
            return {
              success: false,
              message: businessRuleErrors.join(', ')
            };
          }
        }
      }

      // Update borrower profile
      Object.assign(borrower, updateData);
      const updatedBorrower = await this.borrowerRepository.save(borrower);

      return {
        success: true,
        message: "Borrower profile updated successfully",
        data: updatedBorrower
      };
    } catch (error: any) {
      console.error("Update borrower profile error:", error);
      return {
        success: false,
        message: "Failed to update borrower profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async permanentDeleteBorrowerProfile(
    borrowerId: number,
    organizationId: number
  ): Promise<BorrowerResponse> {
    try {
      const borrower = await this.borrowerRepository.findOne({
        where: { id: borrowerId, organizationId },
        relations: ["loans"]
      });

      if (!borrower) {
        return {
          success: false,
          message: "Borrower profile not found"
        };
      }

      // Check if borrower has any loans
      if (borrower.loans && borrower.loans.length > 0) {
        return {
          success: false,
          message: "Cannot permanently delete borrower profile with associated loans. Please delete loans first."
        };
      }

      // Permanent delete
      await this.borrowerRepository.remove(borrower);

      return {
        success: true,
        message: "Borrower profile permanently deleted successfully"
      };
    } catch (error: any) {
      console.error("Permanent delete borrower profile error:", error);
      return {
        success: false,
        message: "Failed to permanently delete borrower profile",
        error: process.env.NODE_ENV === "development" ? error.message : undefined
      };
    }
  }

  async extendBorrowerProfile(
  borrowerId: number,
  organizationId: number,
  extendedData: ExtendedBorrowerData
): Promise<BorrowerResponse> {
  try {
    // Find existing borrower
    const borrower = await this.borrowerRepository.findOne({
      where: {
        id: borrowerId,
        organizationId,
        isActive: true
      }
    });

    if (!borrower) {
      return {
        success: false,
        message: "Borrower not found or inactive"
      };
    }

    // Update only the extended fields (all nullable, won't affect original data)
    Object.keys(extendedData).forEach(key => {
      if (extendedData[key] !== undefined) {
        borrower[key] = extendedData[key];
      }
    });

    // Save extended borrower profile
    const updatedBorrower = await this.borrowerRepository.save(borrower);

    return {
      success: true,
      message: "Borrower profile extended successfully with consumer information",
      data: updatedBorrower
    };

  } catch (error: any) {
    console.error("Extend borrower profile error:", error);
    return {
      success: false,
      message: "Failed to extend borrower profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    };
  }
}

  // ===== HELPER METHODS =====

  private async generateBorrowerId(organizationId: number): Promise<string> {
    const prefix = "BOR";
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      const randomNumber = Math.floor(100000 + Math.random() * 900000);
      const borrowerId = `${prefix}-${randomNumber}`;

      const existing = await this.borrowerRepository.findOne({
        where: { borrowerId, organizationId }
      });

      if (!existing) {
        return borrowerId;
      }

      attempts++;
    }

    throw new Error("Unable to generate unique borrower ID");
  }
}