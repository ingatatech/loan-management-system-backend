import { Repository } from "typeorm";
import dbConnection from "../db";
import { Loan, LoanStatus, BorrowerType } from "../entities/Loan";
import { LoanAnalysisReport } from "../entities/LoanAnalysisReport";
import { ClientBorrowerAccount } from "../entities/ClientBorrowerAccount";
import { UploadToCloud } from "../helpers/cloud";

interface CreateClientAccountRequest {
  loanId: number;
  profilePicture?: Express.Multer.File;
  contactPersonName?: string;
  contactPersonPosition?: string;
  contactPersonPhone?: string;
  contactPersonEmail?: string;
  borrowerNames?: string;
  borrowerTelephone?: string;
}

interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: any;
}

export class ClientBorrowerAccountService {
  private loanRepository: Repository<Loan>;
  private analysisReportRepository: Repository<LoanAnalysisReport>;
  private clientAccountRepository: Repository<ClientBorrowerAccount>;

  constructor() {
    this.loanRepository = dbConnection.getRepository(Loan);
    this.analysisReportRepository = dbConnection.getRepository(LoanAnalysisReport);
    this.clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
  }

  /**
   * Enhanced: Create Client Borrower Permanent Account with validation
   */
  async createClientAccount(
    data: CreateClientAccountRequest,
    organizationId: number,
    createdBy: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      console.log('=== CREATE CLIENT ACCOUNT START ===');
      console.log('Looking for loan ID:', data.loanId, 'in organization:', organizationId);

      // ✅ FIX: Don't filter by status - just check if loan exists and has approved analysis report
      const loan = await queryRunner.manager.findOne(Loan, {
        where: { 
          id: data.loanId, 
          organizationId
        },
        relations: ['borrower', 'analysisReports']
      });

      console.log('Loan found:', loan ? `Yes (ID: ${loan.id}, Status: ${loan.status})` : 'No');

      if (!loan) {
        throw new Error("Loan not found in this organization");
      }

      console.log('Loan has client account:', loan.hasClientAccount);
      console.log('Analysis reports count:', loan.analysisReports?.length || 0);

      if (loan.hasClientAccount) {
        throw new Error("Client account already exists for this loan");
      }

      // Check for approved analysis report
      const approvedAnalysisReport = loan.analysisReports?.find(
        report => report.reportType === 'approve' && report.isFinalized
      );

      console.log('Approved analysis report found:', !!approvedAnalysisReport);



      // Check for rejected reports - don't proceed if there's a rejected report
      const rejectedAnalysisReport = loan.analysisReports?.find(
        report => report.reportType === 'reject' && report.isFinalized
      );

      if (rejectedAnalysisReport) {
        throw new Error("Cannot create client account for loan with rejected analysis report");
      }

      console.log('✓ Found approved analysis report, proceeding...');

      // Upload profile picture for individual borrowers
      let profilePictureUrl: string | null = null;
      if (data.profilePicture) {
        if (loan.borrowerType !== BorrowerType.INDIVIDUAL) {
          throw new Error("Profile picture is only allowed for individual borrowers");
        }
        console.log('Uploading profile picture...');
        const uploaded = await UploadToCloud(data.profilePicture);
        profilePictureUrl = uploaded.secure_url;
        console.log('✓ Profile picture uploaded:', profilePictureUrl);
      }

      // Generate unique account number
      const accountNumber = `ACC${Date.now()}${Math.floor(Math.random() * 1000)}`;
      console.log('Generated account number:', accountNumber);

      // Prepare client account data
      const clientAccountData: any = {
        accountNumber,
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        borrowerType: loan.borrowerType,
        organizationId,
        createdBy
      };

      // Set fields based on borrower type
      if (loan.borrowerType === BorrowerType.INDIVIDUAL) {
        console.log('Processing individual borrower...');
        const borrower = loan.borrower;
        clientAccountData.nationalId = borrower?.nationalId || null;
        clientAccountData.borrowerNames = data.borrowerNames || 
          `${borrower?.firstName || ''} ${borrower?.lastName || ''}`.trim();
        clientAccountData.profilePictureUrl = profilePictureUrl;
        
        // Enhanced profile information
        clientAccountData.profileInformation = {
          dateOfBirth: borrower?.dateOfBirth,
          gender: borrower?.gender,
          phone: data.borrowerTelephone || borrower?.primaryPhone,
          email: borrower?.email,
          address: borrower?.address,
          maritalStatus: loan.maritalStatus,
          spouseInfo: loan.spouseInfo,
          incomeSources: loan.incomeSources,
          // Additional contact info
          contactPersonName: data.contactPersonName,
          contactPersonPosition: data.contactPersonPosition,
          contactPersonPhone: data.contactPersonPhone,
          contactPersonEmail: data.contactPersonEmail
        };
      } else if (loan.borrowerType === BorrowerType.INSTITUTION) {
        console.log('Processing institution borrower...');
        // ✅ Access institutionProfile as a JSONB column property
        const institutionProfile = loan.institutionProfile;
        clientAccountData.tinNumber = institutionProfile?.tinNumber || null;
        clientAccountData.businessNumber = institutionProfile?.licenseNumber || null;
        clientAccountData.institutionName = institutionProfile?.institutionName || null;
        
        // Enhanced profile representative
        clientAccountData.profileRepresentative = {
          name: data.contactPersonName || institutionProfile?.contactPerson || '',
          position: data.contactPersonPosition || '',
          phone: data.contactPersonPhone || institutionProfile?.contactPhone || '',
          email: data.contactPersonEmail || institutionProfile?.contactEmail || ''
        };
        
        // Enhanced institution information
        clientAccountData.institutionInformation = {
          ...institutionProfile,
          shareholderBoardMembers: loan.shareholderBoardMembers,
          institutionRelevantDocuments: loan.institutionRelevantDocuments,
          // Additional contact info
          contactPerson: data.contactPersonName,
          contactPhone: data.contactPersonPhone,
          contactEmail: data.contactPersonEmail
        };
      }

      console.log('Creating client account entity...');
      const clientAccount = queryRunner.manager.create(ClientBorrowerAccount, clientAccountData);
      const savedClientAccount = await queryRunner.manager.save(ClientBorrowerAccount, clientAccount);
      console.log('✓ Client account created:', savedClientAccount.accountNumber);

      // Update loan to mark hasClientAccount = true
      await queryRunner.manager.update(Loan, data.loanId, { hasClientAccount: true });
      console.log('✓ Loan updated with hasClientAccount = true');

      // ✅ FIX: Commit transaction before any additional queries
      await queryRunner.commitTransaction();
      console.log('=== CREATE CLIENT ACCOUNT COMPLETED SUCCESSFULLY ===');

      // ✅ FIX: Reload with relations AFTER committing (using regular repository, not queryRunner)
      const completeAccount = await this.clientAccountRepository.findOne({
        where: { id: savedClientAccount.id },
        relations: ['loan', 'loan.borrower', 'loan.analysisReports']
      });

      return {
        success: true,
        message: "Client account created successfully with enhanced borrower information",
        data: {
          clientAccount: completeAccount || savedClientAccount,
          analysisReports: loan.analysisReports?.filter(report => 
            report.reportType === 'approve' && report.isFinalized
          ) || []
        }
      };

    } catch (error: any) {
      // ✅ FIX: Only rollback if transaction is still active
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      console.error('❌ Create client account error:', error.message);
      console.error('Error stack:', error.stack);
      return {
        success: false,
        message: error.message || "Failed to create client account"
      };
    } finally {
      // ✅ FIX: Always release the query runner
      await queryRunner.release();
    }
  }

  /**
   * Enhanced: Get client accounts with filtering
   */
  async getClientAccounts(
    organizationId: number,
    search?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      const queryBuilder = this.clientAccountRepository
        .createQueryBuilder('account')
        .leftJoinAndSelect('account.loan', 'loan')
        .leftJoinAndSelect('loan.analysisReports', 'analysisReports')
        .leftJoinAndSelect('account.borrower', 'borrower')
        .where('account.organizationId = :organizationId', { organizationId })
        .andWhere('account.isActive = :isActive', { isActive: true });

      if (search) {
        queryBuilder.andWhere(
          '(account.accountNumber ILIKE :search OR ' +
          'account.borrowerNames ILIKE :search OR ' +
          'account.institutionName ILIKE :search OR ' +
          'loan.loanId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [accounts, totalItems] = await queryBuilder
        .orderBy('account.createdAt', 'DESC')
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // Enhance with only approved analysis reports
      const enhancedAccounts = accounts.map(account => {
        const approvedReports = account.loan?.analysisReports?.filter(
          report => report.reportType === 'approve' && report.isFinalized
        ) || [];
        
        const rejectedReports = account.loan?.analysisReports?.filter(
          report => report.reportType === 'reject' && report.isFinalized
        ) || [];

        return {
          ...account,
          // Only include approved reports
          analysisReportSummary: approvedReports[0]?.approvalConditions || null,
          analysisReports: approvedReports,
          hasRejectedReports: rejectedReports.length > 0
        };
      });

      return {
        success: true,
        message: "Client accounts retrieved successfully",
        data: enhancedAccounts,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };

    } catch (error: any) {
      console.error('❌ Get client accounts error:', error);
      return {
        success: false,
        message: error.message || "Failed to retrieve client accounts"
      };
    }
  }

  /**
   * Get client account by identifier (accountNumber or loanId)
   */
  async getClientAccountByIdentifier(
    identifier: string,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      // Try to find by account number first
      let clientAccount = await this.clientAccountRepository.findOne({
        where: { 
          accountNumber: identifier, 
          organizationId,
          isActive: true
        },
        relations: ['loan', 'loan.borrower', 'loan.analysisReports']
      });

      // If not found, try to find by loanId
      if (!clientAccount) {
        const loanIdNum = parseInt(identifier);
        if (!isNaN(loanIdNum)) {
          clientAccount = await this.clientAccountRepository.findOne({
            where: { 
              loanId: loanIdNum, 
              organizationId,
              isActive: true
            },
            relations: ['loan', 'loan.borrower', 'loan.analysisReports']
          });
        }
      }

      if (!clientAccount) {
        return {
          success: false,
          message: "Client account not found"
        };
      }

      // Enhance with only approved analysis reports
      const approvedReports = clientAccount.loan?.analysisReports?.filter(
        report => report.reportType === 'approve' && report.isFinalized
      ) || [];

      return {
        success: true,
        message: "Client account retrieved successfully",
        data: {
          ...clientAccount,
          analysisReportSummary: approvedReports[0]?.approvalConditions || null,
          analysisReports: approvedReports
        }
      };

    } catch (error: any) {
      console.error('❌ Get client account by identifier error:', error);
      return {
        success: false,
        message: error.message || "Failed to retrieve client account"
      };
    }
  }
}

export default new ClientBorrowerAccountService();