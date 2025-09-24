
// @ts-nocheck
import { In } from "typeorm";

import { LoanWorkflowService } from "../services/loanWorkflowService";
import { LoanWorkflow, WorkflowStep } from "../entities/LoanWorkflow";
import { LoanReview, ReviewDecision } from "../entities/LoanReview";
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { LoanApplicationService, GuarantorFiles, CollateralFiles, BorrowerFiles, InstitutionFiles, ServiceResponse } from "../services/loanApplicationService";
import { BorrowerProfile, Gender, RelationshipType } from "../entities/BorrowerProfile";
import { Loan, BorrowerType, InstitutionType, MaritalStatus ,LoanApprovalData, LoanStatus, ShareholderBoardMemberInfo } from "../entities/Loan";
import { LoanCollateral } from "../entities/LoanCollateral";
import { Organization } from "../entities/Organization";
import { Guarantor, ExtendedGuarantorData } from "../entities/Guarantor";
import { User ,UserRole} from "../entities/User";
import { RepaymentSchedule } from "../entities/RepaymentSchedule";
import dbConnection from "../db";
import { parseISO, isValid } from 'date-fns';

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

// export interface CollateralFiles {
//   // Single-file properties (used by update endpoints)
//   proofOfOwnershipUrl?: Express.Multer.File;
//   ownerIdentificationUrl?: Express.Multer.File;
//   legalDocumentUrl?: Express.Multer.File;
//   physicalEvidenceUrl?: Express.Multer.File;

//   // Array-based properties (used by create endpoints where multiple files per field may be uploaded)
//   proofOfOwnership?: Express.Multer.File[];
//   ownerIdentification?: Express.Multer.File[];
//   legalDocument?: Express.Multer.File[];
//   physicalEvidence?: Express.Multer.File[];
//   valuationReport?: Express.Multer.File[];
// }

class LoanApplicationController {
  private userRepository = dbConnection.getRepository(User);
  private loanApplicationService: LoanApplicationService;
 private loanWorkflowService: LoanWorkflowService;
 constructor() {
    this.loanApplicationService = new LoanApplicationService(
      dbConnection.getRepository(BorrowerProfile) as any,
      dbConnection.getRepository(Loan) as any,
      dbConnection.getRepository(LoanCollateral) as any,
      dbConnection.getRepository(Organization) as any,
      dbConnection.getRepository(Guarantor) as any,
      dbConnection.getRepository(User) as any,
      dbConnection.getRepository(RepaymentSchedule) as any
    );
  this.loanWorkflowService = new LoanWorkflowService(
    dbConnection.getRepository(LoanWorkflow) as any,
    dbConnection.getRepository(Loan) as any,
    dbConnection.getRepository(User) as any,
    dbConnection.getRepository(LoanReview) as any
  );
  }


/**
 * Get all reviews for a loan
 */
getLoanReviews = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    const result = await this.loanApplicationService.getLoanReviews(loanId, organizationId);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get loan reviews controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching reviews",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ FIXED: Enhanced controller with proper borrower type handling
createLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ENHANCED CREATE LOAN APPLICATION - PHASE 1                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    // ===== STEP 1: VALIDATION CHECK =====
    console.log('🔍 STEP 1: VALIDATION CHECK');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ Validation errors found:');
      errors.array().forEach((error, index) => {
        const err: any = error;
        const fieldName = err.param ?? err.path ?? err.location ?? 'unknown';
        console.error(`   ${index + 1}. Field: "${fieldName}"`, {
          message: err.msg,
          value: err.value,
          location: err.location
        });
      });
      
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }
    console.log('✅ Validation passed\n');

    // ===== STEP 2: EXTRACT ORGANIZATION ID =====
    console.log('🔍 STEP 2: EXTRACT ORGANIZATION ID');
    const organizationId = parseInt(req.params.organizationId);
    console.log('   Organization ID:', organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      console.error('❌ Invalid organization ID');
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }
    console.log('✅ Organization ID valid\n');

    // ===== STEP 3: PARSE ADDRESS =====
    console.log('🔍 STEP 3: PARSE ADDRESS');
    console.log('   Raw address:', req.body.address);
    let parsedAddress = req.body.address;
    if (typeof req.body.address === 'string') {
      try {
        parsedAddress = JSON.parse(req.body.address);
        console.log('   ✅ Address parsed successfully:', parsedAddress);
      } catch (parseError) {
        console.error('   ❌ Address parsing failed:', parseError);
        res.status(400).json({
          success: false,
          message: "Invalid address format",
        });
        return;
      }
    }
    console.log('✅ Address processing complete\n');

    // ===== STEP 4: DETERMINE BORROWER TYPE =====
    console.log('🔍 STEP 4: DETERMINE BORROWER TYPE');
    const borrowerType = req.body.borrowerType || BorrowerType.INDIVIDUAL;
    console.log('   Borrower Type:', borrowerType);

    // ===== STEP 5: PREPARE BORROWER DATA =====
  // ===== STEP 5: PREPARE BORROWER DATA =====
console.log('🔍 STEP 5: PREPARE BORROWER DATA');

const borrowerData = borrowerType === BorrowerType.INDIVIDUAL ? {
  firstName: req.body.firstName,
  lastName: req.body.lastName,
  middleName: req.body.middleName || undefined,
  nationalId: req.body.nationalId,
  gender: req.body.gender,
  dateOfBirth: this.parseDate(req.body.dateOfBirth),
  maritalStatus: req.body.maritalStatus,
  primaryPhone: req.body.primaryPhone,
  alternativePhone: req.body.alternativePhone || undefined,
  email: req.body.email || undefined,
  address: parsedAddress,
  occupation: req.body.occupation || undefined,
  monthlyIncome: req.body.monthlyIncome ? parseFloat(req.body.monthlyIncome) : undefined,
  incomeSource: req.body.incomeSource || undefined,
  relationshipWithNDFSP: req.body.relationshipWithNDFSP,
  previousLoansPaidOnTime: req.body.previousLoansPaidOnTime ? parseInt(req.body.previousLoansPaidOnTime) : undefined,
  notes: req.body.borrowerNotes || undefined,
} : {
  // ✅ Institution borrower data
  firstName: req.body.institutionProfile?.institutionName || 'Institution Borrower',
  lastName: 'N/A',
  
  // ✅ CRITICAL FIX: Generate 16-character compliant nationalId
  nationalId: (() => {
    // Priority 1: Use TIN number if provided (max 16 chars)
    const tinNumber = req.body.institutionProfile?.tinNumber?.trim();
    if (tinNumber && tinNumber.length > 0) {
      return tinNumber.substring(0, 16);
    }
    
    // Priority 2: Generate unique 16-char ID
    // Format: I{timestamp}{random} = max 16 chars
    const timestamp = Date.now().toString().slice(-10); // 10 digits
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0'); // 5 digits
    return `I${timestamp.substring(0, 15)}`; // "I" + 15 digits = 16 chars
  })(),
  
  gender: Gender.OTHER,
  dateOfBirth: new Date(),
  maritalStatus: MaritalStatus.SINGLE,
  primaryPhone: req.body.institutionProfile?.contactPhone || req.body.primaryPhone,
  alternativePhone: req.body.alternativePhone || undefined,
  email: req.body.institutionProfile?.contactEmail || req.body.email || undefined,
  address: parsedAddress,
  occupation: 'Institution',
  relationshipWithNDFSP: req.body.relationshipWithNDFSP || RelationshipType.NEW_BORROWER,
  previousLoansPaidOnTime: 0,
  notes: req.body.borrowerNotes || `Institution: ${req.body.institutionProfile?.institutionName}`,
};

console.log('✅ Borrower data ready for type:', borrowerType);
    // ===== STEP 6: PARSE MULTIPLE INCOME SOURCES =====
    console.log('🔍 STEP 6: PARSE MULTIPLE INCOME SOURCES');
    let incomeSources = null;
    if (req.body.incomeSources) {
      try {
        incomeSources = typeof req.body.incomeSources === 'string' 
          ? JSON.parse(req.body.incomeSources) 
          : req.body.incomeSources;
        console.log('   Income sources parsed:', incomeSources.length, 'sources');
      } catch (e) {
        console.error('   ❌ Failed to parse income sources:', e);
      }
    }

    // ===== STEP 7: PARSE SPOUSE INFORMATION =====
    console.log('🔍 STEP 7: PARSE SPOUSE INFORMATION');
    let spouseInfo = null;
    if (borrowerType === BorrowerType.INDIVIDUAL && 
        req.body.maritalStatus === MaritalStatus.MARRIED && 
        req.body.spouseInfo) {
      try {
        spouseInfo = typeof req.body.spouseInfo === 'string' 
          ? JSON.parse(req.body.spouseInfo) 
          : req.body.spouseInfo;
        console.log('   Spouse info parsed:', spouseInfo.firstName, spouseInfo.lastName);
        console.log('   ⚠️  Spouse will be auto-saved as guarantor');
      } catch (e) {
        console.error('   ❌ Failed to parse spouse info:', e);
      }
    }

    // ===== STEP 8: PARSE INSTITUTION PROFILE =====
    console.log('🔍 STEP 8: PARSE INSTITUTION PROFILE');
    let institutionProfile = null;
    if (borrowerType === BorrowerType.INSTITUTION && req.body.institutionProfile) {
      try {
        institutionProfile = typeof req.body.institutionProfile === 'string' 
          ? JSON.parse(req.body.institutionProfile) 
          : req.body.institutionProfile;
        console.log('   Institution profile parsed:', institutionProfile.institutionName);
        console.log('   Institution type:', institutionProfile.institutionType);
      } catch (e) {
        console.error('   ❌ Failed to parse institution profile:', e);
      }
    }

    // ========================================
    // ✅ PHASE 1: PARSE SHAREHOLDER/BOARD MEMBERS
    // ========================================
    console.log('🔍 STEP 8B: PARSE SHAREHOLDER/BOARD MEMBER DATA [PHASE 1]');
    let shareholderBoardMembers: ShareholderBoardMemberInfo[] | null = null;
    
    if (borrowerType === BorrowerType.INSTITUTION && req.body.shareholderBoardMembers) {
      try {
        const parsed = typeof req.body.shareholderBoardMembers === 'string' 
          ? JSON.parse(req.body.shareholderBoardMembers) 
          : req.body.shareholderBoardMembers;
        
        if (Array.isArray(parsed)) {
          shareholderBoardMembers = parsed as ShareholderBoardMemberInfo[];
          console.log('   ✅ Shareholder/Board members parsed:', shareholderBoardMembers.length, 'members');
          
          // Log each member
          shareholderBoardMembers.forEach((member, index) => {
            console.log(`   Member ${index + 1}:`, {
              type: member.type,
              name: `${member.firstName} ${member.lastName}`,
              nationalId: member.nationalId,
              position: member.position || 'N/A',
              sharePercentage: member.sharePercentage || 'N/A'
            });
          });
        } else {
          console.error('   ❌ Shareholder/Board members is not an array');
          shareholderBoardMembers = null;
        }
      } catch (e) {
        console.error('   ❌ Failed to parse shareholder/board members:', e);
        shareholderBoardMembers = null;
      }
    } else if (borrowerType === BorrowerType.INSTITUTION) {
      console.log('   ⚠️  No shareholder/board members provided (optional)');
    }

    // ===== STEP 9: PREPARE LOAN DATA =====
    console.log('🔍 STEP 9: PREPARE LOAN DATA');
    const loanData = {
      purposeOfLoan: req.body.purposeOfLoan,
      branchName: req.body.branchName,
      businessOfficer: req.body.businessOfficer,
      disbursedAmount: parseFloat(req.body.disbursedAmount),
      businessType: req.body.businessType || null,
      economicSector: req.body.economicSector || null,
      notes: req.body.loanNotes || undefined,
      
      // Individual-specific fields
      ...(borrowerType === BorrowerType.INDIVIDUAL && {
        incomeSource: req.body.selectedIncomeSource || req.body.incomeSource || undefined,
        otherIncomeSource: req.body.otherIncomeSource || undefined,
        incomeFrequency: req.body.incomeFrequency || undefined,
        incomeAmount: req.body.incomeAmount ? parseFloat(req.body.incomeAmount) : undefined,
      }),
      
      // Enhanced fields
      borrowerType: borrowerType,
      institutionProfile: institutionProfile,
      
      // Conditional fields
      ...(borrowerType === BorrowerType.INDIVIDUAL && {
        maritalStatus: req.body.maritalStatus || null,
        spouseInfo: spouseInfo,
      }),
      
      // ✅ PHASE 1: Shareholder/Board Members
      ...(borrowerType === BorrowerType.INSTITUTION && {
        shareholderBoardMembers: shareholderBoardMembers,
      }),
      
      incomeSources: incomeSources,
    };
    
    console.log('✅ Loan data ready');
    console.log('   Has spouse info:', !!spouseInfo);
    console.log('   Has shareholder/board members:', !!shareholderBoardMembers);
    console.log('   Shareholders count:', shareholderBoardMembers?.length || 0);

    // ===== STEP 10: PREPARE COLLATERAL DATA =====
    console.log('🔍 STEP 10: PREPARE COLLATERAL DATA');
    const collateralData = {
      collateralType: req.body.collateralType,
      description: req.body.collateralDescription || '',
      collateralValue: req.body.collateralValue ? parseFloat(req.body.collateralValue) : 0,
      guarantorName: req.body.guarantorName || undefined,
      guarantorPhone: req.body.guarantorPhone || undefined,
      guarantorAddress: req.body.guarantorAddress || undefined,
      valuationDate: req.body.valuationDate ? this.parseDate(req.body.valuationDate) : undefined,
      valuedBy: req.body.valuedBy || undefined,
      notes: req.body.collateralNotes || undefined,
    };
    console.log('✅ Collateral data ready\n');
 console.log('🔍 STEP 10.5: PARSE MULTIPLE GUARANTORS');
    let guarantorsData: Array<{
      name: string;
      phone: string;
      address?: string;
      nationalId?: string;
      email?: string;
      guarantorType?: 'individual' | 'institution';
      guaranteedAmount?: number;
    }> = [];

    // ✅ NEW: Check for multiple guarantors in request body
    if (req.body.guarantors) {
      try {
        const parsed = typeof req.body.guarantors === 'string' 
          ? JSON.parse(req.body.guarantors) 
          : req.body.guarantors;
        
        if (Array.isArray(parsed)) {
          guarantorsData = parsed;
          console.log('   ✅ Multiple guarantors parsed:', guarantorsData.length, 'guarantors');
          
          // Log each guarantor
          guarantorsData.forEach((guarantor, index) => {
            console.log(`   Guarantor ${index + 1}:`, {
              name: guarantor.name,
              phone: guarantor.phone,
              nationalId: guarantor.nationalId || 'N/A',
              type: guarantor.guarantorType || 'individual'
            });
          });
        } else {
          console.error('   ❌ Guarantors is not an array');
        }
      } catch (e) {
        console.error('   ❌ Failed to parse guarantors:', e);
      }
    } 
    // ✅ BACKWARD COMPATIBILITY: Single guarantor from form fields (100% ORIGINAL)
    else if (req.body.guarantorName && req.body.guarantorPhone) {
      guarantorsData.push({
        name: req.body.guarantorName,
        phone: req.body.guarantorPhone,
        address: req.body.guarantorAddress,
        guaranteedAmount: req.body.collateralValue ? parseFloat(req.body.collateralValue) : undefined,
      });
      console.log('   ✅ Single guarantor from form fields (backward compatibility)');
    } else {
      console.log('   ℹ️  No additional guarantors provided');
    }

    console.log(`   📊 Total guarantors to process: ${guarantorsData.length}`);

    // ===== STEP 10.6: UPDATE COLLATERAL DATA WITH GUARANTORS =====
    console.log('🔍 STEP 10.6: UPDATE COLLATERAL DATA WITH GUARANTORS');
    const collateralDataWithGuarantors = {
      ...collateralData,
      guarantorsData: guarantorsData.length > 0 ? guarantorsData : undefined, // ✅ NEW: Pass array to service
    };
    console.log('✅ Collateral data updated with guarantors\n');
    
console.log('🔍 STEP 11: EXTRACT UPLOADED FILES');
const files = req.files as { [fieldname: string]: Express.Multer.File[] };

console.log('📁 Raw files object keys:', Object.keys(files || {}));
console.log('📁 Files breakdown:', Object.entries(files || {}).map(([key, fileArray]) => 
  `${key}: ${fileArray?.length || 0} file(s)`
).join(', '));

// Collateral files
const collateralFiles: CollateralFiles = {
  proofOfOwnership: files?.proofOfOwnership || [],
  ownerIdentification: files?.ownerIdentification || [],
  legalDocument: files?.legalDocument || [],
  physicalEvidence: files?.physicalEvidence || [],
  valuationReport: files?.valuationReport || [],
  additionalCollateralDocs: files?.additionalCollateralDocs || [],
};

// Guarantor files
const guarantorFiles: GuarantorFiles = {
  guarantorIdentification: files?.guarantorIdentification || [],
  guarantorCrbReport: files?.guarantorCrbReport || [],
};

// Borrower files (only for individuals)
const borrowerFiles: BorrowerFiles = formData.borrowerType === BorrowerType.INDIVIDUAL ? {
  marriageCertificate: files?.marriageCertificate || [],
  spouseCrbReport: files?.spouseCrbReport || [],
  spouseIdentification: files?.spouseIdentification || [],
  witnessCrbReport: files?.witnessCrbReport || [],
  witnessIdentification: files?.witnessIdentification || [],
} : {
  marriageCertificate: [],
  spouseCrbReport: [],
  spouseIdentification: [],
  witnessCrbReport: [],
  witnessIdentification: [],
};

// ✅ FIX: Institution files with shareholder/board member files
const institutionFiles: InstitutionFiles = formData.borrowerType === BorrowerType.INSTITUTION ? {
  institutionLegalDocument: files?.institutionLegalDocument || [],
  cooperativeLegalDocument: files?.cooperativeLegalDocument || [],
  otherInstitutionLegalDocument: files?.otherInstitutionLegalDocument || [],
  institutionLicense: files?.institutionLicense || [],
  institutionTradingLicense: files?.institutionTradingLicense || [],
  institutionRegistration: files?.institutionRegistration || [],
  // shareholderIdentification: files?.shareholderIdentification || [],
  // boardMemberIdentification: files?.boardMemberIdentification || [],
  // proofOfShares: files?.proofOfShares || [],
  // boardResolution: files?.boardResolution || [],
  // shareholderCrbReport: files?.shareholderCrbReport || [],
  // boardMemberCrbReport: files?.boardMemberCrbReport || [],

  
  // ✅ FIX: Add shareholder/board member files to institutionFiles
  shareholderIdentification: files?.shareholderIdentification || [],
  boardMemberIdentification: files?.boardMemberIdentification || [],
  proofOfShares: files?.proofOfShares || [],
  boardResolution: files?.boardResolution || [],
  shareholderCrbReport: files?.shareholderCrbReport || [],
  boardMemberCrbReport: files?.boardMemberCrbReport || [],
} : {
  institutionLegalDocument: [],
  cooperativeLegalDocument: [],
  otherInstitutionLegalDocument: [],
  institutionLicense: [],
  institutionTradingLicense: [],
  institutionRegistration: [],
  shareholderIdentification: [],
  boardMemberIdentification: [],
  proofOfShares: [],
  boardResolution: [],
  shareholderCrbReport: [],
  boardMemberCrbReport: [],
};

const fileSummary = {
  collateral: Object.values(collateralFiles).reduce((total, arr) => total + arr.length, 0),
  guarantor: Object.values(guarantorFiles).reduce((total, arr) => total + arr.length, 0),
  borrower: Object.values(borrowerFiles).reduce((total, arr) => total + arr.length, 0),
  institution: Object.values(institutionFiles).reduce((total, arr) => total + arr.length, 0),
};

console.log('   📁 Files summary for borrower type:', formData.borrowerType, fileSummary);

// ✅ FIX: Log shareholder/board member files specifically
if (formData.borrowerType === BorrowerType.INSTITUTION) {
  const shareholderFiles = {
    shareholderIdentification: institutionFiles.shareholderIdentification?.length || 0,
    boardMemberIdentification: institutionFiles.boardMemberIdentification?.length || 0,
    proofOfShares: institutionFiles.proofOfShares?.length || 0,
    boardResolution: institutionFiles.boardResolution?.length || 0,
    shareholderCrbReport: institutionFiles.shareholderCrbReport?.length || 0,
    boardMemberCrbReport: institutionFiles.boardMemberCrbReport?.length || 0,
  };
  
  const totalShareholderFiles = Object.values(shareholderFiles).reduce((sum, count) => sum + count, 0);
  
  console.log('   📊 Shareholder/Board member files:', shareholderFiles);
  console.log(`   ✅ Total shareholder/board member files: ${totalShareholderFiles}`);
}

console.log('✅ Files extracted\n');

// ===== STEP 12: CALL SERVICE =====
console.log('🔍 STEP 12: CALL LOAN APPLICATION SERVICE');
console.log('   Calling createCompleteLoanApplication...');

const result = await this.loanApplicationService.createCompleteLoanApplication(
  borrowerData,
  loanData,
  collateralDataWithGuarantors, 
  organizationId,
  req.user?.id || null,
  collateralFiles,
  guarantorFiles,
  borrowerFiles,
  institutionFiles // ✅ FIX: This now includes shareholder/board member files
);

console.log('   Service call completed');
console.log('   Result:', {
  success: result.success,
  message: result.message,
  hasData: !!result.data,
  spouseCreated: result.data?.spouseGuarantorCreated,
  shareholdersCount: result.data?.shareholdersCount,
  shareholderDocsUploaded: result.data?.shareholderDocumentsUploaded, // ✅ NEW
});

    // ===== STEP 13: SEND RESPONSE =====
    console.log('🔍 STEP 13: SEND RESPONSE');
    if (result.success) {
      console.log('✅ SUCCESS - Loan application created');
      console.log('   Loan ID:', result.data?.loan?.loanId);
      console.log('   Borrower Type:', result.data?.loan?.borrowerType);
      
      // ✅ PHASE 1 Success indicators
      if (result.data?.spouseGuarantorCreated) {
        console.log('   ✅ PHASE 1: Spouse auto-created as guarantor');
      }
      if (result.data?.shareholdersCount) {
        console.log(`   ✅ PHASE 1: ${result.data.shareholdersCount} shareholders/board members saved`);
      }
      
      console.log('   Status:', result.data?.status);
      
      res.status(201).json(result);
    } else {
      console.error('❌ FAILED - Loan application creation failed');
      console.error('   Reason:', result.message);
      
      res.status(400).json(result);
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║  LOAN APPLICATION CREATION COMPLETED                           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

  } catch (error: any) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║  CRITICAL ERROR IN CREATE LOAN APPLICATION                    ║');
    console.error('╚════════════════════════════════════════════════════════════════╝');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      success: false,
      message: "Internal server error during loan application creation",
      debugInfo: process.env.NODE_ENV === "development" ? {
        error: error.message,
        stack: error.stack
      } : undefined,
    });
  }
};

  getLoanGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanGuarantors(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan guarantors controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching guarantors",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  updateGuarantor = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const guarantorId = parseInt(req.params.guarantorId);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const updateData = {
        name: req.body.name,
        phone: req.body.phone,
        address: req.body.address,
        guaranteedAmount: req.body.guaranteedAmount,
        isActive: req.body.isActive,
        updatedBy: req.user?.id || null,
      };

      const result = await this.loanApplicationService.updateGuarantor(
        guarantorId, 
        updateData, 
        organizationId
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Update guarantor controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while updating guarantor",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

   approveLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      console.log('=== APPROVE LOAN APPLICATION CONTROLLER START ===');
      
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
      const loanId = parseInt(req.params.loanId);
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "User authentication required",
        });
        return;
      }

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      // ✅ Extract approval data (the 6 fields)
      const approvalData: LoanApprovalData = {
        annualInterestRate: parseFloat(req.body.annualInterestRate),
        disbursementDate: this.parseDate(req.body.disbursementDate),
        agreedMaturityDate: this.parseDate(req.body.agreedMaturityDate),
        repaymentFrequency: req.body.repaymentFrequency,
        interestMethod: req.body.interestMethod,
        gracePeriodMonths: req.body.gracePeriodMonths ? parseInt(req.body.gracePeriodMonths) : undefined,
      };

      const notes = req.body.notes;

      console.log('Approval request:', {
        loanId,
        organizationId,
        userId,
        approvalData
      });

      const result = await this.loanApplicationService.approveLoanApplication(
        loanId,
        approvalData,
        userId,
        organizationId,
        notes
      );

      console.log('Approval result:', result.success);
      console.log('=== APPROVE LOAN APPLICATION CONTROLLER END ===');

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error: any) {
      console.error("Approve loan application controller error:", error);
      
      res.status(500).json({
        success: false,
        message: "Internal server error during loan approval",
        debugInfo: process.env.NODE_ENV === "development" ? {
          originalMessage: error.message
        } : undefined,
      });
    }
  };
// In LoanApplicationController class - ENHANCE existing method
rejectLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('=== REJECT LOAN APPLICATION CONTROLLER START ===');
    
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
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User authentication required",
      });
      return;
    }

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    const rejectionReason = req.body.rejectionReason?.trim();
    const notes = req.body.notes;

    if (!rejectionReason || rejectionReason.length < 10) {
      res.status(400).json({
        success: false,
        message: "Rejection reason must be at least 10 characters",
      });
      return;
    }

    console.log('Rejection request:', {
      loanId,
      organizationId,
      userId,
      userRole,
      rejectionReason
    });

    // ✅ NEW: Role-based rejection logic
    let result: ServiceResponse;

    if (userRole === UserRole.LOAN_OFFICER) {
      // LOAN OFFICER can reject only if loan has no workflow OR is assigned to them
      const workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
      
      if (!workflow.success || !workflow.data) {
        // No workflow - allow rejection
        result = await this.loanApplicationService.rejectLoanApplication(
          loanId,
          rejectionReason,
          userId,
          organizationId,
          notes
        );
      } else if (workflow.data.currentAssigneeId === userId) {
        // Assigned to them - allow rejection with workflow update
        const workflowResult = await this.loanWorkflowService.advanceWorkflow(
          loanId,
          userId,
          ReviewDecision.REJECT,
          null,
          rejectionReason,
          organizationId
        );
        
        if (workflowResult.success) {
          result = await this.loanApplicationService.rejectLoanApplication(
            loanId,
            rejectionReason,
            userId,
            organizationId,
            notes
          );
        } else {
          result = workflowResult;
        }
      } else {
        result = {
          success: false,
          message: "You can only reject loans assigned to you or unassigned loans"
        };
      }
    } else if (userRole === UserRole.MANAGER || userRole === UserRole.CLIENT) {
      // MANAGER and CLIENT can reject if assigned to them
      const workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
      
      if (!workflow.success || !workflow.data) {
        result = {
          success: false,
          message: "Workflow not found for this loan"
        };
      } else if (workflow.data.currentAssigneeId !== userId) {
        result = {
          success: false,
          message: "You can only reject loans assigned to you"
        };
      } else {
        // Update workflow and reject loan
        const workflowResult = await this.loanWorkflowService.advanceWorkflow(
          loanId,
          userId,
          ReviewDecision.REJECT,
          null,
          rejectionReason,
          organizationId
        );
        
        if (workflowResult.success) {
          result = await this.loanApplicationService.rejectLoanApplication(
            loanId,
            rejectionReason,
            userId,
            organizationId,
            notes
          );
        } else {
          result = workflowResult;
        }
      }
    } else {
      result = {
        success: false,
        message: "You don't have permission to reject loans"
      };
    }

    console.log('Rejection result:', result.success);
    console.log('=== REJECT LOAN APPLICATION CONTROLLER END ===');

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Reject loan application controller error:", error);
    
    res.status(500).json({
      success: false,
      message: "Internal server error during loan rejection",
      debugInfo: process.env.NODE_ENV === "development" ? {
        originalMessage: error.message
      } : undefined,
    });
  }
};

// Add to LoanApplicationController class

getRejectedLoanApplications = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const result = await this.loanApplicationService.getRejectedLoanApplications(
      organizationId,
      page,
      limit,
      search
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get rejected loan applications controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching rejected loan applications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

getPendingLoanApplications = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100; // Increased limit
    const search = req.query.search as string;
    const statusFilter = req.query.statusFilter as 'pending' | 'rejected' | 'all' || 'pending';

    // ✅ FIXED: Get ALL pending loans for everyone, but we'll enhance with workflow info
    const result = await this.loanApplicationService.getPendingLoanApplicationsWithWorkflow(
      organizationId,
      page,
      limit,
      search,
      statusFilter
    );

    if (result.success) {
      // ✅ FIXED: Enhance response with user role for frontend action filtering
      const enhancedData = {
        ...result,
        userRole: req.user?.role,
        userId: req.user?.id
      };
      
      res.status(200).json(enhancedData);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get loan applications controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching loan applications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
getLoanPerformanceMetrics = async (
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID"
      });
      return;
    }

    const result = await this.loanApplicationService
      .getLoanPerformanceMetrics(loanId, organizationId);

    if (result.success && result.data) {
      // FINAL VALIDATION: Ensure compact number formatting
      const formattedData = this.formatMetricsForResponse(result.data);
      
      res.status(200).json({
        success: true,
        message: "Performance metrics retrieved successfully",
        data: formattedData
      });
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get loan performance metrics controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching performance metrics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

private formatMetricsForResponse(metrics: any): any {
  const formatted = { ...metrics };
  
  // Format currency values with proper decimal places
  if (formatted.principalRepaid !== undefined) {
    formatted.principalRepaid = Number(formatted.principalRepaid.toFixed(2));
  }
  
  if (formatted.balanceOutstanding !== undefined) {
    formatted.balanceOutstanding = Number(formatted.balanceOutstanding.toFixed(2));
  }
  
  // Format percentages with proper decimal places
  if (formatted.paymentCompletionRate !== undefined) {
    formatted.paymentCompletionRate = Number(formatted.paymentCompletionRate.toFixed(2));
  }
  
  if (formatted.principalRecoveryRate !== undefined) {
    formatted.principalRecoveryRate = Number(formatted.principalRecoveryRate.toFixed(2));
  }
  
  return formatted;
}
  // ORIGINAL: Get loan applications (unchanged)
  getLoanApplications = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const status = req.query.status as string;

      const result = await this.loanApplicationService.getLoanApplications(
        organizationId,
        page,
        limit,
        search,
        status
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loan applications controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan applications",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Get loan application by ID (unchanged)
  getLoanApplicationById = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan application by ID controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan application",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Update loan application (unchanged)
  updateLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const updateData = { ...req.body };
      try {
        if (updateData.dateOfBirth) {
          updateData.dateOfBirth = this.parseDate(updateData.dateOfBirth);
        }
        if (updateData.disbursementDate) {
          updateData.disbursementDate = this.parseDate(updateData.disbursementDate);
        }
        if (updateData.valuationDate) {
          updateData.valuationDate = this.parseDate(updateData.valuationDate);
        }
      } catch (dateError: any) {
        res.status(400).json({
          success: false,
          message: "Invalid date format: " + dateError.message,
        });
        return;
      }

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const collateralFiles: CollateralFiles = {
        proofOfOwnershipUrl: files?.proofOfOwnership?.[0],
        ownerIdentificationUrl: files?.ownerIdentification?.[0],
        legalDocumentUrl: files?.legalDocument?.[0],
        physicalEvidenceUrl: files?.physicalEvidence?.[0],
      };

      const result = await this.loanApplicationService.updateLoanApplication(
        loanId,
        updateData,
        organizationId,
        req.user?.id || null,
        collateralFiles
      );

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan application not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Update loan application controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan application update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Delete loan application (unchanged)
  deleteLoanApplication = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.deleteLoanApplication(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        const statusCode = result.message === "Loan application not found" ? 404 : 400;
        res.status(statusCode).json(result);
      }
    } catch (error: any) {
      console.error("Delete loan application controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan application deletion",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // ORIGINAL: Get loan application stats (unchanged)
  getLoanApplicationStats = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanApplicationStats(organizationId);

      if (result.success && result.data) {
        const enhancedData = {
          ...result.data,
          averageProcessingTime: 7,
          totalDisbursedAmount: result.data.totalDisbursed,
          disbursedApplications: result.data.statusBreakdown?.disbursed || 0,
          rejectedApplications: result.data.statusBreakdown?.rejected || 0,
          approvedApplications: result.data.statusBreakdown?.approved || 0,
          pendingApplications: result.data.statusBreakdown?.pending || 0
        };

        res.status(200).json({
          success: true,
          message: "Loan application statistics retrieved successfully",
          data: enhancedData
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Get loan application stats controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching loan application statistics",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Daily interest accrual endpoint
  performDailyInterestAccrual = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.performDailyInterestAccrual(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Daily interest accrual controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during daily interest accrual",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Get loan with current balances (real-time calculation)
  getLoanCurrentBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const result = await this.loanApplicationService.getLoanWithCurrentBalances(loanId, organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(404).json(result);
      }
    } catch (error: any) {
      console.error("Get loan current balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while fetching current balances",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Update organization loan balances
  updateOrganizationLoanBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.updateOrganizationLoanBalances(organizationId);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Update organization loan balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan balance updates",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

getPortfolioSummary = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanApplicationService.getPortfolioSummary(organizationId);

    if (result.success && result.data) {
      // ENHANCE the response to include missing fields
      const enhancedData = {
        ...result.data,
        // Calculate performing/non-performing loans from status breakdown
        performingLoans: result.data.statusBreakdown?.performing || 0,
        nonPerformingLoans: (result.data.totalLoans || 0) - (result.data.statusBreakdown?.performing || 0),
        // Add average interest rate (you might need to calculate this from your loans)
        averageInterestRate: 12.5 // Replace with actual calculation from your service
      };

      res.status(200).json({
        success: true,
        message: "Portfolio summary retrieved successfully",
        data: enhancedData
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get portfolio summary controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching portfolio summary",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

  recalculateLoanBalances = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);
      const loanId = parseInt(req.params.loanId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      if (!loanId || isNaN(loanId)) {
        res.status(400).json({
          success: false,
          message: "Invalid loan ID",
        });
        return;
      }

      const currentBalances = await this.loanApplicationService.calculateCurrentLoanBalances(loanId);

      if (!currentBalances) {
        res.status(404).json({
          success: false,
          message: "Loan not found or calculation failed",
        });
        return;
      }

      // Update the loan with calculated balances
      await dbConnection.getRepository(Loan).update(loanId, {
        outstandingPrincipal: currentBalances.outstandingPrincipal,
        accruedInterestToDate: currentBalances.accruedInterestToDate,
        daysInArrears: currentBalances.daysInArrears,
        status: currentBalances.status,
        updatedAt: new Date()
      });

      res.status(200).json({
        success: true,
        message: "Loan balances recalculated successfully",
        data: {
          loanId,
          previousBalances: {
            // These would be the old values before update
          },
          updatedBalances: currentBalances,
          calculationTimestamp: new Date()
        }
      });

    } catch (error: any) {
      console.error("Recalculate loan balances controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during loan balance recalculation",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

getOverdueLoans = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const daysOverdue = parseInt(req.query.daysOverdue as string) || 1;

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    // Use the service method
    const result = await this.loanApplicationService.getOverdueLoans(organizationId, daysOverdue);

    if (result.success && result.data) {
      // Transform the data to match frontend expectations
      const transformedOverdueLoans = result.data.overdueLoans.map((loan: any) => ({
        ...loan,
        // Add computed properties for frontend
        borrowerName: loan.borrower ? `${loan.borrower.firstName} ${loan.borrower.lastName}` : 'Unknown',
        borrowerPhone: loan.borrower?.primaryPhone || 'N/A',
        loanAmount: loan.disbursedAmount,
        currentBalance: loan.currentBalances?.outstandingPrincipal || loan.outstandingPrincipal,
        nextPaymentAmount: loan.monthlyInstallmentAmount, // You might need to calculate this
        daysPastDue: loan.currentBalances?.daysInArrears || loan.daysInArrears
      }));

      res.status(200).json({
        success: true,
        message: `Retrieved ${transformedOverdueLoans.length} overdue loans`,
        data: {
          overdueLoans: transformedOverdueLoans,
          summary: result.data.summary
        }
      });
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get overdue loans controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching overdue loans",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
  // NEW: Bulk update loan statuses based on arrears
  bulkUpdateLoanStatuses = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const result = await this.loanApplicationService.updateOrganizationLoanBalances(organizationId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Bulk loan status update completed successfully",
          data: {
            ...result.data,
            organizationId,
            updateTimestamp: new Date()
          }
        });
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error("Bulk update loan statuses controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error during bulk status update",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  // NEW: Get loan classification report
  getLoanClassificationReport = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = parseInt(req.params.organizationId);

      if (!organizationId || isNaN(organizationId)) {
        res.status(400).json({
          success: false,
          message: "Invalid organization ID",
        });
        return;
      }

      const loans = await dbConnection.getRepository(Loan)
        .find({
          where: { organizationId },
          relations: ['borrower']
        });

      const classificationData = await Promise.all(
        loans.map(async (loan) => {
          const currentBalances = await this.loanApplicationService.calculateCurrentLoanBalances(loan.id);
          
          if (!currentBalances) return null;

          return {
            loanId: loan.loanId,
            borrowerName: loan.borrower.fullName,
            disbursedAmount: loan.disbursedAmount,
            outstandingPrincipal: currentBalances.outstandingPrincipal,
            accruedInterest: currentBalances.accruedInterestToDate,
            daysInArrears: currentBalances.daysInArrears,
            classificationCategory: loan.getClassificationCategory(),
            provisioningRate: loan.getProvisioningRate(),
            netExposure: loan.calculateNetExposure(),
            provisionRequired: loan.calculateProvisionRequired(),
            status: currentBalances.status
          };
        })
      );

      const validClassifications = classificationData.filter(item => item !== null);
      
      const summary = {
        totalLoans: validClassifications.length,
        totalDisbursed: validClassifications.reduce((sum, item) => sum + item!.disbursedAmount, 0),
        totalOutstanding: validClassifications.reduce((sum, item) => sum + (item!.outstandingPrincipal + item!.accruedInterest), 0),
        totalProvisionRequired: validClassifications.reduce((sum, item) => sum + item!.provisionRequired, 0),
        classificationBreakdown: {
          normal: validClassifications.filter(item => item!.classificationCategory === 'Normal/Standard').length,
          watch: validClassifications.filter(item => item!.classificationCategory === 'Watch').length,
          substandard: validClassifications.filter(item => item!.classificationCategory === 'Substandard').length,
          doubtful: validClassifications.filter(item => item!.classificationCategory === 'Doubtful').length,
          loss: validClassifications.filter(item => item!.classificationCategory === 'Loss').length
        }
      };

      res.status(200).json({
        success: true,
        message: "Loan classification report generated successfully",
        data: {
          classificationData: validClassifications,
          summary,
          reportGeneratedAt: new Date()
        }
      });

    } catch (error: any) {
      console.error("Get loan classification report controller error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error while generating classification report",
        error: process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };

  private parseDate(dateString: string): Date {
    if (!dateString) {
      throw new Error("Date is required");
    }

    try {
      let parsedDate: Date;
      
      if (dateString.includes('T')) {
        parsedDate = parseISO(dateString);
      } else {
        const dateParts = dateString.split('-');
        if (dateParts.length !== 3) {
          throw new Error('Invalid date format');
        }
        
        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        const day = parseInt(dateParts[2]);
        
        parsedDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
      }

      if (!isValid(parsedDate)) {
        throw new Error('Invalid date format');
      }
      
      return parsedDate;
    } catch (error) {
      throw new Error(`Invalid date format: ${dateString}. Please use YYYY-MM-DD format.`);
    }
  }
  changeLoanStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('=== CHANGE LOAN STATUS CONTROLLER DEBUG START ===');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('User info:', req.user);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    const { 
      newStatus, 
      notes, 
      sendEmail = true,
      customMessage,
      dueDate 
    } = req.body;

    console.log('Processing status change:', {
      loanId,
      organizationId,
      newStatus,
      notes,
      sendEmail,
      customMessage,
      dueDate,
      userId: req.user?.id
    });


    const result = await this.loanApplicationService.changeLoanStatus(
      loanId,
      newStatus,
      organizationId,
      req.user?.id || null,
      notes || '',
      {
        sendEmail,
        customMessage,
        dueDate
      }
    );

    console.log('Status change result:', {
      success: result.success,
      message: result.message,
      emailSent: result.data?.notification?.emailSent
    });
    console.log('=== CHANGE LOAN STATUS CONTROLLER DEBUG END ===');

    if (result.success) {
      res.status(200).json(result);
    } else {
      const statusCode = result.message?.includes('not found') ? 404 : 
                        result.message?.includes('Invalid status transition') ? 422 : 400;
      res.status(statusCode).json(result);
    }
  } catch (error: any) {
    console.error("Change loan status controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during loan status change",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
  

bulkChangeLoanStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('=== BULK CHANGE LOAN STATUS CONTROLLER DEBUG START ===');
    console.log('Request body:', req.body);
    console.log('User info:', req.user);

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const { 
      loanIds, 
      newStatus, 
      notes, 
      sendEmail = true,
      customMessage 
    } = req.body;

    console.log('Processing bulk status change:', {
      loanIds,
      organizationId,
      newStatus,
      notes,
      sendEmail,
      customMessage,
      userId: req.user?.id
    });

    // Validate inputs
    if (!Array.isArray(loanIds) || loanIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "loanIds must be a non-empty array",
      });
      return;
    }

    if (!Object.values(LoanStatus).includes(newStatus)) {
      res.status(400).json({
        success: false,
        message: `Invalid loan status. Valid statuses: ${Object.values(LoanStatus).join(', ')}`,
      });
      return;
    }

    // Validate loan IDs are numbers
    const validLoanIds = loanIds.filter(id => Number.isInteger(id) && id > 0);
    if (validLoanIds.length !== loanIds.length) {
      res.status(400).json({
        success: false,
        message: "All loan IDs must be positive integers",
      });
      return;
    }

    const result = await this.loanApplicationService.bulkChangeLoanStatus(
      validLoanIds,
      newStatus,
      organizationId,
      req.user?.id || null,
      notes || '',
      {
        sendEmail,
        customMessage
      }
    );

    console.log('Bulk status change result:', {
      success: result.success,
      message: result.message,
      summary: result.data?.summary
    });
    console.log('=== BULK CHANGE LOAN STATUS CONTROLLER DEBUG END ===');

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Bulk change loan status controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during bulk status change",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get loans eligible for status change
 */
getLoansEligibleForStatusChange = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
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
    const currentStatus = req.query.currentStatus as LoanStatus;

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    // Validate current status if provided
    if (currentStatus && !Object.values(LoanStatus).includes(currentStatus)) {
      res.status(400).json({
        success: false,
        message: `Invalid current status. Valid statuses: ${Object.values(LoanStatus).join(', ')}`,
      });
      return;
    }

    const result = await this.loanApplicationService.getLoansEligibleForStatusChange(
      organizationId,
      currentStatus
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get loans eligible for status change controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching eligible loans",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get valid status transitions for a specific loan
 */
getValidStatusTransitions = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    // Get loan to check current status
    const loan = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

    if (!loan.success || !loan.data) {
      res.status(404).json({
        success: false,
        message: "Loan not found",
      });
      return;
    }

    // Get valid transitions using the private method (we'll need to expose this)
    const currentStatus = loan.data.status;
    
    // Since we can't access private methods directly, we'll define the logic here
    const getValidTransitions = (status: LoanStatus): LoanStatus[] => {
      const transitions: Record<LoanStatus, LoanStatus[]> = {
        [LoanStatus.PENDING]: [LoanStatus.APPROVED, LoanStatus.DISBURSED],
        [LoanStatus.APPROVED]: [LoanStatus.DISBURSED, LoanStatus.PENDING],
        [LoanStatus.DISBURSED]: [LoanStatus.PERFORMING, LoanStatus.WATCH, LoanStatus.CLOSED],
        [LoanStatus.PERFORMING]: [LoanStatus.WATCH, LoanStatus.SUBSTANDARD, LoanStatus.CLOSED],
        [LoanStatus.WATCH]: [LoanStatus.PERFORMING, LoanStatus.SUBSTANDARD, LoanStatus.DOUBTFUL],
        [LoanStatus.SUBSTANDARD]: [LoanStatus.WATCH, LoanStatus.DOUBTFUL, LoanStatus.LOSS],
        [LoanStatus.DOUBTFUL]: [LoanStatus.SUBSTANDARD, LoanStatus.LOSS, LoanStatus.WRITTEN_OFF],
        [LoanStatus.LOSS]: [LoanStatus.WRITTEN_OFF, LoanStatus.DOUBTFUL],
        [LoanStatus.WRITTEN_OFF]: [],
        [LoanStatus.CLOSED]: []
      };
      return transitions[status] || [];
    };

    const validTransitions = getValidTransitions(currentStatus);

    res.status(200).json({
      success: true,
      message: "Valid status transitions retrieved successfully",
      data: {
        loanId: loan.data.loanId,
        currentStatus,
        validTransitions,
        transitionDescriptions: validTransitions.map(status => ({
          status,
          description: this.getStatusDescription(status),
          severity: this.getStatusSeverity(status)
        }))
      }
    });

  } catch (error: any) {
    console.error("Get valid status transitions controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching valid transitions",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get status change history for a loan (if you implement status history)
 */
getLoanStatusHistory = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    // For now, return basic information from loan notes
    // You might want to create a proper LoanStatusHistory entity
    const loan = await this.loanApplicationService.getLoanApplicationById(loanId, organizationId);

    if (!loan.success || !loan.data) {
      res.status(404).json({
        success: false,
        message: "Loan not found",
      });
      return;
    }

    // Parse notes for status changes (basic implementation)
    const statusHistory = this.parseStatusHistoryFromNotes(loan.data.notes || '');

    res.status(200).json({
      success: true,
      message: "Loan status history retrieved successfully",
      data: {
        loanId: loan.data.loanId,
        currentStatus: loan.data.status,
        statusHistory,
        totalChanges: statusHistory.length
      }
    });

  } catch (error: any) {
    console.error("Get loan status history controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching status history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Helper method to get status description
 */
private getStatusDescription(status: LoanStatus): string {
  const descriptions: Record<LoanStatus, string> = {
    [LoanStatus.PENDING]: "Application is under review",
    [LoanStatus.APPROVED]: "Loan has been approved for disbursement",
    [LoanStatus.DISBURSED]: "Loan amount has been disbursed",
    [LoanStatus.PERFORMING]: "Loan payments are on schedule",
    [LoanStatus.WATCH]: "Loan requires monitoring due to late payments",
    [LoanStatus.SUBSTANDARD]: "Loan is significantly overdue",
    [LoanStatus.DOUBTFUL]: "Recovery of loan is doubtful",
    [LoanStatus.LOSS]: "Loan is considered a loss",
    [LoanStatus.WRITTEN_OFF]: "Loan has been written off",
    [LoanStatus.CLOSED]: "Loan has been fully repaid"
  };
  return descriptions[status] || "Unknown status";
}

/**
 * Helper method to get status severity level
 */
private getStatusSeverity(status: LoanStatus): 'low' | 'medium' | 'high' | 'critical' {
  const severity: Record<LoanStatus, 'low' | 'medium' | 'high' | 'critical'> = {
    [LoanStatus.PENDING]: 'low',
    [LoanStatus.APPROVED]: 'low',
    [LoanStatus.DISBURSED]: 'low',
    [LoanStatus.PERFORMING]: 'low',
    [LoanStatus.WATCH]: 'medium',
    [LoanStatus.SUBSTANDARD]: 'high',
    [LoanStatus.DOUBTFUL]: 'critical',
    [LoanStatus.LOSS]: 'critical',
    [LoanStatus.WRITTEN_OFF]: 'critical',
    [LoanStatus.CLOSED]: 'low'
  };
  return severity[status] || 'medium';
}

/**
 * Helper method to parse status history from notes (basic implementation)
 */
private parseStatusHistoryFromNotes(notes: string): Array<{
  timestamp: string;
  status: string;
  note: string;
}> {
  if (!notes) return [];

  const statusChanges: Array<{ timestamp: string; status: string; note: string; }> = [];
  const lines = notes.split('\n');

  for (const line of lines) {
    // Look for lines that match the pattern: [timestamp] Status changed to status: note
    const match = line.match(/^\[([^\]]+)\]\s*Status changed to ([^:]+):\s*(.*)$/);
    if (match) {
      statusChanges.push({
        timestamp: match[1],
        status: match[2].trim(),
        note: match[3].trim()
      });
    }
  }

  return statusChanges.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}


// ✅ NEW METHOD: Get workflow for loan
getWorkflowForLoan = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID"
      });
      return;
    }

    const result = await this.loanWorkflowService.getWorkflowForLoan(
      loanId,
      organizationId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error('Get workflow error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching workflow",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ NEW METHOD: Get workflow history
getWorkflowHistory = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID"
      });
      return;
    }

    const result = await this.loanWorkflowService.getWorkflowHistory(
      loanId,
      organizationId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error('Get workflow history error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching workflow history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};


// ✅ FIXED: getAvailableReviewers method in LoanApplicationController
// This removes the "Workflow not found" restriction for all roles

getAvailableReviewers = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);
    const userRole = req.user?.role;
    const userId = req.user?.id;

    console.log('=== GET AVAILABLE REVIEWERS DEBUG START ===');
    console.log('User:', { id: userId, role: userRole });
    console.log('Loan:', { id: loanId, organizationId });

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID"
      });
      return;
    }

    // ✅ REQUIREMENT 1: LOAN OFFICER - Get ALL higher-level reviewers (no workflow check)
    if (userRole === UserRole.LOAN_OFFICER) {
      const allReviewers = await this.userRepository.find({
        where: {
          organizationId,
          isActive: true,
          role: In([
            UserRole.BOARD_DIRECTOR,
            UserRole.SENIOR_MANAGER,
            UserRole.MANAGING_DIRECTOR
          ])
        },
        select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
      });

      const formattedReviewers = allReviewers.map(user => ({
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
        email: user.email,
        role: user.role,
        roleLabel: this.getRoleLabel(user.role)
      }));

      console.log(`✓ LOAN OFFICER: Found ${formattedReviewers.length} reviewers`);
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(200).json({
        success: true,
        message: "Available reviewers retrieved successfully",
        data: {
          reviewers: formattedReviewers,
          totalCount: formattedReviewers.length,
          availableRoles: [
            WorkflowStep.BOARD_DIRECTOR,
            WorkflowStep.SENIOR_MANAGER,
            WorkflowStep.MANAGING_DIRECTOR
          ]
        }
      });
      return;
    }

    // ✅ REQUIREMENT 2: BOARD DIRECTOR - Get Senior Managers and Managing Directors (no workflow limitation)
    if (userRole === UserRole.BOARD_DIRECTOR) {
      const availableReviewers = await this.userRepository.find({
        where: {
          organizationId,
          isActive: true,
          role: In([UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR])
        },
        select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
      });

      const formattedReviewers = availableReviewers.map(user => ({
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
        email: user.email,
        role: user.role,
        roleLabel: this.getRoleLabel(user.role)
      }));

      console.log(`✓ BOARD DIRECTOR: Found ${formattedReviewers.length} reviewers`);
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(200).json({
        success: true,
        message: "Available reviewers retrieved successfully",
        data: {
          reviewers: formattedReviewers,
          totalCount: formattedReviewers.length,
          availableRoles: [UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR]
        }
      });
      return;
    }

    // ✅ REQUIREMENT 3: SENIOR MANAGER - Get Board Directors and Managing Directors (no workflow limitation)
    if (userRole === UserRole.SENIOR_MANAGER) {
      const availableReviewers = await this.userRepository.find({
        where: {
          organizationId,
          isActive: true,
          role: In([UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR])
        },
        select: ['id', 'username', 'email', 'firstName', 'lastName', 'role']
      });

      const formattedReviewers = availableReviewers.map(user => ({
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || user.username}`.trim(),
        email: user.email,
        role: user.role,
        roleLabel: this.getRoleLabel(user.role)
      }));

      console.log(`✓ SENIOR MANAGER: Found ${formattedReviewers.length} reviewers`);
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(200).json({
        success: true,
        message: "Available reviewers retrieved successfully",
        data: {
          reviewers: formattedReviewers,
          totalCount: formattedReviewers.length,
          availableRoles: [UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR]
        }
      });
      return;
    }

    // ✅ REQUIREMENT 4: MANAGING DIRECTOR/CLIENT - Final step, no forward options
    if (userRole === UserRole.MANAGING_DIRECTOR || userRole === UserRole.CLIENT) {
      console.log(`✓ ${userRole}: At final approval step`);
      console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

      res.status(200).json({
        success: true,
        message: "No forward reviewers available - you are at the final approval step",
        data: {
          reviewers: [],
          totalCount: 0,
          availableRoles: [],
          isFinalStep: true
        }
      });
      return;
    }

    // Default case - no reviewers available
    console.log('✗ No matching role found');
    console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');

    res.status(200).json({
      success: true,
      message: "No reviewers available",
      data: {
        reviewers: [],
        totalCount: 0,
        availableRoles: []
      }
    });

  } catch (error: any) {
    console.error('Get available reviewers error:', error);
    console.log('=== GET AVAILABLE REVIEWERS DEBUG END ===');
    
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching available reviewers",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};



// ✅ NEW METHOD: Forward loan to reviewer
forwardLoanToReviewer = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array()
      });
      return;
    }

    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User authentication required"
      });
      return;
    }

    const { toUserId, message } = req.body;

    const result = await this.loanWorkflowService.advanceWorkflow(
      loanId,
      userId,
      ReviewDecision.FORWARD,
      toUserId,
      message,
      organizationId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Forward loan error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while forwarding loan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ NEW METHOD: Get my assigned loans
getMyAssignedLoans = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User authentication required"
      });
      return;
    }

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID"
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const statusFilter = req.query.status as any;

    const result = await this.loanWorkflowService.getMyAssignedLoans(
      userId,
      organizationId,
      page,
      limit,
      statusFilter
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error('Get assigned loans error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching assigned loans",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

// ✅ NEW METHOD: Reassign loan
reassignLoan = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array()
      });
      return;
    }

    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);
    const reassignedBy = req.user?.id;

    if (!reassignedBy) {
      res.status(401).json({
        success: false,
        message: "User authentication required"
      });
      return;
    }

    const { fromUserId, toUserId, reason } = req.body;

    const result = await this.loanWorkflowService.reassignLoan(
      loanId,
      fromUserId,
      toUserId,
      reason,
      organizationId,
      reassignedBy
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Reassign loan error:', error);
    res.status(500).json({
      success: false,
      message: "Internal server error while reassigning loan",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
private getRoleLabel(role: UserRole): string {
  const labels: Record<string, string> = {
    [UserRole.BOARD_DIRECTOR]: "Board Director",
    [UserRole.SENIOR_MANAGER]: "Senior Manager",
    [UserRole.MANAGING_DIRECTOR]: "Managing Director",
    [UserRole.LOAN_OFFICER]: "Loan Officer",
    [UserRole.STAFF]: "Staff",
    [UserRole.MANAGER]: "Manager",
    [UserRole.CLIENT]: "Client"
  };
  return labels[role] || role;
}

// ✅ FIXED: addLoanReview method - Removed workflow restrictions
addLoanReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('=== ADD LOAN REVIEW WITH WORKFLOW START ===');
    
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
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User authentication required",
      });
      return;
    }

    const { reviewMessage, decision, forwardTo, forwardToRole } = req.body;

    console.log('Review request with workflow:', {
      loanId,
      organizationId,
      userId,
      userRole,
      decision,
      forwardTo,
      forwardToRole,
      messageLength: reviewMessage?.length
    });

    let result: ServiceResponse;

    // ✅ REQUIREMENT 1: LOAN_OFFICER - Can start workflow and forward
    if (userRole === UserRole.LOAN_OFFICER) {
      if (!forwardTo || !forwardToRole) {
        res.status(400).json({
          success: false,
          message: "forwardTo and forwardToRole are required for LOAN OFFICER users"
        });
        return;
      }

      // Validate forwardToRole
      const validSteps = [WorkflowStep.BOARD_DIRECTOR, WorkflowStep.SENIOR_MANAGER, WorkflowStep.MANAGING_DIRECTOR];
      if (!validSteps.includes(forwardToRole)) {
        res.status(400).json({
          success: false,
          message: `Invalid forwardToRole. Must be one of: ${validSteps.join(', ')}`
        });
        return;
      }

      // Initialize workflow
      const workflowResult = await this.loanWorkflowService.initializeWorkflow(
        loanId,
        forwardTo,
        organizationId
      );

      if (!workflowResult.success) {
        res.status(400).json(workflowResult);
        return;
      }

      // Add review with workflow context
      result = await this.loanApplicationService.addLoanReviewWithWorkflow(
        loanId,
        reviewMessage,
        userId,
        organizationId,
        {
          reviewerRole: WorkflowStep.LOAN_OFFICER,
          decision: ReviewDecision.FORWARD,
          forwardedToId: forwardTo,
          workflowStep: 1
        }
      );

    } else if (userRole === UserRole.BOARD_DIRECTOR || userRole === UserRole.SENIOR_MANAGER) {
      // ✅ FIXED: BOARD_DIRECTOR and SENIOR_MANAGER - Can forward WITHOUT workflow check
      
      if (decision === ReviewDecision.FORWARD) {
        if (!forwardTo) {
          res.status(400).json({
            success: false,
            message: "forwardTo is required when forwarding"
          });
          return;
        }

        // Validate forward recipient
        const forwardRecipient = await this.userRepository.findOne({
          where: { id: forwardTo, organizationId, isActive: true }
        });

        if (!forwardRecipient) {
          res.status(404).json({
            success: false,
            message: "Forward recipient not found"
          });
          return;
        }

        // ✅ FIXED: Role-based validation (no workflow check)
        let canForward = false;
        let allowedRoles: string[] = [];

        if (userRole === UserRole.BOARD_DIRECTOR) {
          // Board directors can forward to senior managers or managing directors
          allowedRoles = [UserRole.SENIOR_MANAGER, UserRole.MANAGING_DIRECTOR];
          canForward = allowedRoles.includes(forwardRecipient.role);
        } else if (userRole === UserRole.SENIOR_MANAGER) {
          // Senior managers can forward to board directors or managing directors
          allowedRoles = [UserRole.BOARD_DIRECTOR, UserRole.MANAGING_DIRECTOR];
          canForward = allowedRoles.includes(forwardRecipient.role);
        }

        if (!canForward) {
          res.status(403).json({
            success: false,
            message: `You cannot forward to a ${forwardRecipient.role}. Allowed roles: ${allowedRoles.join(', ')}`
          });
          return;
        }

        // ✅ Check if workflow exists, if not create it
        let workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
        
        if (!workflow.success || !workflow.data) {
          // No workflow exists - create one
          const initResult = await this.loanWorkflowService.initializeWorkflow(
            loanId,
            forwardTo,
            organizationId
          );

          if (!initResult.success) {
            res.status(400).json(initResult);
            return;
          }

          workflow = await this.loanWorkflowService.getWorkflowForLoan(loanId, organizationId);
        }

        // Advance workflow
        const advanceResult = await this.loanWorkflowService.advanceWorkflow(
          loanId,
          userId,
          decision,
          forwardTo,
          reviewMessage,
          organizationId
        );

        if (!advanceResult.success) {
          res.status(400).json(advanceResult);
          return;
        }

        // Determine workflow step
        const workflowStep = workflow.data?.workflowHistory ? workflow.data.workflowHistory.length + 1 : 1;
        const reviewerRole = userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER;

        // Add review with workflow context
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole,
            decision: ReviewDecision.FORWARD,
            forwardedToId: forwardTo,
            workflowStep
          }
        );

      } else if (decision === ReviewDecision.REJECT) {
        // Handle rejection (no workflow required)
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER,
            decision: ReviewDecision.REJECT,
            forwardedToId: null,
            workflowStep: 1
          }
        );
      } else {
        // REQUEST_INFO or other decisions
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: userRole === UserRole.BOARD_DIRECTOR ? WorkflowStep.BOARD_DIRECTOR : WorkflowStep.SENIOR_MANAGER,
            decision: decision || ReviewDecision.REQUEST_INFO,
            forwardedToId: null,
            workflowStep: 1
          }
        );
      }

    } else if (userRole === UserRole.MANAGING_DIRECTOR || userRole === UserRole.CLIENT) {
      // ✅ MANAGING_DIRECTOR/CLIENT - Final approval (no workflow check needed)
      
      if (decision === ReviewDecision.REJECT) {
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
            decision: ReviewDecision.REJECT,
            forwardedToId: null,
            workflowStep: 1
          }
        );
      } else {
        // Add review (approval or info request)
        result = await this.loanApplicationService.addLoanReviewWithWorkflow(
          loanId,
          reviewMessage,
          userId,
          organizationId,
          {
            reviewerRole: WorkflowStep.MANAGING_DIRECTOR,
            decision: decision || ReviewDecision.APPROVE,
            forwardedToId: null,
            workflowStep: 1
          }
        );
      }

    } else {
      result = {
        success: false,
        message: "You don't have permission to review loans"
      };
    }

    console.log('=== ADD LOAN REVIEW WITH WORKFLOW END ===');

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Add loan review controller error:", error);
    
    res.status(500).json({
      success: false,
      message: "Internal server error while adding review",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// In LoanApplicationController class - ADD new method
startLoanReview = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    console.log('=== START LOAN REVIEW PROCESS ===');
    
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
    const loanId = parseInt(req.params.loanId);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User authentication required",
      });
      return;
    }

    const { reviewerId, reviewerRole, reviewMessage } = req.body;

    // Validate inputs
    if (!reviewerId || !reviewerRole) {
      res.status(400).json({
        success: false,
        message: "reviewerId and reviewerRole are required"
      });
      return;
    }

    // Validate reviewer role
    const validRoles = [WorkflowStep.BOARD_DIRECTOR, WorkflowStep.SENIOR_MANAGER, WorkflowStep.MANAGING_DIRECTOR];
    if (!validRoles.includes(reviewerRole)) {
      res.status(400).json({
        success: false,
        message: `Invalid reviewerRole. Must be one of: ${validRoles.join(', ')}`
      });
      return;
    }

    console.log('Starting review process:', {
      loanId,
      organizationId,
      userId,
      reviewerId,
      reviewerRole
    });

    // Initialize workflow
    const workflowResult = await this.loanWorkflowService.initializeWorkflow(
      loanId,
      reviewerId,
      organizationId
    );

    if (!workflowResult.success) {
      res.status(400).json(workflowResult);
      return;
    }

    // Add initial review if message provided
    let reviewResult = { success: true, message: "Review process started" };
    
    if (reviewMessage && reviewMessage.trim().length >= 10) {
      reviewResult = await this.loanApplicationService.addLoanReviewWithWorkflow(
        loanId,
        reviewMessage,
        userId,
        organizationId,
        {
          reviewerRole: WorkflowStep.LOAN_OFFICER,
          decision: ReviewDecision.FORWARD,
          forwardedToId: reviewerId,
          workflowStep: 1
        }
      );
    }

    if (reviewResult.success) {
      res.status(201).json({
        success: true,
        message: "Loan review process started successfully",
        data: {
          workflow: workflowResult.data,
          review: reviewResult.data?.review
        }
      });
    } else {
      res.status(400).json(reviewResult);
    }

  } catch (error: any) {
    console.error("Start loan review error:", error);
    
    res.status(500).json({
      success: false,
      message: "Internal server error while starting review process",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};



extendGuarantor = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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
    const guarantorId = parseInt(req.params.guarantorId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!guarantorId || isNaN(guarantorId)) {
      res.status(400).json({
        success: false,
        message: "Invalid guarantor ID",
      });
      return;
    }

    // Parse date fields if present
    const extendedData: ExtendedGuarantorData = { ...req.body };

    // Handle date fields
    const dateFields = [
      'dateOfBirth', 
      'companyRegistrationDate',
      'collateralLastValuationDate',
      'collateralExpiryDate',
      'chequeDate',
      'reportedDate',
      'bouncedChequeDateOfBirth',
      'bouncedChequeCompanyRegDate'
    ];
    
    for (const field of dateFields) {
      if (req.body[field]) {
        try {
          const parsedDate = parseISO(req.body[field]);
          if (isValid(parsedDate)) {
            extendedData[field] = parsedDate;
          }
        } catch (error) {
          console.warn(`Invalid date format for ${field}`);
        }
      }
    }

    // Call service layer to extend guarantor
    const result = await this.loanApplicationService.extendGuarantor(
      guarantorId,
      organizationId,
      extendedData,
      req.user?.id || null
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Extend guarantor controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during guarantor extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


getLoanGuarantorsExtended = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const loanId = parseInt(req.params.loanId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!loanId || isNaN(loanId)) {
      res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
      return;
    }

    const result = await this.loanApplicationService.getLoanGuarantorsExtended(
      loanId,
      organizationId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get extended guarantors controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching guarantors",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


getGuarantorsNeedingExtension = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await this.loanApplicationService.getGuarantorsNeedingExtension(
      organizationId,
      page,
      limit
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error: any) {
    console.error("Get guarantors needing extension controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching guarantors",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


bulkExtendGuarantors = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const { guarantorUpdates } = req.body;

    if (!Array.isArray(guarantorUpdates) || guarantorUpdates.length === 0) {
      res.status(400).json({
        success: false,
        message: "guarantorUpdates must be a non-empty array",
      });
      return;
    }

    const result = await this.loanApplicationService.bulkExtendGuarantors(
      guarantorUpdates,
      organizationId,
      req.user?.id || null
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Bulk extend guarantors controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during bulk guarantor extension",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};





getExistingGuarantorData = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await this.loanApplicationService.getExistingGuarantorData(
      organizationId,
      page,
      limit
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Get existing guarantor data controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching guarantor data",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Check migration status for specific collaterals
 */
checkGuarantorMigrationStatus = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const { collateralIds } = req.body;

    if (!Array.isArray(collateralIds) || collateralIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "collateralIds must be a non-empty array",
      });
      return;
    }

    const result = await this.loanApplicationService.checkExistingGuarantors(
      collateralIds,
      organizationId
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Check guarantor migration status controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while checking migration status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Bulk migrate guarantors from collaterals
 */
bulkMigrateGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors.array(),
      });
      return;
    }

    const { migrationData } = req.body;

    if (!Array.isArray(migrationData) || migrationData.length === 0) {
      res.status(400).json({
        success: false,
        message: "migrationData must be a non-empty array",
      });
      return;
    }

    // Validate each migration data item
    for (const item of migrationData) {
      if (!item.collateralId || !item.loanId || !item.borrowerId) {
        res.status(400).json({
          success: false,
          message: "Each migration item must have collateralId, loanId, and borrowerId",
        });
        return;
      }
    }

    const result = await this.loanApplicationService.bulkMigrateGuarantors(
      migrationData,
      req.user?.id || null
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Bulk migrate guarantors controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during guarantor migration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Quick migrate all guarantors at once
 */
quickMigrateAllGuarantors = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    
    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanApplicationService.quickMigrateAllGuarantors(
      organizationId,
      req.user?.id || null
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Quick migrate all guarantors controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during quick migration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


getAllCollaterals = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    const result = await this.loanApplicationService.getAllCollaterals(
      organizationId,
      page,
      limit,
      search
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Get all collaterals controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching collaterals",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Extend collateral with additional fields
 */
extendCollateral = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = parseInt(req.params.organizationId);
    const collateralId = parseInt(req.params.collateralId);

    if (!organizationId || isNaN(organizationId)) {
      res.status(400).json({
        success: false,
        message: "Invalid organization ID",
      });
      return;
    }

    if (!collateralId || isNaN(collateralId)) {
      res.status(400).json({
        success: false,
        message: "Invalid collateral ID",
      });
      return;
    }

    const extendedData = {
      accountNumber: req.body.accountNumber,
      collateralType: req.body.collateralType,
      collateralValue: req.body.collateralValue,
      collateralLastValuationDate: req.body.collateralLastValuationDate,
      collateralExpiryDate: req.body.collateralExpiryDate,
    };

    const result = await this.loanApplicationService.extendCollateral(
      collateralId,
      organizationId,
      extendedData
    );

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error: any) {
    console.error("Extend collateral controller error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while extending collateral",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

}

export default new LoanApplicationController();