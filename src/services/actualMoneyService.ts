import { Repository } from "typeorm";
import { Organization } from "../entities/Organization";
import { ShareCapital } from "../entities/ShareCapital";
import { OperationalFunds, FundStatus } from "../entities/OperationalFunds";
import { GrantedFunds, GrantStatus } from "../entities/GrantedFunds";
import { Loan, LoanStatus } from "../entities/Loan";
import { RepaymentTransaction } from "../entities/RepaymentTransaction";
import dbConnection from "../db";

export interface ActualMoneyCalculation {
  // INFLOWS (Money Available)
  totalShareCapital: number;
  totalOperationalFundsAvailable: number;
  totalGrantedFundsAvailable: number;
  totalLoanRepaymentsReceived: number;
  totalRetainedEarnings: number;
  
  // OUTFLOWS (Money Used)
  totalDisbursedLoans: number;
  totalOperationalExpenses: number;
  totalReservedFunds: number;
  totalProvisionsRequired: number;
  
  // CALCULATIONS
  totalInflows: number;
  totalOutflows: number;
  actualMoneyAvailable: number;
  maximumLendableAmount: number;
  
  // METADATA
  calculationDate: Date;
  organizationId: number;
  lendingCapacityPercentage: number;
  
  // DETAILED BREAKDOWN
  breakdown: {
    sources: {
      shareCapital: number;
      operationalFunds: number;
      grantedFunds: number;
      loanRepayments: number;
      retainedEarnings: number;
    };
    uses: {
      disbursedLoans: number;
      operationalExpenses: number;
      reservedFunds: number;
    };
    safetyBuffers: {
      provisionsRequired: number;
      minimumReserveRatio: number;
      minimumReserveAmount: number;
    };
  };
  
  warnings: string[];
  canLendNewLoans: boolean;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
}

export class ActualMoneyService {
  private shareCapitalRepo: Repository<ShareCapital>;
  private operationalFundsRepo: Repository<OperationalFunds>;
  private grantedFundsRepo: Repository<GrantedFunds>;
  private loanRepo: Repository<Loan>;
  private transactionRepo: Repository<RepaymentTransaction>;
  private organizationRepo: Repository<Organization>;

  constructor() {
    this.shareCapitalRepo = dbConnection.getRepository(ShareCapital);
    this.operationalFundsRepo = dbConnection.getRepository(OperationalFunds);
    this.grantedFundsRepo = dbConnection.getRepository(GrantedFunds);
    this.loanRepo = dbConnection.getRepository(Loan);
    this.transactionRepo = dbConnection.getRepository(RepaymentTransaction);
    this.organizationRepo = dbConnection.getRepository(Organization);
  }

  /**
   * Calculate actual money available in the banking system
   */
  async calculateActualMoney(organizationId: number): Promise<ServiceResponse<ActualMoneyCalculation>> {
    try {
      console.log('=== CALCULATING ACTUAL MONEY IN SYSTEM ===');
      console.log('Organization ID:', organizationId);

      // Verify organization exists
      const organization = await this.organizationRepo.findOne({
        where: { id: organizationId }
      });

      if (!organization) {
        return {
          success: false,
          message: "Organization not found"
        };
      }

      // ========================================
      // STEP 1: Calculate INFLOWS (Sources of Funds)
      // ========================================
      
      // 1.1 Total Share Capital
      const totalShareCapital = await this.calculateTotalShareCapital(organizationId);
      console.log('✓ Share Capital:', totalShareCapital);

      // 1.2 Available Operational Funds
      const totalOperationalFunds = await this.calculateAvailableOperationalFunds(organizationId);
      console.log('✓ Operational Funds Available:', totalOperationalFunds);

      // 1.3 Available Granted Funds
      const totalGrantedFunds = await this.calculateAvailableGrantedFunds(organizationId);
      console.log('✓ Granted Funds Available:', totalGrantedFunds);

      // 1.4 Total Loan Repayments Received
      const totalRepayments = await this.calculateTotalLoanRepayments(organizationId);
      console.log('✓ Loan Repayments Received:', totalRepayments);

      // 1.5 Retained Earnings (if tracked separately)
      const retainedEarnings = 0; // Can be extended later
      console.log('✓ Retained Earnings:', retainedEarnings);

      // ========================================
      // STEP 2: Calculate OUTFLOWS (Uses of Funds)
      // ========================================
      
      // 2.1 Total Disbursed Loans (Outstanding)
      const totalDisbursed = await this.calculateTotalDisbursedLoans(organizationId);
      console.log('✓ Total Disbursed Loans:', totalDisbursed);

      // 2.2 Total Operational Expenses
      const totalExpenses = await this.calculateOperationalExpenses(organizationId);
      console.log('✓ Operational Expenses:', totalExpenses);

      // 2.3 Reserved Funds (Frozen/Committed)
      const totalReserved = await this.calculateReservedFunds(organizationId);
      console.log('✓ Reserved Funds:', totalReserved);

      // ========================================
      // STEP 3: Calculate Safety Buffers
      // ========================================
      
      // 3.1 Required Provisions for Bad Loans
      const totalProvisions = await this.calculateRequiredProvisions(organizationId);
      console.log('✓ Provisions Required:', totalProvisions);

      // 3.2 Minimum Reserve Ratio (10-20% of total funds)
      const minimumReserveRatio = 0.10; // 10%
      const totalFunds = totalShareCapital + totalOperationalFunds + totalGrantedFunds + totalRepayments;
      const minimumReserveAmount = totalFunds * minimumReserveRatio;
      console.log('✓ Minimum Reserve Required:', minimumReserveAmount);

      // ========================================
      // STEP 4: Calculate Final Amounts
      // ========================================
      
      const totalInflows = totalShareCapital + totalOperationalFunds + totalGrantedFunds + totalRepayments + retainedEarnings;
      const totalOutflows = totalDisbursed + totalExpenses + totalReserved;
      
      // CRITICAL FORMULA: Actual Money Available
      const actualMoneyAvailable = totalInflows - totalOutflows;
      
      // CRITICAL FORMULA: Maximum Lendable Amount
      const maximumLendableAmount = Math.max(0, actualMoneyAvailable - totalProvisions - minimumReserveAmount);
      
      const lendingCapacityPercentage = totalInflows > 0 
        ? (maximumLendableAmount / totalInflows) * 100 
        : 0;

      // ========================================
      // STEP 5: Generate Warnings
      // ========================================
      
      const warnings: string[] = [];
      
      if (maximumLendableAmount <= 0) {
        warnings.push("🚨 CRITICAL: No lending capacity available. Cannot disburse new loans.");
      } else if (lendingCapacityPercentage < 5) {
        warnings.push("⚠️ WARNING: Less than 5% lending capacity remaining.");
      } else if (lendingCapacityPercentage < 10) {
        warnings.push("⚠️ CAUTION: Less than 10% lending capacity remaining.");
      }
      
      if (actualMoneyAvailable < minimumReserveAmount) {
        warnings.push("🚨 CRITICAL: Actual money below minimum reserve requirement.");
      }
      
      if (totalProvisions > actualMoneyAvailable * 0.2) {
        warnings.push("⚠️ WARNING: High provision requirements (>20% of available funds).");
      }

      // ========================================
      // STEP 6: Build Response
      // ========================================
      
      const calculation: ActualMoneyCalculation = {
        // Inflows
        totalShareCapital: Math.round(totalShareCapital * 100) / 100,
        totalOperationalFundsAvailable: Math.round(totalOperationalFunds * 100) / 100,
        totalGrantedFundsAvailable: Math.round(totalGrantedFunds * 100) / 100,
        totalLoanRepaymentsReceived: Math.round(totalRepayments * 100) / 100,
        totalRetainedEarnings: Math.round(retainedEarnings * 100) / 100,
        
        // Outflows
        totalDisbursedLoans: Math.round(totalDisbursed * 100) / 100,
        totalOperationalExpenses: Math.round(totalExpenses * 100) / 100,
        totalReservedFunds: Math.round(totalReserved * 100) / 100,
        totalProvisionsRequired: Math.round(totalProvisions * 100) / 100,
        
        // Calculations
        totalInflows: Math.round(totalInflows * 100) / 100,
        totalOutflows: Math.round(totalOutflows * 100) / 100,
        actualMoneyAvailable: Math.round(actualMoneyAvailable * 100) / 100,
        maximumLendableAmount: Math.round(maximumLendableAmount * 100) / 100,
        
        // Metadata
        calculationDate: new Date(),
        organizationId,
        lendingCapacityPercentage: Math.round(lendingCapacityPercentage * 100) / 100,
        
        // Breakdown
        breakdown: {
          sources: {
            shareCapital: Math.round(totalShareCapital * 100) / 100,
            operationalFunds: Math.round(totalOperationalFunds * 100) / 100,
            grantedFunds: Math.round(totalGrantedFunds * 100) / 100,
            loanRepayments: Math.round(totalRepayments * 100) / 100,
            retainedEarnings: Math.round(retainedEarnings * 100) / 100
          },
          uses: {
            disbursedLoans: Math.round(totalDisbursed * 100) / 100,
            operationalExpenses: Math.round(totalExpenses * 100) / 100,
            reservedFunds: Math.round(totalReserved * 100) / 100
          },
          safetyBuffers: {
            provisionsRequired: Math.round(totalProvisions * 100) / 100,
            minimumReserveRatio: Math.round(minimumReserveRatio * 100),
            minimumReserveAmount: Math.round(minimumReserveAmount * 100) / 100
          }
        },
        
        warnings,
        canLendNewLoans: maximumLendableAmount > 0
      };

      console.log('=== ACTUAL MONEY CALCULATION COMPLETED ===');
      console.log('Actual Money Available:', calculation.actualMoneyAvailable);
      console.log('Maximum Lendable Amount:', calculation.maximumLendableAmount);

      return {
        success: true,
        message: "Actual money calculation completed successfully",
        data: calculation
      };

    } catch (error: any) {
      console.error("Calculate actual money error:", error);
      return {
        success: false,
        message: `Failed to calculate actual money available: ${error?.message || String(error)}`
      };
    }
  }

  /**
   * Helper: Calculate total share capital
   */
  private async calculateTotalShareCapital(organizationId: number): Promise<number> {
    const result = await this.shareCapitalRepo
      .createQueryBuilder('sc')
      .select('SUM(sc.totalContributedCapitalValue)', 'total')
      .where('sc.organizationId = :organizationId', { organizationId })
      .andWhere('sc.isActive = :isActive', { isActive: true })
      .andWhere('sc.isVerified = :isVerified', { isVerified: true })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /**
   * Helper: Calculate available operational funds
   */
  private async calculateAvailableOperationalFunds(organizationId: number): Promise<number> {
    const result = await this.operationalFundsRepo
      .createQueryBuilder('of')
      .select('SUM(of.amountCommitted - of.amountUtilized - of.amountReserved)', 'available')
      .where('of.organizationId = :organizationId', { organizationId })
      .andWhere('of.isActive = :isActive', { isActive: true })
      .andWhere('of.status IN (:...statuses)', { 
        statuses: [FundStatus.AVAILABLE, FundStatus.PARTIALLY_UTILIZED] 
      })
      .getRawOne();

    return Math.max(0, parseFloat(result?.available || '0'));
  }

  /**
   * Helper: Calculate available granted funds
   */
  private async calculateAvailableGrantedFunds(organizationId: number): Promise<number> {
    const result = await this.grantedFundsRepo
      .createQueryBuilder('gf')
      .select('SUM(gf.amountDisbursed - gf.amountUtilized)', 'available')
      .where('gf.organizationId = :organizationId', { organizationId })
      .andWhere('gf.isActive = :isActive', { isActive: true })
      .andWhere('gf.status IN (:...statuses)', { 
        statuses: [GrantStatus.DISBURSED, GrantStatus.APPROVED] 
      })
      .getRawOne();

    return Math.max(0, parseFloat(result?.available || '0'));
  }

  /**
   * Helper: Calculate total loan repayments received
   */
  private async calculateTotalLoanRepayments(organizationId: number): Promise<number> {
    const result = await this.transactionRepo
      .createQueryBuilder('txn')
      .innerJoin('txn.loan', 'loan')
      .select('SUM(txn.principalPaid)', 'total')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('txn.isActive = :isActive', { isActive: true })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /**
   * Helper: Calculate total disbursed loans (outstanding principal)
   */
  private async calculateTotalDisbursedLoans(organizationId: number): Promise<number> {
    const result = await this.loanRepo
      .createQueryBuilder('loan')
      .select('SUM(loan.outstandingPrincipal)', 'total')
      .where('loan.organizationId = :organizationId', { organizationId })
      .andWhere('loan.isActive = :isActive', { isActive: true })
      .andWhere('loan.status NOT IN (:...statuses)', { 
        statuses: [LoanStatus.CLOSED, LoanStatus.WRITTEN_OFF] 
      })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /**
   * Helper: Calculate operational expenses
   */
  private async calculateOperationalExpenses(organizationId: number): Promise<number> {
    const result = await this.operationalFundsRepo
      .createQueryBuilder('of')
      .select('SUM(of.amountUtilized)', 'total')
      .where('of.organizationId = :organizationId', { organizationId })
      .andWhere('of.isActive = :isActive', { isActive: true })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /**
   * Helper: Calculate reserved funds
   */
  private async calculateReservedFunds(organizationId: number): Promise<number> {
    const result = await this.operationalFundsRepo
      .createQueryBuilder('of')
      .select('SUM(of.amountReserved)', 'total')
      .where('of.organizationId = :organizationId', { organizationId })
      .andWhere('of.isActive = :isActive', { isActive: true })
      .getRawOne();

    return parseFloat(result?.total || '0');
  }

  /**
   * Helper: Calculate required provisions for bad loans
   */
  private async calculateRequiredProvisions(organizationId: number): Promise<number> {
    const loans = await this.loanRepo.find({
      where: { 
        organizationId,
        isActive: true 
      },
      relations: ['collaterals']
    });

    let totalProvisions = 0;

    for (const loan of loans) {
      const provision = loan.calculateProvisionRequired();
      totalProvisions += provision;
    }

    return totalProvisions;
  }

  /**
   * Validate if a specific loan amount can be disbursed
   */
  async canDisburseLoan(
    organizationId: number, 
    requestedAmount: number
  ): Promise<ServiceResponse<{ canDisburse: boolean; availableAmount: number; shortfall: number }>> {
    try {
      const calculation = await this.calculateActualMoney(organizationId);

      if (!calculation.success || !calculation.data) {
        return {
          success: false,
          message: "Failed to calculate available funds"
        };
      }

      const availableAmount = calculation.data.maximumLendableAmount;
      const canDisburse = requestedAmount <= availableAmount;
      const shortfall = canDisburse ? 0 : requestedAmount - availableAmount;

      return {
        success: true,
        message: canDisburse 
          ? "Loan can be disbursed" 
          : `Insufficient funds. Shortfall: ${shortfall.toFixed(2)}`,
        data: {
          canDisburse,
          availableAmount: Math.round(availableAmount * 100) / 100,
          shortfall: Math.round(shortfall * 100) / 100
        }
      };

    } catch (error: any) {
      console.error("Can disburse loan check error:", error);
      return {
        success: false,
        message: "Failed to validate loan disbursement"
      };
    }
  }
}