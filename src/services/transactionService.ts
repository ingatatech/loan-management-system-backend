// @ts-nocheck
import { Repository, In } from "typeorm";
import { Transaction, TransactionStatus, VATTransactionType } from "../entities/Transaction";
import { TransactionLine, LineType } from "../entities/TransactionLine";
import { Account, AccountType } from "../entities/Account";
import { VATConfiguration, VATType } from "../entities/VATConfiguration";
import { Organization } from "../entities/Organization";
import dbConnection from "../db";

export interface SplitLineData {
  accountId: number;
  amount: number;
  description?: string;
}

export interface CreateTransactionData {
  transactionDate: Date;
  description: string;
  // Simple transaction (one debit, one credit)
  debitAccountId?: number;
  creditAccountId?: number;
  amount?: number;
  // Split transaction (multiple debits OR multiple credits)
  debitLines?: SplitLineData[];
  creditLines?: SplitLineData[];
  isVATApplied: boolean;
  vatTransactionType?: VATTransactionType;
  referenceNumber?: string;
  vatRate?: number;
}

export interface TransactionFilters {
  startDate?: Date;
  endDate?: Date;
  accountId?: number;
  status?: TransactionStatus;
  isVATApplied?: boolean;
  page?: number;
  limit?: number;
}

export interface ServiceResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export class TransactionService {
  constructor(
    private transactionRepository: Repository<Transaction>,
    private transactionLineRepository: Repository<TransactionLine>,
    private accountRepository: Repository<Account>,
    private vatConfigRepository: Repository<VATConfiguration>,
    private organizationRepository: Repository<Organization>
  ) {}

  async createTransaction(
    transactionData: CreateTransactionData,
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Verify organization
      const organization = await this.organizationRepository.findOne({
        where: { id: organizationId }
      });

      if (!organization) {
        throw new Error("Organization not found");
      }

      // Determine transaction type and construct lines
      const isSplitTransaction = !!(transactionData.debitLines || transactionData.creditLines);

      let debitLinesData: SplitLineData[] = [];
      let creditLinesData: SplitLineData[] = [];

      if (isSplitTransaction) {
        // Split transaction handling
        if (transactionData.debitLines && transactionData.debitLines.length > 0) {
          // Split Debit: Multiple debits, single credit
          if (!transactionData.creditAccountId) {
            throw new Error("Credit account is required for split debit transaction");
          }
          
          debitLinesData = transactionData.debitLines.map(line => ({
            accountId: line.accountId,
            amount: Number(line.amount),
            description: line.description || transactionData.description
          }));
          
          const totalDebit = debitLinesData.reduce((sum, line) => sum + line.amount, 0);
          creditLinesData = [{
            accountId: transactionData.creditAccountId,
            amount: totalDebit,
            description: transactionData.description
          }];
        } else if (transactionData.creditLines && transactionData.creditLines.length > 0) {
          // Split Credit: Single debit, multiple credits
          if (!transactionData.debitAccountId) {
            throw new Error("Debit account is required for split credit transaction");
          }
          
          creditLinesData = transactionData.creditLines.map(line => ({
            accountId: line.accountId,
            amount: Number(line.amount),
            description: line.description || transactionData.description
          }));
          
          const totalCredit = creditLinesData.reduce((sum, line) => sum + line.amount, 0);
          debitLinesData = [{
            accountId: transactionData.debitAccountId,
            amount: totalCredit,
            description: transactionData.description
          }];
        } else {
          throw new Error("Either debitLines or creditLines must be provided for split transaction");
        }
      } else {
        // Simple transaction
        if (!transactionData.debitAccountId || !transactionData.creditAccountId || !transactionData.amount) {
          throw new Error("debitAccountId, creditAccountId, and amount are required for simple transaction");
        }

        if (transactionData.amount <= 0) {
          throw new Error("Transaction amount must be positive");
        }

        debitLinesData = [{
          accountId: transactionData.debitAccountId,
          amount: Number(transactionData.amount),
          description: transactionData.description
        }];

        creditLinesData = [{
          accountId: transactionData.creditAccountId,
          amount: Number(transactionData.amount),
          description: transactionData.description
        }];
      }

      // Validate all accounts exist and belong to organization
      const allAccountIds = [
        ...debitLinesData.map(l => l.accountId),
        ...creditLinesData.map(l => l.accountId)
      ];

      const accounts = await this.accountRepository.find({
        where: {
          id: In(allAccountIds),
          organizationId,
          isActive: true
        }
      });

      if (accounts.length !== allAccountIds.length) {
        throw new Error("One or more accounts not found or inactive");
      }

      // Calculate total amounts before VAT
      const totalDebitAmount = debitLinesData.reduce((sum, line) => sum + line.amount, 0);
      const totalCreditAmount = creditLinesData.reduce((sum, line) => sum + line.amount, 0);

      // Validate balance before VAT
      if (Math.abs(totalDebitAmount - totalCreditAmount) >= 0.01) {
        throw new Error(
          `Transaction amounts must balance before VAT. Debits: ${totalDebitAmount.toFixed(2)}, Credits: ${totalCreditAmount.toFixed(2)}`
        );
      }

      // Generate transaction code
      const transactionCode = await this.generateTransactionCode(organizationId);

      // Create transaction
      const transaction = this.transactionRepository.create({
        transactionCode,
        transactionDate: transactionData.transactionDate,
        description: transactionData.description,
        organizationId,
        referenceNumber: transactionData.referenceNumber || null,
        isVATApplied: transactionData.isVATApplied,
        vatTransactionType: transactionData.vatTransactionType || null,
        totalAmount: totalDebitAmount,
        status: TransactionStatus.DRAFT,
        createdBy: userId
      });

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Create transaction lines
      const lines: TransactionLine[] = [];

      // Create debit lines
      for (const debitData of debitLinesData) {
        const debitLine = this.transactionLineRepository.create({
          transactionId: savedTransaction.id,
          accountId: debitData.accountId,
          lineType: LineType.DEBIT,
          amount: debitData.amount,
          description: debitData.description,
          vatRate: null,
          vatAmount: 0
        });
        lines.push(debitLine);
      }

      // Create credit lines
      for (const creditData of creditLinesData) {
        const creditLine = this.transactionLineRepository.create({
          transactionId: savedTransaction.id,
          accountId: creditData.accountId,
          lineType: LineType.CREDIT,
          amount: creditData.amount,
          description: creditData.description,
          vatRate: null,
          vatAmount: 0
        });
        lines.push(creditLine);
      }

      // Handle VAT if applied
      if (transactionData.isVATApplied) {
        const vatRate = transactionData.vatRate || await this.getDefaultVATRate(organizationId);
        const vatType = transactionData.vatTransactionType || VATTransactionType.EXPENSE;

        if (vatRate > 0) {
          let vatAmount: number;

          if (vatType === VATTransactionType.REVENUE) {
            // Output VAT (Sales): VAT = Base × (18/100)
            vatAmount = this.calculateOutputVAT(totalDebitAmount, vatRate);
            
            const outputVATAccount = await this.getOrCreateVATAccount(
              organizationId,
              VATType.OUTPUT,
              queryRunner
            );

            // Add VAT line to credits (Output VAT - we are credited)
            const vatLine = this.transactionLineRepository.create({
              transactionId: savedTransaction.id,
              accountId: outputVATAccount.id,
              lineType: LineType.CREDIT,
              amount: vatAmount,
              description: `Output VAT ${vatRate}% on ${transactionData.description}`,
              vatRate: vatRate,
              vatAmount: vatAmount
            });
            lines.push(vatLine);

            // Increase the debit side to balance
            const mainDebitLine = lines.find(l => l.lineType === LineType.DEBIT);
            if (mainDebitLine) {
              mainDebitLine.amount = Number((Number(mainDebitLine.amount) + vatAmount).toFixed(2));
            }

          } else {
            // Input VAT (Expenses): VAT = Purchase Price × (18/118)
            vatAmount = this.calculateInputVAT(totalCreditAmount, vatRate);

            const inputVATAccount = await this.getOrCreateVATAccount(
              organizationId,
              VATType.INPUT,
              queryRunner
            );

            // Add VAT line to debits (Input VAT - we are debited)
            const vatLine = this.transactionLineRepository.create({
              transactionId: savedTransaction.id,
              accountId: inputVATAccount.id,
              lineType: LineType.DEBIT,
              amount: vatAmount,
              description: `Input VAT ${vatRate}% on ${transactionData.description}`,
              vatRate: vatRate,
              vatAmount: vatAmount
            });
            lines.push(vatLine);

            // Increase the credit side to balance
            const mainCreditLine = lines.find(l => l.lineType === LineType.CREDIT);
            if (mainCreditLine) {
              mainCreditLine.amount = Number((Number(mainCreditLine.amount) + vatAmount).toFixed(2));
            }
          }

          savedTransaction.totalAmount = Number((totalDebitAmount + vatAmount).toFixed(2));
        }
      }

      // Save all lines
      await queryRunner.manager.save(lines);

      // Final balance validation
      const totalDebits = lines
        .filter(l => l.lineType === LineType.DEBIT)
        .reduce((sum, l) => sum + Number(l.amount), 0);

      const totalCredits = lines
        .filter(l => l.lineType === LineType.CREDIT)
        .reduce((sum, l) => sum + Number(l.amount), 0);

      if (Math.abs(totalDebits - totalCredits) >= 0.01) {
        throw new Error(
          `Transaction is not balanced after VAT. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`
        );
      }

      // Update account balances
      for (const line of lines) {
        const account = await queryRunner.manager.findOne(Account, {
          where: { id: line.accountId }
        });

        if (account) {
          account.updateBalance(line.amount, line.lineType === LineType.DEBIT);
          await queryRunner.manager.save(account);
        }
      }

      // Update transaction status to POSTED
      savedTransaction.status = TransactionStatus.POSTED;
      await queryRunner.manager.save(savedTransaction);

      await queryRunner.commitTransaction();

      // Load complete transaction with relations
      const completeTransaction = await this.transactionRepository.findOne({
        where: { id: savedTransaction.id },
        relations: ["transactionLines", "transactionLines.account"]
      });

      return {
        success: true,
        message: "Transaction created and posted successfully",
        data: completeTransaction
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Create transaction error:", error);
      return {
        success: false,
        message: error.message || "Failed to create transaction"
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Calculate Output VAT for Revenue/Sales
   * Formula: VAT = Base Amount × (rate/100)
   */
  private calculateOutputVAT(baseAmount: number, rate: number): number {
    const vatAmount = (Number(baseAmount) * Number(rate)) / 100;
    return Number(vatAmount.toFixed(2));
  }

  /**
   * Calculate Input VAT for Expenses
   * Formula: VAT = Purchase Price × (rate/(100 + rate))
   */
  private calculateInputVAT(purchasePrice: number, rate: number): number {
    const vatAmount = (Number(purchasePrice) * Number(rate)) / (100 + Number(rate));
    return Number(vatAmount.toFixed(2));
  }

  private async generateTransactionCode(organizationId: number): Promise<string> {
    const count = await this.transactionRepository.count({
      where: { organizationId }
    });

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId }
    });

    const prefix = organization?.name.substring(0, 3).toUpperCase() || "TXN";
    return `TXN-${prefix}-${String(count + 1).padStart(6, '0')}`;
  }

  private async getDefaultVATRate(organizationId: number): Promise<number> {
    const activeVAT = await this.vatConfigRepository.findOne({
      where: { 
        organizationId, 
        isActive: true
      },
      order: { effectiveFrom: "DESC" }
    });

    return activeVAT?.rate || 18;
  }

  private async getOrCreateVATAccount(
    organizationId: number,
    vatType: VATType,
    queryRunner: any
  ): Promise<Account> {
    const accountName = vatType === VATType.INPUT ? "Input VAT" : "Output VAT";
    
    let vatAccount = await this.accountRepository.findOne({
      where: { 
        organizationId, 
        accountName,
        isActive: true
      }
    });

    if (!vatAccount) {
      const accountType = vatType === VATType.INPUT ? "asset" : "liability";
      const accountCode = await this.generateVATAccountCode(organizationId, accountType);

      vatAccount = this.accountRepository.create({
        accountCode,
        accountName,
        accountType: accountType as any,
        accountCategory: accountType === "asset" ? "Current Asset" : "Current Liabilities",
        normalBalance: accountType === "asset" ? "debit" : "credit",
        organizationId,
        balance: 0,
        isActive: true
      });

      vatAccount = await queryRunner.manager.save(vatAccount);
    }

    return vatAccount;
  }

  private async generateVATAccountCode(organizationId: number, accountType: string): Promise<string> {
    const start = accountType === "asset" ? 150 : 200;
    const end = accountType === "asset" ? 199 : 249;

    const lastAccount = await this.accountRepository
      .createQueryBuilder("account")
      .where("account.organizationId = :organizationId", { organizationId })
      .andWhere("account.accountCode >= :start", { start })
      .andWhere("account.accountCode <= :end", { end })
      .orderBy("account.accountCode", "DESC")
      .getOne();

    return lastAccount ? String(parseInt(lastAccount.accountCode) + 1) : String(start);
  }

  async getTransactions(
    organizationId: number,
    filters: TransactionFilters = {}
  ): Promise<ServiceResponse> {
    try {
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const skip = (page - 1) * limit;

      const queryBuilder = this.transactionRepository
        .createQueryBuilder("transaction")
        .leftJoinAndSelect("transaction.transactionLines", "lines")
        .leftJoinAndSelect("lines.account", "account")
        .where("transaction.organizationId = :organizationId", { organizationId });

      if (filters.startDate && filters.endDate) {
        queryBuilder.andWhere("transaction.transactionDate BETWEEN :startDate AND :endDate", {
          startDate: filters.startDate,
          endDate: filters.endDate
        });
      }

      if (filters.status) {
        queryBuilder.andWhere("transaction.status = :status", { status: filters.status });
      }

      if (filters.isVATApplied !== undefined) {
        queryBuilder.andWhere("transaction.isVATApplied = :isVATApplied", {
          isVATApplied: filters.isVATApplied
        });
      }

      if (filters.accountId) {
        queryBuilder.andWhere("lines.accountId = :accountId", {
          accountId: filters.accountId
        });
      }

      const totalItems = await queryBuilder.getCount();

      const transactions = await queryBuilder
        .orderBy("transaction.transactionDate", "DESC")
        .addOrderBy("transaction.createdAt", "DESC")
        .skip(skip)
        .take(limit)
        .getMany();

      return {
        success: true,
        message: "Transactions retrieved successfully",
        data: transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error: any) {
      console.error("Get transactions error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve transactions"
      };
    }
  }

  async getTransactionById(
    transactionId: number,
    organizationId: number
  ): Promise<ServiceResponse> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { id: transactionId, organizationId },
        relations: ["transactionLines", "transactionLines.account"]
      });

      if (!transaction) {
        return {
          success: false,
          message: "Transaction not found"
        };
      }

      return {
        success: true,
        message: "Transaction retrieved successfully",
        data: transaction
      };
    } catch (error: any) {
      console.error("Get transaction error:", error);
      return {
        success: false,
        message: error.message || "Failed to retrieve transaction"
      };
    }
  }

  async reverseTransaction(
    transactionId: number,
    reason: string,
    organizationId: number,
    userId: number
  ): Promise<ServiceResponse> {
    const queryRunner = dbConnection.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      const originalTransaction = await this.transactionRepository.findOne({
        where: { id: transactionId, organizationId },
        relations: ["transactionLines", "transactionLines.account"]
      });

      if (!originalTransaction) {
        throw new Error("Transaction not found");
      }

      if (!originalTransaction.canBeReversed()) {
        throw new Error("Transaction cannot be reversed");
      }

      const reversalCode = `${originalTransaction.transactionCode}-REV`;

      const reversalTransaction = this.transactionRepository.create({
        transactionCode: reversalCode,
        transactionDate: new Date(),
        description: `Reversal of ${originalTransaction.transactionCode} - ${reason}`,
        organizationId,
        referenceNumber: originalTransaction.referenceNumber,
        isVATApplied: originalTransaction.isVATApplied,
        vatTransactionType: originalTransaction.vatTransactionType,
        totalAmount: originalTransaction.totalAmount,
        status: TransactionStatus.POSTED,
        reversedTransactionId: originalTransaction.id,
        reversalReason: reason,
        createdBy: userId
      });

      const savedReversalTransaction = await queryRunner.manager.save(reversalTransaction);

      const reversalLines: TransactionLine[] = [];

      for (const originalLine of originalTransaction.transactionLines) {
        const reversalLine = this.transactionLineRepository.create({
          transactionId: savedReversalTransaction.id,
          accountId: originalLine.accountId,
          lineType: originalLine.lineType === LineType.DEBIT ? LineType.CREDIT : LineType.DEBIT,
          amount: originalLine.amount,
          description: `Reversal: ${originalLine.description}`,
          vatRate: originalLine.vatRate,
          vatAmount: originalLine.vatAmount
        });
        reversalLines.push(reversalLine);

        const account = await queryRunner.manager.findOne(Account, {
          where: { id: originalLine.accountId }
        });

        if (account) {
          account.updateBalance(
            originalLine.amount, 
            originalLine.lineType === LineType.CREDIT
          );
          await queryRunner.manager.save(account);
        }
      }

      await queryRunner.manager.save(reversalLines);

      originalTransaction.status = TransactionStatus.REVERSED;
      await queryRunner.manager.save(originalTransaction);

      await queryRunner.commitTransaction();

      const completeReversalTransaction = await this.transactionRepository.findOne({
        where: { id: savedReversalTransaction.id },
        relations: ["transactionLines", "transactionLines.account"]
      });

      return {
        success: true,
        message: "Transaction reversed successfully",
        data: {
          originalTransaction,
          reversalTransaction: completeReversalTransaction
        }
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      console.error("Reverse transaction error:", error);
      return {
        success: false,
        message: error.message || "Failed to reverse transaction"
      };
    } finally {
      await queryRunner.release();
    }
  }
}