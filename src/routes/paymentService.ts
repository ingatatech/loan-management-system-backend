
// @ts-nocheck
import { Repository } from "typeorm";
import { Loan, LoanStatus } from "../entities/Loan";
import { RepaymentSchedule, ScheduleStatus } from "../entities/RepaymentSchedule";
import { RepaymentTransaction, PaymentMethod } from "../entities/RepaymentTransaction";
import { LoanClassification, LoanClass } from "../entities/LoanClassification";

export interface PaymentData {
    loanId: number;
    amountPaid: number;
    paymentDate: Date;
    paymentMethod: PaymentMethod;
    repaymentProof?: string;
    receivedBy?: string;
    notes?: string;
}

export interface PaymentResponse {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
}

export class PaymentService {
    constructor(
        private loanRepository: Repository<Loan>,
        private scheduleRepository: Repository<RepaymentSchedule>,
        private transactionRepository: Repository<RepaymentTransaction>,
        private classificationRepository: Repository<LoanClassification>
    ) { }

    async processPayment(paymentData: PaymentData, organizationId: number): Promise<PaymentResponse> {
        // Validate loan
        const loan = await this.loanRepository.findOne({
            where: { id: paymentData.loanId, organizationId },
            relations: ["repaymentSchedules", "borrower"]
        });

        if (!loan) {
            return {
                success: false,
                message: "Loan not found"
            };
        }

        if (loan.status === LoanStatus.CLOSED || loan.status === LoanStatus.WRITTEN_OFF) {
            return {
                success: false,
                message: "Cannot process payment for closed or written-off loan"
            };
        }

        // Get outstanding schedules ordered by due date
        const outstandingSchedules = await this.scheduleRepository.find({
            where: {
                loanId: paymentData.loanId,
                status: ['pending', 'partial', 'overdue'] as any
            },
            order: { dueDate: 'ASC' }
        });

        if (outstandingSchedules.length === 0) {
            return {
                success: false,
                message: "No outstanding payments found for this loan"
            };
        }
    }
}