

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
    console.log('\n');
    console.log('='.repeat(80));
    console.log('🔔 STARTING REPAYMENT REMINDER CHECK');
    console.log('='.repeat(80));
    console.log(`⏰ Current Time: ${new Date().toISOString()}`);
    console.log(`📅 Current Date: ${new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`);
    
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

      console.log('\n📆 TARGET DATES FOR REMINDERS:');
      console.log(`   Today:           ${this.formatDate(today)}`);
      console.log(`   7-day target:    ${this.formatDate(sevenDaysFromNow)}`);
      console.log(`   3-day target:    ${this.formatDate(threeDaysFromNow)}`);
      console.log(`   1-day target:    ${this.formatDate(oneDayFromNow)}`);

      // Find all active loans with status "disbursed" or "performing"
      console.log('\n🔍 QUERYING DATABASE FOR ACTIVE LOANS...');
      const activeLoans = await this.loanRepository.find({
        where: [
          { status: LoanStatus.DISBURSED, isActive: true },
          { status: LoanStatus.PERFORMING, isActive: true }
        ],
        relations: ['repaymentSchedules', 'borrower', 'clientAccount']
      });

      console.log(`\n📊 DATABASE QUERY RESULTS:`);
      console.log(`   Total active loans found: ${activeLoans.length}`);
      console.log(`   Loans with DISBURSED status: ${activeLoans.filter(l => l.status === LoanStatus.DISBURSED).length}`);
      console.log(`   Loans with PERFORMING status: ${activeLoans.filter(l => l.status === LoanStatus.PERFORMING).length}`);

      if (activeLoans.length === 0) {
        console.log('\n⚠️  WARNING: No active loans found in database!');
        console.log('   Please check:');
        console.log('   - Loan statuses are "disbursed" or "performing"');
        console.log('   - Loans have isActive = true');
        console.log('   - Database connection is working');
        return stats;
      }

      // Detailed analysis of each loan
      console.log('\n' + '='.repeat(80));
      console.log('📋 ANALYZING EACH LOAN AND ITS SCHEDULES');
      console.log('='.repeat(80));

      for (let i = 0; i < activeLoans.length; i++) {
        const loan = activeLoans[i];
        
        console.log(`\n[LOAN ${i + 1}/${activeLoans.length}] ${loan.loanId}`);
        console.log(`   Status: ${loan.status}`);
        console.log(`   Borrower Type: ${loan.borrowerType}`);
        console.log(`   Disbursed Amount: ${parseFloat(loan.disbursedAmount).toLocaleString()} RWF`);
        console.log(`   Total Schedules: ${loan.repaymentSchedules?.length || 0}`);

        // ✅ NEW: Get and display borrower contact info upfront for each loan
        console.log(`\n   📱 BORROWER CONTACT INFORMATION:`);
        const borrowerInfo = await this.getBorrowerContactInfo(loan);
        
        if (borrowerInfo) {
          console.log(`      ✅ Borrower Info Retrieved:`);
          console.log(`         Name: ${borrowerInfo.name}`);
          console.log(`         Borrower ID: ${borrowerInfo.borrowerId || 'N/A (Institution)'}`);
          console.log(`         Phone Number: ${borrowerInfo.phone || '❌ NOT AVAILABLE'}`);
          
          if (borrowerInfo.phone) {
            const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
            if (formattedPhone) {
              console.log(`         Formatted Phone (E.164): ${formattedPhone}`);
              console.log(`         ✅ VALID - SMS Receiver Ready`);
            } else {
              console.log(`         ❌ INVALID FORMAT - Cannot send SMS`);
              console.log(`         Please update phone number to valid format`);
            }
          } else {
            console.log(`         ⚠️  NO PHONE NUMBER - Cannot send reminders`);
            console.log(`         Action Required: Add phone number to borrower profile`);
          }
        } else {
          console.log(`      ❌ Could not retrieve borrower information`);
          console.log(`         Loan Type: ${loan.borrowerType}`);
          console.log(`         Borrower ID: ${loan.borrowerId || 'N/A'}`);
          console.log(`         Has Client Account: ${loan.hasClientAccount}`);
          console.log(`         Client Account ID: ${loan.clientAccountId || 'N/A'}`);
          console.log(`         ⚠️  This loan cannot receive SMS reminders`);
        }

        if (!loan.repaymentSchedules || loan.repaymentSchedules.length === 0) {
          console.log(`\n   ⚠️  WARNING: No repayment schedules found for this loan!`);
          console.log(`   Action Required: Generate repayment schedules for this loan`);
          continue;
        }

        // Check unpaid schedules
        const unpaidSchedules = loan.repaymentSchedules.filter(
          schedule => !schedule.isPaid && 
                     (schedule.paymentStatus === PaymentStatus.PENDING || 
                      schedule.paymentStatus === PaymentStatus.PARTIAL)
        );

        console.log(`\n   Unpaid Schedules: ${unpaidSchedules.length}`);
        console.log(`   Paid Schedules: ${loan.repaymentSchedules.length - unpaidSchedules.length}`);

        if (unpaidSchedules.length === 0) {
          console.log(`   ✅ All schedules are paid for this loan`);
          continue;
        }

        stats.totalSchedulesChecked += unpaidSchedules.length;

        // Show details of unpaid schedules
        console.log(`\n   📅 UNPAID SCHEDULES DETAILS:`);
        for (const schedule of unpaidSchedules) {
          const dueDate = new Date(schedule.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          
          const daysDiff = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          console.log(`      [Schedule #${schedule.installmentNumber}]`);
          console.log(`         Due Date: ${this.formatDate(dueDate)} (${daysDiff >= 0 ? daysDiff + ' days from now' : Math.abs(daysDiff) + ' days overdue'})`);
          console.log(`         Amount Due: ${parseFloat(schedule.dueTotal).toLocaleString()} RWF`);
          console.log(`         Payment Status: ${schedule.paymentStatus}`);
          console.log(`         Is Paid: ${schedule.isPaid}`);

          let reminderNeeded = false;
          let reminderType = '';

          // Check for 7-day reminder
          if (this.isSameDay(dueDate, sevenDaysFromNow)) {
            reminderNeeded = true;
            reminderType = '7-day';
            console.log(`         ✅ MATCHES 7-DAY REMINDER TARGET`);
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
              console.log(`         📧 Will send SMS to: ${formattedPhone || borrowerInfo.phone}`);
              console.log(`         📧 Recipient: ${borrowerInfo.name}`);
            }
            await this.processReminder(loan, schedule, '7-day', stats);
          }

          // Check for 3-day reminder
          if (this.isSameDay(dueDate, threeDaysFromNow)) {
            reminderNeeded = true;
            reminderType = '3-day';
            console.log(`         ✅ MATCHES 3-DAY REMINDER TARGET`);
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
              console.log(`         📧 Will send SMS to: ${formattedPhone || borrowerInfo.phone}`);
              console.log(`         📧 Recipient: ${borrowerInfo.name}`);
            }
            await this.processReminder(loan, schedule, '3-day', stats);
          }

          // Check for 1-day reminder
          if (this.isSameDay(dueDate, oneDayFromNow)) {
            reminderNeeded = true;
            reminderType = '1-day';
            console.log(`         ✅ MATCHES 1-DAY REMINDER TARGET`);
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
              console.log(`         📧 Will send SMS to: ${formattedPhone || borrowerInfo.phone}`);
              console.log(`         📧 Recipient: ${borrowerInfo.name}`);
            }
            await this.processReminder(loan, schedule, '1-day', stats);
          }

          // Check for overdue reminder
          if (dueDate < today && schedule.paymentStatus === PaymentStatus.OVERDUE) {
            reminderNeeded = true;
            reminderType = 'overdue';
            console.log(`         ⚠️  OVERDUE - NEEDS REMINDER`);
            if (borrowerInfo && borrowerInfo.phone) {
              const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
              console.log(`         📧 Will send SMS to: ${formattedPhone || borrowerInfo.phone}`);
              console.log(`         📧 Recipient: ${borrowerInfo.name}`);
            }
            await this.processReminder(loan, schedule, 'overdue', stats);
          }

          if (!reminderNeeded) {
            console.log(`         ℹ️  No reminder needed at this time`);
            console.log(`         Next reminder check dates:`);
            console.log(`            7-day reminder on: ${this.formatDate(new Date(dueDate.getTime() - 7 * 24 * 60 * 60 * 1000))}`);
            console.log(`            3-day reminder on: ${this.formatDate(new Date(dueDate.getTime() - 3 * 24 * 60 * 60 * 1000))}`);
            console.log(`            1-day reminder on: ${this.formatDate(new Date(dueDate.getTime() - 1 * 24 * 60 * 60 * 1000))}`);
          }
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log('✅ REMINDER CHECK COMPLETED');
      console.log('='.repeat(80));
      console.log('\n📊 FINAL STATISTICS:');
      console.log(`   Total Schedules Checked: ${stats.totalSchedulesChecked}`);
      console.log(`   7-Day Reminders: ${stats.reminders7Day}`);
      console.log(`   3-Day Reminders: ${stats.reminders3Day}`);
      console.log(`   1-Day Reminders: ${stats.reminders1Day}`);
      console.log(`   Overdue Reminders: ${stats.remindersOverdue}`);
      console.log(`   SMS Sent Successfully: ${stats.smsSent}`);
      console.log(`   SMS Failed: ${stats.smsFailed}`);
      console.log(`   Duplicates Skipped: ${stats.duplicatesSkipped}`);
      console.log('='.repeat(80));
      console.log('\n');
      
      return stats;

    } catch (error) {
      console.error('\n❌ ERROR IN REMINDER CHECK:');
      console.error(error);
      console.log('='.repeat(80));
      console.log('\n');
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
      console.log(`\n         🔄 PROCESSING ${reminderType.toUpperCase()} REMINDER:`);
      
      // Check if reminder already sent
      console.log(`         🔍 Checking for duplicate reminders...`);
      const existingReminder = await this.reminderRepository.findOne({
        where: {
          scheduleId: schedule.id,
          reminderType: reminderType
        }
      });

      if (existingReminder) {
        stats.duplicatesSkipped++;
        console.log(`         ⏭️  SKIPPED: Reminder already sent on ${existingReminder.sentAt.toISOString()}`);
        console.log(`            Delivery Status: ${existingReminder.deliveryStatus}`);
        return;
      }
      console.log(`         ✅ No duplicate found - proceeding with reminder`);

      // Get borrower contact information
      console.log(`         📞 Getting borrower contact information...`);
      const borrowerInfo = await this.getBorrowerContactInfo(loan);
      
      if (!borrowerInfo) {
        console.log(`         ⚠️  ERROR: Could not retrieve borrower information`);
        console.log(`            Loan ID: ${loan.loanId}`);
        console.log(`            Borrower Type: ${loan.borrowerType}`);
        console.log(`            Borrower ID: ${loan.borrowerId}`);
        console.log(`            Has Client Account: ${loan.hasClientAccount}`);
        return;
      }

      console.log(`         ✅ Borrower Info Retrieved:`);
      console.log(`            Name: ${borrowerInfo.name}`);
      console.log(`            Phone: ${borrowerInfo.phone || 'NOT FOUND'}`);
      console.log(`            Borrower ID: ${borrowerInfo.borrowerId}`);
      
      if (!borrowerInfo.phone) {
        console.log(`         ❌ FAILED: No phone number available for borrower`);
        return;
      }

      // Format phone number
      console.log(`         📱 Formatting phone number...`);
      console.log(`            Original: ${borrowerInfo.phone}`);
      const formattedPhone = this.formatPhoneNumber(borrowerInfo.phone);
      
      if (!formattedPhone) {
        console.log(`         ❌ FAILED: Invalid phone number format`);
        console.log(`            Could not convert to E.164 format`);
        return;
      }
      console.log(`            Formatted: ${formattedPhone}`);

      // Create reminder message
      console.log(`         💬 Creating reminder message...`);
      const message = this.createReminderMessage(
        borrowerInfo.name,
        schedule.installmentNumber,
        parseFloat(schedule.dueTotal),
        new Date(schedule.dueDate),
        loan.branchName,
        reminderType,
        schedule.daysOverdue || 0
      );
      console.log(`            Message length: ${message.length} characters`);
      console.log(`            Preview: ${message.substring(0, 100)}...`);

      // Send SMS
      console.log(`         📤 Sending SMS via Twilio...`);
      const smsSent = await this.sendReminderSMS(formattedPhone, message);

      if (smsSent) {
        // Record reminder in database
        console.log(`         💾 Recording reminder in database...`);
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

        console.log(`         ✅ SUCCESS: ${reminderType} reminder sent and recorded`);
        console.log(`            Loan: ${loan.loanId}`);
        console.log(`            Schedule: #${schedule.installmentNumber}`);
        console.log(`            Phone: ${formattedPhone}`);
      } else {
        stats.smsFailed++;
        
        // Record failed reminder
        console.log(`         ❌ SMS SENDING FAILED - Recording failure...`);
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
      console.error(`         ❌ EXCEPTION in processReminder:`, error);
      console.error(`            Schedule ID: ${schedule.id}`);
      console.error(`            Loan ID: ${loan.id}`);
      console.error(`            Reminder Type: ${reminderType}`);
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
      console.log(`         📋 Attempting to get borrower contact info...`);
      console.log(`            Loan Type: ${loan.borrowerType}`);
      
      // For individual borrowers
      if (loan.borrowerType === 'individual' && loan.borrowerId) {
        console.log(`            Strategy: Individual borrower lookup`);
        console.log(`            Borrower ID: ${loan.borrowerId}`);
        
        const borrower = loan.borrower || await this.borrowerRepository.findOne({
          where: { id: loan.borrowerId }
        });

        if (borrower) {
          console.log(`            ✅ Borrower found in database`);
          console.log(`               Name: ${borrower.firstName} ${borrower.lastName}`);
          console.log(`               Primary Phone: ${borrower.primaryPhone || 'NOT SET'}`);
          console.log(`               Alternative Phone: ${borrower.alternativePhone || 'NOT SET'}`);
          
          return {
            borrowerId: borrower.id,
            name: `${borrower.firstName} ${borrower.lastName}`,
            phone: borrower.primaryPhone
          };
        } else {
          console.log(`            ❌ Borrower not found with ID: ${loan.borrowerId}`);
        }
      }

      // For institutional borrowers - check client account
      if (loan.hasClientAccount && loan.clientAccountId) {
        console.log(`            Strategy: Client account lookup`);
        console.log(`            Client Account ID: ${loan.clientAccountId}`);
        
        const clientAccount = loan.clientAccount || await this.clientAccountRepository.findOne({
          where: { id: loan.clientAccountId },
          relations: ['borrower']
        });

        if (clientAccount) {
          console.log(`            ✅ Client account found`);
          console.log(`               Account Number: ${clientAccount.accountNumber}`);
          console.log(`               Borrower Type: ${clientAccount.borrowerType}`);
          
          if (clientAccount.borrowerType === 'individual' && clientAccount.borrower) {
            console.log(`               Strategy: Using individual from client account`);
            console.log(`               Borrower: ${clientAccount.borrower.firstName} ${clientAccount.borrower.lastName}`);
            console.log(`               Phone: ${clientAccount.borrower.primaryPhone || 'NOT SET'}`);
            
            return {
              borrowerId: clientAccount.borrower.id,
              name: clientAccount.borrowerNames || `${clientAccount.borrower.firstName} ${clientAccount.borrower.lastName}`,
              phone: clientAccount.borrower.primaryPhone
            };
          } else if (clientAccount.borrowerType === 'institution') {
            console.log(`               Strategy: Using institution contact person`);
            console.log(`               Institution: ${clientAccount.institutionName}`);
            console.log(`               Representative: ${JSON.stringify(clientAccount.profileRepresentative)}`);
            
            // For institutions, use contact person phone
            return {
              borrowerId: null,
              name: clientAccount.institutionName || 'Institution',
              phone: clientAccount.profileRepresentative?.phone || null
            };
          }
        } else {
          console.log(`            ❌ Client account not found with ID: ${loan.clientAccountId}`);
        }
      }

      // Fallback to institution profile if available
      if (loan.institutionProfile) {
        console.log(`            Strategy: Institution profile fallback`);
        console.log(`               Institution: ${loan.institutionProfile.institutionName}`);
        console.log(`               Contact Phone: ${loan.institutionProfile.contactPhone || 'NOT SET'}`);
        
        return {
          borrowerId: null,
          name: loan.institutionProfile.institutionName || 'Institution',
          phone: loan.institutionProfile.contactPhone || null
        };
      }

      console.log(`            ❌ No valid borrower contact info found for loan ${loan.loanId}`);
      return null;

    } catch (error) {
      console.error(`            ❌ Exception in getBorrowerContactInfo:`, error);
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
      console.log(`         📡 Initiating Twilio API call...`);
      console.log(`            From: ${TWILIO_PHONE_NUMBER}`);
      console.log(`            To: ${phoneNumber}`);
      console.log(`            Message: "${message}"`);
      
      const result = await twilioClient.messages.create({
        body: message,
        from: TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      console.log(`         ✅ Twilio API Response:`);
      console.log(`            Message SID: ${result.sid}`);
      console.log(`            Status: ${result.status}`);
      console.log(`            Direction: ${result.direction}`);
      console.log(`            Date Created: ${result.dateCreated}`);
      
      return true;

    } catch (error: any) {
      console.error(`         ❌ Twilio API Error:`);
      console.error(`            Phone Number: ${phoneNumber}`);
      console.error(`            Error Code: ${error.code || 'N/A'}`);
      console.error(`            Error Message: ${error.message}`);
      console.error(`            More Info: ${error.moreInfo || 'N/A'}`);
      
      if (error.code === 21211) {
        console.error(`            ⚠️  Invalid phone number format`);
      } else if (error.code === 21608) {
        console.error(`            ⚠️  Phone number is not verified (trial account limitation)`);
      } else if (error.code === 20003) {
        console.error(`            ⚠️  Authentication error - check Twilio credentials`);
      }
      
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
      console.log(`         💾 Creating reminder record...`);
      console.log(`            Schedule ID: ${scheduleId}`);
      console.log(`            Loan ID: ${loanId}`);
      console.log(`            Borrower ID: ${borrowerId || 'N/A'}`);
      console.log(`            Type: ${reminderType}`);
      console.log(`            Status: ${deliveryStatus}`);
      
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
      console.log(`         ✅ Reminder record saved to database (ID: ${reminder.id})`);

    } catch (error) {
      console.error(`         ❌ Error saving reminder to database:`, error);
      console.error(`            This may cause duplicate reminders in future runs!`);
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

  /**
   * Initialize all cron jobs
   */
  initializeCronJobs(): void {
    console.log('🚀 Initializing repayment reminder cron jobs...');

    // 7-day reminder: Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Running 7-day reminder check at 9:00 AM');
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        console.error('Error in 7-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // 3-day reminder: Daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('⏰ Running 3-day reminder check at 9:00 AM');
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        console.error('Error in 3-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // 1-day reminder: Daily at 5:00 PM (urgent)
    cron.schedule('0 17 * * *', async () => {
      console.log('⏰ Running 1-day reminder check at 5:00 PM');
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        console.error('Error in 1-day reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    // Overdue reminder: Daily at 10:00 AM
    cron.schedule('0 10 * * *', async () => {
      console.log('⏰ Running overdue reminder check at 10:00 AM');
      try {
        await this.checkAndSendReminders();
      } catch (error) {
        console.error('Error in overdue reminder cron:', error);
      }
    }, {
      timezone: 'Africa/Kigali'
    });

    console.log('✅ All cron jobs initialized successfully');
  }

  /**
   * Manual trigger for testing (can be called from API endpoint)
   */
  async triggerManualReminder(): Promise<ReminderStats> {
    console.log('🧪 Manual reminder trigger activated');
    return await this.checkAndSendReminders();
  }
}

// Export singleton instance
export default new RepaymentReminderService();