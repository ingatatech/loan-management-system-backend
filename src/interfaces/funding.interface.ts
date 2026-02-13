export interface ShareCapitalRequest {
  shareholderId: number;
  shareholderType: 'individual' | 'institution';
  dateOfContribution: string;
  typeOfShare: 'ordinary' | 'preference' | 'cumulative_preference' | 'redeemable' | 'other';
  numberOfShares: number | string;
  valuePerShare: number | string;
  paymentDetails: {
    paymentMethod: string;
    paymentDate: string;
    paymentReference: string;
    bankName?: string;
    accountNumber?: string;
    transactionId?: string;
  };
  notes?: string;
}