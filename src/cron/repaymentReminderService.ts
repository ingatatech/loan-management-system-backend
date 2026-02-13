

// @ts-nocheck
import cron from 'node-cron';
import { Repository } from 'typeorm';
import dbConnection from '../db';
import { Loan, LoanStatus } from '../entities/Loan';
import { RepaymentSchedule, PaymentStatus } from '../entities/RepaymentSchedule';
import { BorrowerProfile } from '../entities/BorrowerProfile';
import { ClientBorrowerAccount } from '../entities/ClientBorrowerAccount';
import { RepaymentReminder } from '../entities/RepaymentReminder';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Twilio configuration
const twilioClient = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN 
);

const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const RWANDA_COUNTRY_CODE = '+250';

// Message templates in English and Kinyarwanda
const MESSAGE_TEMPLATES = {
  english: {
    sevenDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) => 
      `Dear ${name}, this is a reminder that your loan payment installment ${installmentNumber} of RWF ${amount.toLocaleString()} is due on ${dueDate}. Please visit ${branch} branch to make your payment. Thank you.`,
    
    threeDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) =>
      `Dear ${name}, URGENT: Your loan payment installment ${installmentNumber} of RWF ${amount.toLocaleString()} is due in 3 days (${dueDate}). Please visit ${branch} branch. Thank you.`,
    
    oneDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) =>
      `Dear ${name}, FINAL REMINDER: Your loan payment installment ${installmentNumber} of RWF ${amount.toLocaleString()} is due TOMORROW (${dueDate}). Please visit ${branch} branch urgently. Thank you.`,
    
    overdue: (name: string, installmentNumber: number, amount: number, daysOverdue: number, branch: string) =>
      `Dear ${name}, Your loan payment installment ${installmentNumber} of RWF ${amount.toLocaleString()} is ${daysOverdue} day(s) overdue. Please contact ${branch} branch immediately. Thank you.`
  },
  
kinyarwanda: {
  sevenDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) =>
    `Muraho ${name}, turabibutsa ko igihembwe cya ${installmentNumber} cy’inguzanyo yanyu kingana na ${amount.toLocaleString()} RWF kigomba kwishyurwa ku wa ${dueDate}. Murisanga ku ishami rya ${branch} cyangwa mukatwandikira ku gihe. Murakoze.`,

  threeDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) =>
    `Muraho ${name}, turabamenyesha ko hasigaye iminsi 3 ngo igihembwe cya ${installmentNumber} cy’inguzanyo yanyu kingana na ${amount.toLocaleString()} RWF cyishyurwe (${dueDate}). Murisanga ku ishami rya ${branch} ku gihe. Murakoze ku bufatanye bwanyu.`,

  oneDay: (name: string, installmentNumber: number, amount: number, dueDate: string, branch: string) =>
    `Muraho ${name}, turabibutsa ko ejo ku wa ${dueDate} ari bwo igihembwe cya ${installmentNumber} cy’inguzanyo yanyu kingana na ${amount.toLocaleString()} RWF kigomba kwishyurwa. Murisanga ku ishami rya ${branch}. Murakoze.`,

  overdue: (name: string, installmentNumber: number, amount: number, daysOverdue: number, branch: string) =>
    `Muraho ${name}, tubandikiye tubamenyesha ko igihembwe cya ${installmentNumber} cy’inguzanyo yanyu kingana na ${amount.toLocaleString()} RWF cyarengeje igihe ho iminsi ${daysOverdue}. Turabasaba kugana ishami rya ${branch} cyangwa mukaduhamagara kugira ngo dukemure iki kibazo. Murakoze.`
}

};

interface ReminderStats {
  totalSchedulesChecked: number;
  reminders7Day: number;
  reminders3Day: number;
  reminders1Day: number;
  remindersOverdue: number;
  smsSent: number;
  smsFailed: number;
  duplicatesSkipped: number;
}

class RepaymentReminderService {
  private loanRepository: Repository<Loan>;
  private scheduleRepository: Repository<RepaymentSchedule>;
  private borrowerRepository: Repository<BorrowerProfile>;
  private clientAccountRepository: Repository<ClientBorrowerAccount>;
  private reminderRepository: Repository<RepaymentReminder>;

  constructor() {
    this.loanRepository = dbConnection.getRepository(Loan);
    this.scheduleRepository = dbConnection.getRepository(RepaymentSchedule);
    this.borrowerRepository = dbConnection.getRepository(BorrowerProfile);
    this.clientAccountRepository = dbConnection.getRepository(ClientBorrowerAccount);
    this.reminderRepository = dbConnection.getRepository(RepaymentReminder);
  }

  /**
   * Main function to check and send reminders
   */
  async checkAndSendReminders(): Promise<ReminderStats> {

    
    const stats: ReminderStats = {
      totalSchedulesChecked: 0,
      reminders7Day: 0,
      reminders3Day: 0,
      reminders1Day: 0,
      remindersOverdue: 0,
      smsSent: 0,
      smsFailed: 0,
      duplicatesSkipped: 0
    };

    try {
      // Calculate target dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const sevenDaysFromNow = new Date(today);
      sevenDaysFromNow.setDate(today.getDate() + 7);
      
      const threeDaysFromNow = new Date(today);
      threeDaysFromNow.setDate(today.getDate() + 3);
      
      const oneDayFromNow = new Date(today);
      oneDayFromNow.setDate(today.getDate() + 1);


      const activeLoans = await this.loanRepository.find({
        where: [
          { status: LoanStatus.DISBURSED, isActive: true },
          { status: LoanStatus.PERFORMING, isActive: true }
        ],
        relations: ['repaymentSchedules', 'borrower', 'clientAccount']
      });



      for (let i = 0; i < activeLoans.length; i++) {
        const loan = activeLoans[i];

        const borrowerInfo = await this.getBorrowerContactInfo(loan);
        
        if (borrowerInfo) {

          
          if (borrowerInfo.phone) {
            const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
      
          }
        }

        if (!loan.repaymentSchedules || loan.repaymentSchedules.length === 0) {
          continue;
        }

        // Check unpaid schedules
        const unpaidSchedules = loan.repaymentSchedules.filter(
          schedule => !schedule.isPaid && 
                     (schedule.paymentStatus === PaymentStatus.PENDING || 
                      schedule.paymentStatus === PaymentStatus.PARTIAL)
        );


        if (unpaidSchedules.length === 0) {
          continue;
        }

        stats.totalSchedulesChecked += unpaidSchedules.length;

        // Show details of unpaid schedules
        for (const schedule of unpaidSchedules) {
          const dueDate = new Date(schedule.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          
          const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          


          let reminderNeeded = false;
          let reminderType = '';

          // Check for 7-day reminder
          if (this.isSameDay(dueDate, sevenDaysFromNow)) {
            reminderNeeded = true;
            reminderType = '7-day';
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);

            }
            await this.processReminder(loan, schedule, '7-day', stats);
          }

          // Check for 3-day reminder
          if (this.isSameDay(dueDate, threeDaysFromNow)) {
            reminderNeeded = true;
            reminderType = '3-day';
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);

            }
            await this.processReminder(loan, schedule, '3-day', stats);
          }

          // Check for 1-day reminder
          if (this.isSameDay(dueDate, oneDayFromNow)) {
            reminderNeeded = true;
            reminderType = '1-day';
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);

            }
            await this.processReminder(loan, schedule, '1-day', stats);
          }

          // Check for overdue reminder
          if (dueDate < today && schedule.paymentStatus === PaymentStatus.OVERDUE) {
            reminderNeeded = true;
            reminderType = 'overdue';
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
   
            }
            await this.processReminder(loan, schedule, 'overdue', stats);
          }

        }
      }

      
      return stats;

    } catch (error) {

      throw error;
    }
  }

  /**
   * Process a single reminder
   */
  private async processReminder(
    loan: Loan, 
    schedule: RepaymentSchedule, 
    reminderType: '7-day' | '3-day' | '1-day' | 'overdue',
    stats: ReminderStats
  ): Promise<void> {
    try {
      
      // Check if reminder already sent
      const existingReminder = await this.reminderRepository.findOne({
        where: {
          scheduleId: schedule.id,
          reminderType: reminderType
        }
      });

      if (existingReminder) {
        stats.duplicatesSkipped++;
        return;
      }

      // Get borrower contact information
      const borrowerInfo = await this.getBorrowerContactInfo(loan);
      
      if (!borrowerInfo) {
        return;
      }


      
      if (!borrowerInfo.phone) {
        return;
      }


      const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
      
      if (!formattedPhone) {
        return;
      }

      const message = this.createReminderMessage(
        borrowerInfo.name,
        schedule.installmentNumber,
        parseFloat(schedule.dueTotal),
        new Date(schedule.dueDate),
        loan.branchName,
        reminderType,
        schedule.daysOverdue || 0
      );

      const smsSent = await this.sendReminderSMS(formattedPhone, message);

      if (smsSent) {
        await this.recordReminder(
          schedule.id,
          loan.id,
          borrowerInfo.borrowerId,
          reminderType,
          formattedPhone,
          message,
          'sent'
        );

        stats.smsSent++;
        
        // Update specific reminder type counter
        switch (reminderType) {
          case '7-day': stats.reminders7Day++; break;
          case '3-day': stats.reminders3Day++; break;
          case '1-day': stats.reminders1Day++; break;
          case 'overdue': stats.remindersOverdue++; break;
        }


      } else {
        stats.smsFailed++;
        
        // Record failed reminder
        await this.recordReminder(
          schedule.id,
          loan.id,
          borrowerInfo.borrowerId,
          reminderType,
          formattedPhone,
          message,
          'failed'
        );
      }

    } catch (error) {

      stats.smsFailed++;
    }
  }

  /**
   * Get borrower contact information
   */
  private async getBorrowerContactInfo(loan: Loan): Promise<{
    borrowerId: number | null;
    name: string;
    phone: string | null;
  } | null> {
    try {

      
      // For individual borrowers
      if (loan.borrowerType === 'individual' && loan.borrowerId) {

        
        const borrower = loan.borrower || await this.borrowerRepository.findOne({
          where: { id: loan.borrowerId }
        });

        if (borrower) {
          
          return {
            borrowerId: borrower.id,
            name: `${borrower.firstName} ${borrower.lastName}`,
            phone: borrower.primaryPhone
          };
        } else {
          // console.log(`            ❌ Borrower not found with ID: ${loan.borrowerId}`);
        }
      }

      // For institutional borrowers - check client account
      if (loan.hasClientAccount && loan.clientAccountId) {

        
        const clientAccount = loan.clientAccount || await this.clientAccountRepository.findOne({
          where: { id: loan.clientAccountId },
          relations: ['borrower']
        });

        if (clientAccount) {
     
          if (clientAccount.borrowerType === 'individual' && clientAccount.borrower) {
    
            return {
              borrowerId: clientAccount.borrower.id,
              name: clientAccount.borrowerNames || `${clientAccount.borrower.firstName} ${clientAccount.borrower.lastName}`,
              phone: clientAccount.borrower.primaryPhone
            };
          } else if (clientAccount.borrowerType === 'institution') {
     
            return {
              borrowerId: null,
              name: clientAccount.institutionName || 'Institution',
              phone: clientAccount.profileRepresentative?.phone || null
            };
          }
        } else {
          // console.log(`            ❌ Client account not found with ID: ${loan.clientAccountId}`);
        }
      }

      if (loan.institutionProfile) {

        return {
          borrowerId: null,
          name: loan.institutionProfile.institutionName || 'Institution',
          phone: loan.institutionProfile.contactPhone || null
        };
      }

      return null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Format phone number to E.164 format
   */
  private formatPhoneNumber(phone: string): string | null {
    if (!phone) return null;

    // Remove all spaces and special characters
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');

    // If already has +, validate format
    if (cleaned.startsWith('+')) {
      // Check if it's a valid international format
      if (/^\+\d{10,15}$/.test(cleaned)) {
        return cleaned;
      }
      return null;
    }

    // If starts with 250, add +
    if (cleaned.startsWith('250')) {
      return `+${cleaned}`;
    }

    // If starts with 0, replace with Rwanda country code
    if (cleaned.startsWith('0')) {
      cleaned = cleaned.substring(1);
      return `${RWANDA_COUNTRY_CODE}${cleaned}`;
    }

    // If it's just 9 digits, assume Rwanda number
    if (/^\d{9}$/.test(cleaned)) {
      return `${RWANDA_COUNTRY_CODE}${cleaned}`;
    }

    return null;
  }

  /**
   * Create reminder message
   */
  private createReminderMessage(
    name: string,
    installmentNumber: number,
    amount: number,
    dueDate: Date,
    branch: string,
    reminderType: '7-day' | '3-day' | '1-day' | 'overdue',
    daysOverdue: number = 0
  ): string {
    const formattedDate = this.formatDate(dueDate);
    
    // Default to Kinyarwanda for Rwanda-based borrowers
    const templates = MESSAGE_TEMPLATES.kinyarwanda;

    switch (reminderType) {
      case '7-day':
        return templates.sevenDay(name, installmentNumber, amount, formattedDate, branch);
      case '3-day':
        return templates.threeDay(name, installmentNumber, amount, formattedDate, branch);
      case '1-day':
        return templates.oneDay(name, installmentNumber, amount, formattedDate, branch);
      case 'overdue':
        return templates.overdue(name, installmentNumber, amount, daysOverdue, branch);
      default:
        return templates.sevenDay(name, installmentNumber, amount, formattedDate, branch);
    }
  }

  /**
   * Send SMS using Twilio
   */
  private async sendReminderSMS(phoneNumber: string, message: string): Promise<boolean> {
    try {

      const result = await twilioClient.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });


      return true;

    } catch (error: any) {
  

      return false;
    }
  }

  /**
   * Record reminder in database
   */
  private async recordReminder(
    scheduleId: number,
    loanId: number,
    borrowerId: number | null,
    reminderType: string,
    phoneNumber: string,
    messageContent: string,
    deliveryStatus: 'sent' | 'failed' | 'delivered'
  ): Promise<void> {
    try {
      
      const reminder = this.reminderRepository.create({
        scheduleId,
        loanId,
        borrowerId,
        reminderType,
        phoneNumber,
        messageContent,
        deliveryStatus,
        sentAt: new Date()
      });

      await this.reminderRepository.save(reminder);

    } catch (error) {

    }
  }

  /**
   * Check if two dates are the same day
   */
  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'long' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }


  initializeCronJobs(): void {

    cron.schedule('0 9 * * *', async () => {
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        // console.error('Error in 7-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // 3-day reminder: Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        // console.error('Error in 3-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // 1-day reminder: Daily at 5:00 PM (urgent)
    cron.schedule('0 17 * * *', async () => {
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        // console.error('Error in 1-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // Overdue reminder: Daily at 10:00 AM
    cron.schedule('0 10 * * *', async () => {
      // console.log('⏰ Running overdue reminder check at 10:00 AM');
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        // console.error('Error in overdue reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

  }

  /**
   * Manual trigger for testing (can be called from API endpoint)
   */
  async triggerManualReminder(): Promise<ReminderStats> {
    return await this.checkAndSendReminders();
  }
}

// Export singleton instance
export default new RepaymentReminderService();