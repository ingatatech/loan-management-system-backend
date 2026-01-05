// @ts-nocheck
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
   * ✅ ENHANCED: Get client accounts with FULL INFORMATION using proper TypeORM relationships
   * Returns complete client account details including:
   * - All loans attached to the account (via OneToMany relationship)
   * - Borrower profile information
   * - Guarantor information for each loan
   * - Collateral information for each loan
   * - Shareholder/Board member information
   * - Analysis reports
   */
  async getClientAccounts(
    organizationId: number,
    search?: string,
    page: number = 1,
    limit: number = 10
  ): Promise<ServiceResponse> {
    try {
      const skip = (page - 1) * limit;

      // ✅ BUILD QUERY with ALL necessary relationships
      const queryBuilder = this.clientAccountRepository
        .createQueryBuilder('account')
        // ✅ Load primary loan (backward compatibility)
        .leftJoinAndSelect('account.loan', 'primaryLoan')
        .leftJoinAndSelect('primaryLoan.borrower', 'primaryLoanBorrower')
        .leftJoinAndSelect('primaryLoan.analysisReports', 'primaryLoanAnalysisReports')
        .leftJoinAndSelect('primaryLoan.collaterals', 'primaryLoanCollaterals')
        .leftJoinAndSelect('primaryLoanCollaterals.guarantors', 'primaryLoanGuarantors')
        
        // ✅ CRITICAL: Load ALL loans attached to this account (OneToMany relationship)
        .leftJoinAndSelect('account.loans', 'allLoans')
        .leftJoinAndSelect('allLoans.borrower', 'allLoansBorrower')
        .leftJoinAndSelect('allLoans.analysisReports', 'allLoansAnalysisReports')
        .leftJoinAndSelect('allLoansAnalysisReports.loanOfficer', 'reportLoanOfficer')
        .leftJoinAndSelect('allLoansAnalysisReports.managingDirector', 'reportManagingDirector')
        .leftJoinAndSelect('allLoansAnalysisReports.creator', 'reportCreator')
        
        // ✅ Load collaterals for all loans
        .leftJoinAndSelect('allLoans.collaterals', 'allLoansCollaterals')
        
        // ✅ Load guarantors for all collaterals
        .leftJoinAndSelect('allLoansCollaterals.guarantors', 'allLoansGuarantors')
        .leftJoinAndSelect('allLoansGuarantors.borrower', 'guarantorBorrower')
        
        // ✅ Load repayment schedules
        .leftJoinAndSelect('allLoans.repaymentSchedules', 'repaymentSchedules')
        
        // ✅ Load transactions
        .leftJoinAndSelect('allLoans.transactions', 'transactions')
        
        // ✅ Load borrower reference
        .leftJoinAndSelect('account.borrower', 'accountBorrower')
        .leftJoinAndSelect('account.organization', 'organization')
        
        .where('account.organizationId = :organizationId', { organizationId })
        .andWhere('account.isActive = :isActive', { isActive: true });

      // ✅ Search functionality
      if (search) {
        queryBuilder.andWhere(
          '(account.accountNumber ILIKE :search OR ' +
          'account.borrowerNames ILIKE :search OR ' +
          'account.institutionName ILIKE :search OR ' +
          'primaryLoan.loanId ILIKE :search OR ' +
          'allLoans.loanId ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      const [accounts, totalItems] = await queryBuilder
        .orderBy('account.createdAt', 'DESC')
        .addOrderBy('allLoans.createdAt', 'DESC') // Order loans by creation date
        .skip(skip)
        .take(limit)
        .getManyAndCount();

      const totalPages = Math.ceil(totalItems / limit);

      // ✅ ENHANCE accounts with complete information
      const enhancedAccounts = accounts.map(account => {
        // Get all loans for this account
        const allAccountLoans = account.loans || [];
        
        // ✅ Build comprehensive loan information for each loan
        const loansWithFullInfo = allAccountLoans.map(loan => {
          // Analysis reports for this specific loan
          const analysisReports = loan.analysisReports || [];
          const approvedReports = analysisReports.filter(
            report => report.reportType === 'approve' && report.isFinalized
          );
          const rejectedReports = analysisReports.filter(
            report => report.reportType === 'reject' && report.isFinalized
          );

          // Collateral information
          const collaterals = loan.collaterals || [];
          const collateralSummary = {
            totalCollaterals: collaterals.length,
            totalValue: collaterals.reduce((sum, c) => sum + (c.collateralValue || 0), 0),
            collateralDetails: collaterals.map(collateral => ({
              id: collateral.id,
              collateralId: collateral.collateralId,
              type: collateral.collateralType,
              description: collateral.description,
              value: collateral.collateralValue,
              effectiveValue: collateral.effectiveValue,
              guarantors: (collateral.guarantors || []).map(guarantor => ({
                id: guarantor.id,
                name: guarantor.name,
                fullName: guarantor.getFullName(),
                phone: guarantor.phone,
                email: guarantor.email,
                guaranteedAmount: guarantor.guaranteedAmount,
                guarantorType: guarantor.guarantorType,
                nationalId: guarantor.nationalId,
                address: guarantor.address,
                isActive: guarantor.isActive
              }))
            }))
          };

          // Guarantor summary across all collaterals
          const allGuarantors = collaterals.flatMap(c => c.guarantors || []);
          const guarantorSummary = {
            totalGuarantors: allGuarantors.length,
            totalGuaranteedAmount: allGuarantors.reduce(
              (sum, g) => sum + (g.guaranteedAmount || 0), 
              0
            ),
            guarantorDetails: allGuarantors.map(guarantor => ({
              id: guarantor.id,
              name: guarantor.name,
              fullName: guarantor.getFullName(),
              phone: guarantor.phone,
              email: guarantor.email,
              guaranteedAmount: guarantor.guaranteedAmount,
              guarantorType: guarantor.guarantorType,
              nationalId: guarantor.nationalId,
              isActive: guarantor.isActive
            }))
          };

          // Shareholder/Board member information (for institutions)
          const shareholderBoardMembers = loan.shareholderBoardMembers || [];
          const shareholderSummary = {
            totalMembers: shareholderBoardMembers.length,
            shareholders: shareholderBoardMembers.filter(m => m.type === 'shareholder'),
            boardMembers: shareholderBoardMembers.filter(m => m.type === 'board_member'),
            membersAsGuarantors: shareholderBoardMembers.filter(m => m.isAlsoGuarantor)
          };

          // Repayment schedule summary
          const schedules = loan.repaymentSchedules || [];
          const scheduleSummary = {
            totalSchedules: schedules.length,
            paidSchedules: schedules.filter(s => s.isPaid).length,
            pendingSchedules: schedules.filter(s => !s.isPaid).length,
            totalDue: schedules.reduce((sum, s) => sum + (s.dueTotal || 0), 0),
            totalPaid: schedules.reduce((sum, s) => sum + (s.paidTotal || 0), 0)
          };

          // Transaction summary
          const transactions = loan.transactions || [];
          const transactionSummary = {
            totalTransactions: transactions.length,
            totalAmount: transactions.reduce((sum, t) => sum + (t.amountPaid || 0), 0),
            totalPrincipal: transactions.reduce((sum, t) => sum + (t.principalPaid || 0), 0),
            totalInterest: transactions.reduce((sum, t) => sum + (t.interestPaid || 0), 0)
          };

          return {
            ...loan,
            // Analysis report information
            analysisReportSummary: {
              totalReports: analysisReports.length,
              hasApprovedReport: approvedReports.length > 0,
              hasRejectedReport: rejectedReports.length > 0,
              approvedReports,
              rejectedReports,
              latestReport: analysisReports.sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )[0] || null
            },
            // Collateral information
            collateralSummary,
            // Guarantor information
            guarantorSummary,
            // Shareholder/Board member information
            shareholderSummary,
            // Repayment information
            scheduleSummary,
            // Transaction information
            transactionSummary,
            // Financial summary
            financialSummary: {
              disbursedAmount: loan.disbursedAmount,
              outstandingPrincipal: loan.outstandingPrincipal,
              accruedInterest: loan.accruedInterestToDate,
              totalDue: loan.totalAmountToBeRepaid,
              monthlyInstallment: loan.monthlyInstallmentAmount
            }
          };
        });

        // ✅ Account-level summary across ALL loans
        const accountSummary = {
          totalLoans: allAccountLoans.length,
          activeLoans: allAccountLoans.filter(l => 
            [LoanStatus.DISBURSED, LoanStatus.PERFORMING].includes(l.status)
          ).length,
          completedLoans: allAccountLoans.filter(l => 
            l.status === LoanStatus.CLOSED || l.status === LoanStatus.COMPLETED
          ).length,
          totalDisbursed: allAccountLoans.reduce((sum, l) => 
            sum + (l.disbursedAmount || 0), 0
          ),
          totalOutstanding: allAccountLoans.reduce((sum, l) => 
            sum + (l.outstandingPrincipal || 0), 0
          ),
          loanIds: allAccountLoans.map(l => l.loanId)
        };

        return {
          ...account,
          // ✅ ALL loans attached to this account (primary + additional)
          loansWithFullInfo,
          // ✅ Account-level summary
          accountSummary,
          // ✅ BACKWARD COMPATIBILITY: Keep original loan reference
          analysisReportSummary: account.loan?.analysisReports ? {
            totalReports: account.loan.analysisReports.length,
            hasApprovedReport: account.loan.analysisReports.some(
              r => r.reportType === 'approve' && r.isFinalized
            ),
            hasRejectedReport: account.loan.analysisReports.some(
              r => r.reportType === 'reject' && r.isFinalized
            ),
            approvedReports: account.loan.analysisReports.filter(
              r => r.reportType === 'approve' && r.isFinalized
            ),
            rejectedReports: account.loan.analysisReports.filter(
              r => r.reportType === 'reject' && r.isFinalized
            )
          } : null
        };
      });

      return {
        success: true,
        message: "Client accounts with full information retrieved successfully",
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
   * ✅ ENHANCED: Get client account by identifier with full relationship data
   */
  async getClientAccountByIdentifier(
    identifier: string,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      // Try to find by account number first
      let clientAccount = await this.clientAccountRepository
        .createQueryBuilder('account')
        // Primary loan
        .leftJoinAndSelect('account.loan', 'primaryLoan')
        .leftJoinAndSelect('primaryLoan.borrower', 'primaryLoanBorrower')
        .leftJoinAndSelect('primaryLoan.analysisReports', 'primaryLoanAnalysisReports')
        
        // All loans
        .leftJoinAndSelect('account.loans', 'allLoans')
        .leftJoinAndSelect('allLoans.borrower', 'allLoansBorrower')
        .leftJoinAndSelect('allLoans.analysisReports', 'allLoansAnalysisReports')
        .leftJoinAndSelect('allLoans.collaterals', 'collaterals')
        .leftJoinAndSelect('collaterals.guarantors', 'guarantors')
        .leftJoinAndSelect('allLoans.repaymentSchedules', 'schedules')
        .leftJoinAndSelect('allLoans.transactions', 'transactions')
        
        // Account borrower
        .leftJoinAndSelect('account.borrower', 'borrower')
        
        .where('account.accountNumber = :identifier', { identifier })
        .andWhere('account.organizationId = :organizationId', { organizationId })
        .andWhere('account.isActive = :isActive', { isActive: true })
        .getOne();

      // If not found, try by loanId
      if (!clientAccount) {
        const loanIdNum = parseInt(identifier);
        if (!isNaN(loanIdNum)) {
          clientAccount = await this.clientAccountRepository
            .createQueryBuilder('account')
            .leftJoinAndSelect('account.loan', 'primaryLoan')
            .leftJoinAndSelect('account.loans', 'allLoans')
            .leftJoinAndSelect('allLoans.collaterals', 'collaterals')
            .leftJoinAndSelect('collaterals.guarantors', 'guarantors')
            .leftJoinAndSelect('account.borrower', 'borrower')
            .where('account.loanId = :loanId', { loanId: loanIdNum })
            .andWhere('account.organizationId = :organizationId', { organizationId })
            .andWhere('account.isActive = :isActive', { isActive: true })
            .getOne();
        }
      }

      if (!clientAccount) {
        return {
          success: false,
          message: "Client account not found"
        };
      }

      // Enhance with analysis reports (backward compatibility)
      const approvedReports = clientAccount.loan?.analysisReports?.filter(
        report => report.reportType === 'approve' && report.isFinalized
      ) || [];

      return {
        success: true,
        message: "Client account retrieved successfully",
        data: {
          ...clientAccount,
          analysisReportSummary: approvedReports[0]?.approvalConditions || null,
          analysisReports: approvedReports,
          // ✅ Include all loans summary
          loansSummary: {
            totalLoans: clientAccount.loans?.length || 0,
            loans: clientAccount.loans?.map(l => ({
              loanId: l.loanId,
              status: l.status,
              disbursedAmount: l.disbursedAmount,
              outstandingPrincipal: l.outstandingPrincipal
            })) || []
          }
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

  /**
   * Create Client Borrower Account (original functionality preserved)
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

      const approvedAnalysisReport = loan.analysisReports?.find(
        report => report.reportType === 'approve' && report.isFinalized
      );

      console.log('Approved analysis report found:', !!approvedAnalysisReport);

      const rejectedAnalysisReport = loan.analysisReports?.find(
        report => report.reportType === 'reject' && report.isFinalized
      );

      if (rejectedAnalysisReport) {
        throw new Error("Cannot create client account for loan with rejected analysis report");
      }

      console.log('✓ Found approved analysis report, proceeding...');

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

      const accountNumber = `ACC${Date.now()}${Math.floor(Math.random() * 1000)}`;
      console.log('Generated account number:', accountNumber);

      const clientAccountData: any = {
        accountNumber,
        loanId: loan.id,
        borrowerId: loan.borrowerId,
        borrowerType: loan.borrowerType,
        organizationId,
        createdBy
      };

      if (loan.borrowerType === BorrowerType.INDIVIDUAL) {
        console.log('Processing individual borrower...');
        const borrower = loan.borrower;
        clientAccountData.nationalId = borrower?.nationalId || null;
        clientAccountData.borrowerNames = data.borrowerNames || 
          `${borrower?.firstName || ''} ${borrower?.lastName || ''}`.trim();
        clientAccountData.profilePictureUrl = profilePictureUrl;
        
        clientAccountData.profileInformation = {
          dateOfBirth: borrower?.dateOfBirth,
          gender: borrower?.gender,
          phone: data.borrowerTelephone || borrower?.primaryPhone,
          email: borrower?.email,
          address: borrower?.address,
          maritalStatus: loan.maritalStatus,
          spouseInfo: loan.spouseInfo,
          incomeSources: loan.incomeSources,
          contactPersonName: data.contactPersonName,
          contactPersonPosition: data.contactPersonPosition,
          contactPersonPhone: data.contactPersonPhone,
          contactPersonEmail: data.contactPersonEmail
        };
      } else if (loan.borrowerType === BorrowerType.INSTITUTION) {
        console.log('Processing institution borrower...');
        const institutionProfile = loan.institutionProfile;
        clientAccountData.tinNumber = institutionProfile?.tinNumber || null;
        clientAccountData.businessNumber = institutionProfile?.licenseNumber || null;
        clientAccountData.institutionName = institutionProfile?.institutionName || null;
        
        clientAccountData.profileRepresentative = {
          name: data.contactPersonName || institutionProfile?.contactPerson || '',
          position: data.contactPersonPosition || '',
          phone: data.contactPersonPhone || institutionProfile?.contactPhone || '',
          email: data.contactPersonEmail || institutionProfile?.contactEmail || ''
        };
        
        clientAccountData.institutionInformation = {
          ...institutionProfile,
          shareholderBoardMembers: loan.shareholderBoardMembers,
          institutionRelevantDocuments: loan.institutionRelevantDocuments,
          contactPerson: data.contactPersonName,
          contactPhone: data.contactPersonPhone,
          contactEmail: data.contactPersonEmail
        };
      }

      console.log('Creating client account entity...');
      const clientAccount = queryRunner.manager.create(ClientBorrowerAccount, clientAccountData);
      const savedClientAccount = await queryRunner.manager.save(ClientBorrowerAccount, clientAccount);
      console.log('✓ Client account created:', savedClientAccount.accountNumber);

      await queryRunner.manager.update(Loan, data.loanId, { hasClientAccount: true });
      console.log('✓ Loan updated with hasClientAccount = true');

      await queryRunner.commitTransaction();
      console.log('=== CREATE CLIENT ACCOUNT COMPLETED SUCCESSFULLY ===');

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
      await queryRunner.release();
    }
  }
}

export default new ClientBorrowerAccountService();