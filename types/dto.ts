import { UUID } from './database';

export interface CalculatePriceInput {
  baseCostPrice: number;
  paymentConditionId: UUID;
  depotId: UUID;
  companyId: UUID;
}

export interface TyphoonOCRResultItem {
  productCode: string;
  productName: string;
  baseCostPrice: number;
}

export interface TyphoonOCRResponse {
  rawText: string;
  items: TyphoonOCRResultItem[];
}

export interface CreateOrderDto {
  customerId: UUID;
  lineCustomerId?: UUID;
  depotId: UUID;
  paymentConditionId: UUID;
  deliveryLocation: string;
  items: Array<{ productCode: string; productName: string; liters: number; unitPrice: number }>;
}
